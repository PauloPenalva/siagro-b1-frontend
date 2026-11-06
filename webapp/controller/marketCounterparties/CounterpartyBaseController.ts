import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import Form from "sap/ui/layout/form/Form";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import BaseController from "../BaseController";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";
import { MarketCounterpartyAccount } from "siagrob1/types/MarketHedges";

/**
 * Base das telas de inclusão/alteração de corretora ou banco: cabeçalho OData deferido + contas na
 * navegação `Accounts`, gravados juntos num único `$batch` (mesmo molde da tabela de preços).
 *
 * @namespace siagrob1.controller.marketCounterparties
 */
export default class CounterpartyBaseController extends BaseController {
  protected bundle?: ResourceBundle;
  private ownRoute?: string;
  /** A rota própria é a ativa: só então a saída dela descarta pendências. */
  private routeActive = false;
  /** Sobe a cada saída da rota: carga assíncrona de uma visita que já acabou não pode mexer no model. */
  protected leaveSeq = 0;

  /**
   * O `UpdateGroup` é do app inteiro: sair da tela com edição pendente deixaria cabeçalho transitório e
   * contas para o próximo `submitBatch` de QUALQUER tela. Ao ir para outra rota, descarta tudo.
   */
  protected watchLeave(ownRoute: string): void {
    this.ownRoute = ownRoute;
    this.getRouter().getRoute(ownRoute).attachPatternMatched(() => { this.routeActive = true; });
    this.getRouter().attachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  onExit(): void {
    this.getRouter().detachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  private readonly onBeforeRouteMatched = (ev: Router$BeforeRouteMatchedEvent): void => {
    if (!this.routeActive || ev.getParameter("name") === this.ownRoute) return;
    this.routeActive = false;
    this.leaveSeq++;
    this.discardChanges();
  };

  /** Desfaz o que estiver pendente no grupo (inclui contextos transitórios) e solta o contexto da tela. */
  protected discardChanges(): void {
    const model = this.getView().getModel() as ODataModel;
    const groupId = model.getUpdateGroupId();
    if (model.hasPendingChanges(groupId)) model.resetChanges(groupId);
    this.getView().setBindingContext(null);
  }

  protected initModels(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
  }

  /** Prepara a tela: permissão, textos e limpa pendências. */
  protected async prepare(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    clearFieldStates(this.byId("formMarketCounterparty") as Form);
    const model = this.getView().getModel() as ODataModel;
    if (model.hasPendingChanges(model.getUpdateGroupId())) model.resetChanges(model.getUpdateGroupId());
  }

  protected text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private accountsTable(): Table {
    return this.byId("tableCounterpartyAccounts") as Table;
  }

  private accountsBinding(): ODataListBinding {
    return this.accountsTable().getBinding("rows") as ODataListBinding;
  }

  onAddAccount(): void {
    const account: MarketCounterpartyAccount = { Code: "", Description: "", Active: true };
    this.accountsBinding().create(account, false, true, false);
  }

  onRemoveAccount(): void {
    const context = this.getSelectRowContext(this.accountsTable());
    if (!context) {
      MessageBox.alert(this.text("marketAccountSelectToRemove"));
      return;
    }
    const model = this.getView().getModel() as ODataModel;
    void context.delete(model.getUpdateGroupId()).catch((): void => undefined);
  }

  /** Confere as contas; devolve a mensagem do primeiro problema ou `null`. */
  private accountsProblem(): string {
    const contexts = this.accountsBinding().getAllCurrentContexts();
    const seen = new Set<string>();
    for (let index = 0; index < contexts.length; index++) {
      const code = ((contexts[index].getProperty("Code") as string) ?? "").trim().toLowerCase();
      if (!code) return this.text("marketAccountErrorAt", [String(index + 1), this.text("marketAccountCodeRequired")]);
      if (seen.has(code)) return this.text("marketAccountErrorAt", [String(index + 1), this.text("marketAccountCodeDuplicated")]);
      seen.add(code);
    }
    return null;
  }

  /**
   * Grava cabeçalho + contas num `$batch`. Só navega quando nada ficou pendente;
   * cadastro NOVO abre a edição do próprio cadastro.
   */
  protected async save(successKey: string): Promise<void> {
    if (!validateRequiredFields(this.byId("formMarketCounterparty") as Form)) {
      MessageBox.warning(this.text("commonRequiredFields"));
      return;
    }
    const problem = this.accountsProblem();
    if (problem) {
      MessageBox.warning(problem);
      return;
    }
    const model = this.getView().getModel() as ODataModel;
    const header = this.getView().getBindingContext() as Context;
    const wasTransient = header?.isTransient() === true;
    try {
      this.setBusy(true);
      await model.submitBatch(model.getUpdateGroupId());
    } catch {
      // Falha de rede/servidor: o grupo mantém as pendências e o usuário segue na página para tentar de novo.
      MessageBox.error(this.text("marketCounterpartySaveFailed"));
      return;
    } finally {
      this.setBusy(false);
    }
    if (model.hasPendingChanges(model.getUpdateGroupId())) return;

    MessageToast.show(this.text(successKey), { closeOnBrowserNavigation: false });
    const id = wasTransient ? String(header.getProperty("Id")) : "";
    if (/^\d+$/.test(id)) this.navTo("marketCounterpartiesEdit", { id }, true);
    else this.navTo("marketCounterparties", {}, true);
  }

  onCancel(): void {
    this.discardChanges();
    this.onNavBack();
  }
}
