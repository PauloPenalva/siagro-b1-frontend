import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import { Router$RouteMatchedEvent } from "sap/ui/core/routing/Router";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { AppVersion } from "siagrob1/types/AppVersion";

/**
 * Detecta que uma nova versão do frontend foi publicada e faz a aba se atualizar.
 *
 * Sem isto o usuário só via a versão nova depois de um Ctrl+F5 - e quem esquecia
 * seguia operando o sistema antigo. O serviço consulta o servidor de tempos em
 * tempos, avisa na tela e, se o aviso for ignorado, recarrega sozinho assim que
 * for seguro fazê-lo.
 */
class VersionService {
  private readonly POLL_INTERVAL = 15 * 60 * 1000;    // 15 min
  private readonly IDLE_BEFORE_RELOAD = 2 * 60 * 1000; // 2 min parado

  /** Janela mínima entre duas consultas - alternar de aba repetidamente não vira rajada. */
  private readonly MIN_CHECK_GAP = 30 * 1000;

  private component: UIComponent;
  private pollTimer?: number;
  private reloadTimer?: number;
  private started = false;

  /** Build que está de fato rodando nesta aba. Definido na primeira consulta. */
  private baseline?: string;

  /** Já detectamos versão nova: o aviso está na tela e o poll foi encerrado. */
  private updatePending = false;

  private lastCheck = 0;
  private currentRoute = "";
  private activityListenersAttached = false;

  private readonly activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];

  /** Referências únicas e estáveis - permitem remover os listeners depois. */
  private readonly onActivity = (): void => this.armReloadTimer();

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      void this.check();
    }
  };

  /**
   * Liga o serviço ao Component. Deve ser chamado no `Component.init()`, antes da
   * inicialização do router - é lá que passamos a acompanhar a rota corrente.
   */
  public init(component: UIComponent): void {
    this.component = component;

    // Precisa nascer explicitamente `false`: um binding que resolve para `undefined`
    // faz o UI5 aplicar o valor padrão da propriedade, e o padrão de `visible` é
    // `true` - sem isto o aviso aparece já no boot.
    this.getUiModel().setProperty("/updateAvailable", false);

    component.getRouter().attachRouteMatched((event: Router$RouteMatchedEvent) => {
      this.currentRoute = event.getParameter("name");
    });
  }

  /**
   * Começa a acompanhar a versão publicada. Idempotente.
   *
   * É chamado já no boot, e não só depois do login: a primeira consulta é o que
   * define a baseline, e ela precisa refletir o build que acabou de ser carregado.
   * Se esperássemos o login, uma aba parada na tela de login durante um deploy
   * assumiria o build novo como baseline e nunca perceberia que está desatualizada.
   */
  public start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    void this.check();
    this.pollTimer = window.setInterval((): void => { void this.check(); }, this.POLL_INTERVAL);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Recarrega a página. Os headers de cache do Gateway garantem que venha o build novo. */
  public applyUpdate(): void {
    window.location.reload();
  }

  /* ------------------------------------------------------------------ */
  /* Consulta                                                            */
  /* ------------------------------------------------------------------ */

  private async check(): Promise<void> {
    if (this.updatePending) {
      return;
    }

    const now = Date.now();
    if (now - this.lastCheck < this.MIN_CHECK_GAP) {
      return;
    }
    this.lastCheck = now;

    let published: AppVersion;

    try {
      published = await new RequestModel().get<AppVersion>(ServerRoutes.appVersion);
    } catch (error) {
      // Uma falha aqui não pode atrapalhar quem está usando o sistema: na próxima
      // rodada tentamos de novo.
      console.warn("Falha ao consultar a versão publicada.", error);
      return;
    }

    // Sem `buildId` o servidor não hospeda o frontend (dev server): nada a comparar.
    if (!published?.buildId) {
      return;
    }

    if (!this.baseline) {
      this.baseline = published.buildId;
      return;
    }

    if (published.buildId !== this.baseline) {
      this.notifyUpdate(published.version);
    }
  }

  /** Mostra o aviso na shell e passa a esperar o momento seguro de recarregar. */
  private notifyUpdate(version: string): void {
    this.updatePending = true;
    this.stopPolling();

    console.info(`Nova versão do frontend publicada: ${version}.`);

    this.getUiModel().setProperty("/updateAvailable", true);

    this.attachActivityListeners();
    this.armReloadTimer();
  }

  private getUiModel(): JSONModel {
    return this.component.getModel("ui") as JSONModel;
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /* ------------------------------------------------------------------ */
  /* Recarga por inatividade                                             */
  /* ------------------------------------------------------------------ */

  private attachActivityListeners(): void {
    if (this.activityListenersAttached) {
      return;
    }

    this.activityEvents.forEach(event => document.addEventListener(event, this.onActivity));
    this.activityListenersAttached = true;
  }

  private armReloadTimer(): void {
    if (!this.updatePending) {
      return;
    }

    window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout((): void => this.reloadIfSafe(), this.IDLE_BEFORE_RELOAD);
  }

  private reloadIfSafe(): void {
    // Recarregar por cima de um cadastro em digitação perderia o trabalho do usuário.
    // Nessas telas o aviso continua visível e a decisão fica com ele.
    if (this.isEditingRoute()) {
      this.armReloadTimer();
      return;
    }

    this.applyUpdate();
  }

  /**
   * As rotas de criação e edição seguem convenção estável no `manifest.json`
   * (`parceirosNegocioAdd`, `armazensNew`, `produtosEdit`, ...).
   */
  private isEditingRoute(): boolean {
    return /(Add|New|Edit)$/.test(this.currentRoute);
  }
}

export default new VersionService();
