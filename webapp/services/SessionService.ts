import Dialog from "sap/m/Dialog";
import Text from "sap/m/Text";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import UIComponent from "sap/ui/core/UIComponent";
import Theming from "sap/ui/core/Theming";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import formatter from "siagrob1/model/formatter";
import { BranchInfo } from "siagrob1/types/BranchInfo";
import { SystemInfo } from "siagrob1/types/SystemInfo";
import { AuthStatus, LoginResult, UserIdentity } from "siagrob1/types/UserIdentity";

export const USER_MENU_KEY = "USER_MENU";
export const SYSTEM_SETUP_KEY = "SYSTEM_SETUP";

/**
 * Tema espelhado localmente. Sobrevive ao logout de propósito: é preferência do navegador para o
 * boot seguinte, não dado de sessão - e o servidor continua sendo a fonte da verdade.
 */
export const THEME_KEY = "THEME";

/** Mesmo tema declarado no bootstrap do `index.html`. */
export const DEFAULT_THEME = "sap_fiori_3";

/** Temas oferecidos na tela de perfil - a lista precisa bater com a aceita pelo servidor. */
export const AVAILABLE_THEMES = [
  { key: "sap_fiori_3", text: "Quartz (claro)" },
  { key: "sap_fiori_3_dark", text: "Quartz (escuro)" },
  { key: "sap_horizon", text: "Horizon (claro)" },
  { key: "sap_horizon_dark", text: "Horizon (escuro)" }
];

export type Credentials = {
  Username: string;
  Password: string;
};

/**
 * Dono único do estado de sessão do usuário.
 *
 * Concentra as chamadas REST de autenticação, a escrita no `sessionModel`,
 * a limpeza do storage local e o controle de inatividade. Controllers e o
 * Component apenas consomem esta API - não manipulam o estado diretamente.
 */
class SessionService {
  private readonly IDLE_TIMEOUT = 30 * 60 * 1000;   // 30 min
  private readonly WARNING_TIME = 28 * 60 * 1000;   // aviso com 2 min

  private component: UIComponent;
  private idleTimer?: number;
  private warningTimer?: number;
  private warningDialog?: Dialog;
  private watching = false;
  private listenersAttached = false;

  /** Cache do status vindo do servidor. `undefined` = ainda não consultado. */
  private authenticated?: boolean;

  /** Última filial conhecida - evita reconsultar o servidor na shell. */
  private branchInfo?: BranchInfo;

  private markReady: () => void;
  private readonly ready = new Promise<void>(resolve => this.markReady = resolve);

  /** Notificados sempre que a sessão termina de carregar (boot e login). */
  private readonly sessionReadyHandlers: (() => void)[] = [];

