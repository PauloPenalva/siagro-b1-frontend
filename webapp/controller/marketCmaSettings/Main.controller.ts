import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { marketFetch, MarketResult, notFoundTextKey } from "siagrob1/helpers/MarketHelpers";
import { CmaSettings } from "siagrob1/types/MarketQuote";

/**
 * Integração CMA (credenciais do feed de cotações). Gravar exige o papel ADMIN no servidor; aqui
 * quem não é ADMIN só vê. A senha nunca volta da API: `hasPassword` indica que existe uma, e
 * senha vazia no Salvar significa "manter".
 *
 * @namespace siagrob1.controller.marketCmaSettings
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "cma");
    this.getRouter().getRoute("marketCmaSettings").attachPatternMatched(() => void this.load());
  }

  private model(): JSONModel {
    return this.getView().getModel("cma") as JSONModel;
  }

  private show(settings?: CmaSettings, moduleDisabled = false, moduleMessage = ""): void {
    this.model().setData({
      enabled: settings?.enabled ?? false,
      host: settings?.host ?? "",
      userName: settings?.userName ?? "",
      password: "",
      // Conta sem senha: é uma escolha gravada (o servidor guarda a senha vazia cifrada), não um campo esquecido.
      blankPassword: settings?.blankPassword ?? false,
      loadedBlankPassword: settings?.blankPassword ?? false,
      passwordPlaceholder: settings?.hasPassword && !settings?.blankPassword ? this.bundle.getText("marketCmaPasswordKept") : "",
      isAdmin: SessionService.hasRole("ADMIN"),
      moduleDisabled,
      moduleMessage,
    });
  }

  private async load(): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    this.show();
    this.setBusy(true);
    try {
      const result = await marketFetch<CmaSettings>("GET", ServerRoutes.marketCmaSettings);
      if (!result.ok) {
        if (result.status === 404) {
          this.show(undefined, true, this.bundle.getText(notFoundTextKey(result.moduleDisabled)));
          return;
        }
        this.showError(result);
        return;
      }
      this.show(result.data);
    } finally {
      this.setBusy(false);
    }
  }

  /** Marcar "sem senha" limpa o que estava digitado: o campo de senha fica bloqueado enquanto a marca existir. */
  onBlankPasswordToggle(): void {
    if (this.model().getProperty("/blankPassword")) this.model().setProperty("/password", "");
  }

  async onSave(): Promise<void> {
    const data = this.model().getData() as CmaSettings & { loadedBlankPassword?: boolean };
    const blankPassword = !!data.blankPassword;
    const password = blankPassword ? "" : data.password ?? "";
    // Desmarcou "sem senha" e não digitou nada: o servidor manteria a senha vazia e a marca voltaria sozinha.
    if (data.loadedBlankPassword && !blankPassword && !password) {
      MessageBox.warning(this.bundle.getText("marketCmaPasswordRequired"));
      return;
    }
    this.setBusy(true);
    try {
      const result = await marketFetch<CmaSettings>("PUT", ServerRoutes.marketCmaSettings, {
        enabled: !!data.enabled,
        host: (data.host ?? "").trim(),
        userName: (data.userName ?? "").trim() || null,
        // Vazio = manter a senha gravada; "sem senha" manda gravar a senha vazia.
        password: password || null,
        blankPassword,
      });
      if (!result.ok) {
        this.showError(result);
        return;
      }
      this.show(result.data);
      MessageToast.show(this.bundle.getText("marketCmaSaved"));
    } finally {
      this.setBusy(false);
    }
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.bundle.getText(notFoundTextKey(result.moduleDisabled)));
      return;
    }
    MessageBox.error(result.message || this.bundle.getText(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }
}