  private readonly activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];

  /** Referência única e estável - permite remover os listeners depois. */
  private readonly onActivity = (): void => this.resetTimers();

  /**
   * Liga o serviço ao Component. Deve ser chamado uma única vez, no
   * `Component.init()`, antes da inicialização do router.
   */
  public init(component: UIComponent): void {
    this.component = component;
    this.attachActivityListeners();
  }

  /* ------------------------------------------------------------------ */
  /* Autenticação                                                        */
  /* ------------------------------------------------------------------ */

  public async login(credentials: Credentials): Promise<void> {
    // A própria resposta do login traz o usuário: aproveitá-la evita uma segunda ida ao
    // /status só para saber quem entrou.
    const result = await new RequestModel().post(ServerRoutes.login, credentials) as LoginResult;

    this.authenticated = true;
    this.getSessionModel().setProperty("/logged", true);
    this.applyUserIdentity(result?.user);

    // Uma falha ao carregar menu/filial não invalida o login já concedido.
    try {
      await this.hydrate();
    } catch (error) {
      console.warn("Falha ao carregar os dados da sessão.", error);
    }

    this.startIdleWatch();
  }

  /**
   * Encerra a sessão no servidor e limpa o estado local. A limpeza e o
   * redirecionamento acontecem mesmo que o POST falhe - caso contrário o
   * usuário ficaria preso numa sessão inválida.
   */
  public async logout(): Promise<void> {
    try {
      await this.postWithoutBody(ServerRoutes.logout);
    } catch (error) {
      console.warn("Falha ao encerrar a sessão no servidor.", error);
    } finally {
      this.clearSessionState();
      this.navToLogin();
    }
  }

  /** Consulta `/security/auth/status` e atualiza o cache. */
  public async refreshStatus(): Promise<boolean> {
    try {
      const status = await new RequestModel().get<AuthStatus>(ServerRoutes.userInfo);
      this.authenticated = !!status?.authenticated;
      this.applyUserIdentity(this.authenticated ? status : undefined);
    } catch (error) {
      console.warn("Falha ao consultar o status da sessão.", error);
      this.authenticated = false;
      this.applyUserIdentity(undefined);
    }

    this.getSessionModel().setProperty("/logged", this.authenticated);
    return this.authenticated;
  }

  /**
   * Leitura síncrona do cache - usada pelo guard de rota, que não pode
   * aguardar uma requisição. O cache é preenchido no boot e revalidado
   * no login, no aviso de inatividade e em respostas 401.
   */
  public isAuthenticated(): boolean {
    return this.authenticated === true;
  }

  /**
   * Resolve quando o boot da sessão terminou (status consultado e, se houver
   * sessão, dados carregados). A shell usa isso para não competir com o boot.
   */
  public whenReady(): Promise<void> {
    return this.ready;
  }

  /** Sinaliza o fim do boot. Chamado apenas pelo Component. */
  public notifyReady(): void {
    this.markReady();
  }

  /** Assina o fim de cada carga de sessão (boot com sessão válida e login). */
  public attachSessionReady(handler: () => void): void {
    this.sessionReadyHandlers.push(handler);
  }

  /* ------------------------------------------------------------------ */
  /* Estado da sessão                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Carrega tudo que a shell precisa depois de autenticado: menu do usuário,
   * nome da empresa, filial padrão e configuração do sistema.
   */
  public async hydrate(): Promise<void> {
    this.applyCachedMenu();

    await Promise.all([
      this.loadUserMenu(),
      this.loadSystemInfo(),
      this.loadBranchInfo(),
      this.loadSystemSetup()
    ]);

    this.sessionReadyHandlers.forEach(handler => handler());
  }

  /**
   * Publica quem está logado no `sessionModel`. `undefined` limpa - é o que acontece no logout e
   * quando o /status responde que não há sessão.
   *
   * Quem decide de fato o que o usuário pode alterar é o servidor; isto existe para a tela não
   * oferecer uma ação que vai voltar recusada.
   */
  private applyUserIdentity(identity?: UserIdentity): void {
    const sessionModel = this.getSessionModel();
    sessionModel.setProperty("/userName", identity?.username ?? null);
    sessionModel.setProperty("/isAdmin", identity?.isAdmin === true);
    sessionModel.setProperty("/fullName", identity?.fullName ?? null);
    sessionModel.setProperty("/email", identity?.email ?? null);
    sessionModel.setProperty("/initials", formatter.formatInitials(identity?.fullName));
    sessionModel.setProperty("/permissions", identity?.permissions ?? []);

    this.applyPhoto(identity?.hasPhoto === true);
    this.applyTheme(identity?.theme);
  }

  /** Administrador passa por cima de qualquer permissão, como no servidor. */
  public hasPermission(code: string): boolean {
    const sessionModel = this.getSessionModel();

    if (sessionModel.getProperty("/isAdmin") === true) {
      return true;
    }

    const permissions = (sessionModel.getProperty("/permissions") ?? []) as string[];

    return permissions.includes(code);
  }

  /**
   * Publica a URL da foto do avatar.
   *
   * `null` (e não string vazia) quando não há foto: o `Avatar` do UI5 só cai para as iniciais
   * quando o `src` está ausente - com uma URL que responde 204 ele mostraria o ícone de imagem
   * quebrada.
   */
  private applyPhoto(hasPhoto: boolean): void {
    this.getSessionModel().setProperty(
      "/photoUrl",
      hasPhoto ? `${ServerRoutes.myPhoto}?v=${Date.now()}` : null
    );
  }

  /**
   * Recarrega a foto depois de o usuário trocá-la. O `?v=` muda a URL: sem isso o browser
   * continuaria exibindo a imagem antiga, que já está no cache.
   */
  public refreshPhoto(hasPhoto: boolean): void {
    this.applyPhoto(hasPhoto);
  }

  /**
   * Aplica o tema do usuário.
   *
   * O valor do servidor manda, mas fica espelhado em `localStorage` para o boot seguinte: sem o
   * cache, toda entrada no sistema renderizaria primeiro no tema padrão e trocaria depois que o
   * `/status` respondesse - um piscar visível a cada carregamento.
   */
  public applyTheme(theme?: string): void {
    if (theme) {
      window.localStorage.setItem(THEME_KEY, theme);
    }

    const effective = theme ?? window.localStorage.getItem(THEME_KEY);

    this.getSessionModel().setProperty("/theme", effective ?? DEFAULT_THEME);

    if (effective && Theming.getTheme() !== effective) {
      Theming.setTheme(effective);
    }
  }

  /** Lê o tema guardado localmente - usado no boot, antes de haver resposta do servidor. */
  public applyCachedTheme(): void {
    const cached = window.localStorage.getItem(THEME_KEY);

    if (cached && Theming.getTheme() !== cached) {
      Theming.setTheme(cached);
    }
  }

  /** Filial corrente já carregada, sem ida ao servidor. */
  public getBranchInfo(): BranchInfo {
    return this.branchInfo;
  }

  public async loadBranchInfo(): Promise<BranchInfo> {
    const branchInfo = await new RequestModel().get<BranchInfo>(ServerRoutes.getBranchInfo);

    this.branchInfo = branchInfo;

    this.getSessionModel().setProperty(
      "/branchInfo",
      branchInfo?.code ? ` - ${branchInfo.shortName} / ${formatter.formatCnpj(branchInfo.taxId)}` : null
    );

    return branchInfo;
  }

  public async setDefaultBranch(branchCode: string): Promise<void> {
    // Estes endpoints respondem 200 com corpo vazio - pedir "json" faria o
    // jQuery falhar no parse e rejeitar uma requisição bem sucedida.
    await this.postWithoutBody(ServerRoutes.setDefaultBranch, { BranchCode: branchCode });
  }

  /** Zera tudo que identifica o usuário: modelos, storage, timers e cache. */
  public clearSessionState(): void {
    this.stopIdleWatch();
    this.closeWarningDialog();

    this.authenticated = false;
    this.branchInfo = undefined;

    const sessionModel = this.getSessionModel();
    sessionModel.setProperty("/logged", false);
    sessionModel.setProperty("/branchInfo", null);
    sessionModel.setProperty("/systemInfo", null);
    this.applyUserIdentity(undefined);

    this.getMenuModel()?.setData({});

    window.localStorage.removeItem(USER_MENU_KEY);
    window.localStorage.removeItem(SYSTEM_SETUP_KEY);
  }

  /* ------------------------------------------------------------------ */
  /* Inatividade                                                         */
  /* ------------------------------------------------------------------ */

  public startIdleWatch(): void {
    this.watching = true;
    this.resetTimers();
  }

  public stopIdleWatch(): void {
    this.watching = false;
    this.clearTimers();
  }

  private attachActivityListeners(): void {
    if (this.listenersAttached) {
      return;
    }

    this.activityEvents.forEach(event => document.addEventListener(event, this.onActivity));
    this.listenersAttached = true;
  }

  private clearTimers(): void {
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }

    if (this.warningTimer) {
      window.clearTimeout(this.warningTimer);
      this.warningTimer = undefined;
    }
  }

  private resetTimers(): void {
    if (!this.watching) {
      return;
    }

    this.clearTimers();

    this.warningTimer = window.setTimeout(() => this.showWarning(), this.WARNING_TIME);
    this.idleTimer = window.setTimeout((): void => { void this.expireSession(); }, this.IDLE_TIMEOUT);
  }

  private showWarning(): void {
    // Um aviso já na tela não deve ser empilhado por um novo disparo.
    if (this.warningDialog) {
      return;
    }

    const dialog = new Dialog({
      title: "Sessão prestes a expirar",
      type: "Message",
      content: new Text({
        text: "Sua sessão irá expirar em 2 minutos. Deseja continuar?"
      }),
      beginButton: new Button({
        text: "Continuar sessão",
        press: () => {
          dialog.close();
          void this.renewSession();
        }
      }),
      endButton: new Button({
        text: "Sair",
        press: () => {
          dialog.close();
          void this.expireSession();
        }
      }),
      afterClose: () => {
        dialog.destroy();
        this.warningDialog = undefined;
      }
    });

    this.warningDialog = dialog;
    dialog.open();
  }

  /**
   * Destrói o aviso imediatamente - o `afterClose` não dispara quando a
   * sessão termina sem ação do usuário, e o diálogo modal sobreviveria à
   * navegação para o login.
   */
  private closeWarningDialog(): void {
    this.warningDialog?.destroy();
    this.warningDialog = undefined;
  }

  /**
   * Só renova se o servidor confirmar que a sessão ainda vale - antes, um 401
   * aqui reiniciava os timers silenciosamente.
   */
  private async renewSession(): Promise<void> {
    if (await this.refreshStatus()) {
      this.resetTimers();
      return;
    }

    await this.expireSession();
  }

  private async expireSession(): Promise<void> {
    this.stopIdleWatch();
    await this.logout();
  }

  /* ------------------------------------------------------------------ */
  /* Auxiliares                                                          */
  /* ------------------------------------------------------------------ */

  private applyCachedMenu(): void {
    const cached = window.localStorage.getItem(USER_MENU_KEY);
    if (cached) {
      this.getMenuModel()?.setData(JSON.parse(cached) as object);
    }
  }

  private async loadUserMenu(): Promise<void> {
    const userMenu = await new RequestModel().get<object>(ServerRoutes.userMenu);

    window.localStorage.setItem(USER_MENU_KEY, JSON.stringify(userMenu));
    this.getMenuModel()?.setData(userMenu);
  }

  private async loadSystemInfo(): Promise<void> {
    const systemInfo = await new RequestModel().get<SystemInfo>(ServerRoutes.systemInfo);
    this.getSessionModel().setProperty("/systemInfo", systemInfo?.companyName);

    // Modo de integração: as telas de usuário usam isto para saber quem manda no cadastro.
    this.getSessionModel().setProperty("/erp", systemInfo?.erp ?? "STANDALONE");
  }

  /** `true` quando o cadastro de usuários é mantido no SAP Business One. */
  public isSapMode(): boolean {
    return this.getSessionModel().getProperty("/erp") === "SAPB1";
  }

  private async loadSystemSetup(): Promise<void> {
    const func = (this.component.getModel() as ODataModel).bindContext("/SystemSetupGetActive(...)");

    await func.invoke();

    window.localStorage.setItem(SYSTEM_SETUP_KEY, JSON.stringify(func.getBoundContext().getObject()));
  }

  /** POST cuja resposta não é JSON (corpo vazio). */
  private postWithoutBody(url: string, payload?: object): JQuery.jqXHR {
    return new RequestModel().request(
      url,
      "POST",
      payload ? JSON.stringify(payload) : "",
      "application/json",
      "text"
    );
  }

  private navToLogin(): void {
    this.component.getRouter().navTo("login", {}, undefined, true);
  }

  private getSessionModel(): JSONModel {
    return this.component.getModel("sessionModel") as JSONModel;
  }

  private getMenuModel(): JSONModel {
    return this.component.getModel("menu") as JSONModel;
  }
}

export default new SessionService();
