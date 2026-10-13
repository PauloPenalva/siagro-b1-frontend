import RoyaltyFieldsHelper from "siagrob1/controller/royalties/RoyaltyFieldsHelper";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/m/Table";
import ColumnListItem from "sap/m/ColumnListItem";
import Text from "sap/m/Text";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ODataDate from "sap/ui/model/odata/type/Date";
import ODataDecimal from "sap/ui/model/odata/type/Decimal";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import Fragment from "sap/ui/core/Fragment";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import { canGenerateCustody, custodyStepState, custodyUsageFilter, isCustodyPriceValid, isPurchaseRole, StorageCustodyStep, StorageCustodySummary } from "siagrob1/helpers/StorageCustodyHelpers";

/**
 * @namespace siagrob1.controller.storageTransactions
 */
export default class Detail extends BaseController {

	/** Último romaneio cujo saldo foi pedido; descarta respostas atrasadas. */
	private royaltyRequestedKey = "";

	private custodyDialog?: Dialog;

	/** Formatter da situação da etapa (usado na tabela). */
	custodyStepState = custodyStepState;

	onInit(): void  {
		this.getView().setModel(new JSONModel({ visible: false, loadError: "", canGenerate: false, summary: undefined, dialog: {} }), "custody");
		this.getRouter().getRoute("storageTransactionsDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    
		if (id != null) {

      this.setData(id);

			return;
		}

	}

  private setData(id: string){
    const systemSetup = this.getSystemSetup();
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", false);
    uiModel.setProperty("/currency", this.formatter.formatCurrencySymbol(systemSetup.DefaultCurrency));
      
		const sPath = `/StorageTransactions(${id})`;
		this.bindElement(sPath);
    void RoyaltyFieldsHelper.applyToBoundRecord(this, false, (ctx) => ctx.getProperty("TransactionType") !== "Purchase");
    // royaltyVisible é definida de forma assíncrona pelo helper; a seção cuida da visibilidade,
    // então as baixas e o saldo são carregados para todo registro (barato; não elegível = sem saldo).
    this.bindRoyaltyLines(id);
    this.royaltyRequestedKey = id;
    void this.loadRoyaltyBalance(id);
    void this.loadCustody(id);
  }

  /**
   * Notas de custódia (spec backend 2026-10-12 §5): só STANDALONE; em SAPB1 a seção some e nada é pedido. Resposta de
   * outro romaneio (o usuário navegou enquanto esperava) é descartada.
   */
  private async loadCustody(id: string): Promise<void> {
    const model = this.getView().getModel("custody") as JSONModel;
    model.setData({ visible: false, loadError: "", canGenerate: false, summary: undefined, dialog: {} });

    const isStandalone = (await this.getSystemInfo())?.erp?.trim().toUpperCase() === "STANDALONE";
    if (!isStandalone) return;

    const result = await sendJson("GET", `${ServerRoutes.storageTransactionsCustodySummary}(Key=${id})`);
    const current = (this.getView().getBindingContext() as Context | undefined)?.getProperty("Key") as string;
    if (current && current.toLowerCase() !== id.toLowerCase()) return;

    if (!result.ok) {
      model.setProperty("/visible", true);
      model.setProperty("/loadError", result.message);
      return;
    }

    const summary = odataValue<StorageCustodySummary>(result.data);
    model.setProperty("/summary", summary);
    model.setProperty("/visible", summary.Applies);
    model.setProperty("/canGenerate", canGenerateCustody(summary, true));
  }

  async onOpenCustodyDialog(): Promise<void> {
    const model = this.getView().getModel("custody") as JSONModel;
    const summary = model.getProperty("/summary") as StorageCustodySummary;
    const missing = summary.Steps.filter((s) => s.Situation === "Missing");
    model.setProperty("/dialog", { roles: missing, usageCode: null, usageName: "", unitPrice: null, priceInvalid: false });
    this.selectCustodyRole(summary.NextRole);

    if (!this.custodyDialog) {
      this.custodyDialog = await Fragment.load({
        id: this.getView().getId(),
        name: "siagrob1.view.storageTransactions.fragments.CustodyDocumentDialog",
        controller: this,
      }) as Dialog;
      this.getView().addDependent(this.custodyDialog);
    }
    this.custodyDialog.open();
  }

  /** Etapa escolhida: troca a natureza (é por papel) e mostra a quantidade que a nota terá. */
  private selectCustodyRole(role: string): void {
    const model = this.getView().getModel("custody") as JSONModel;
    const step = (model.getProperty("/dialog/roles") as StorageCustodyStep[]).find((s) => s.Role === role);
    model.setProperty("/dialog/role", role);
    model.setProperty("/dialog/quantity", step?.ExpectedQuantity ?? null);
    model.setProperty("/dialog/usageCode", null);
    model.setProperty("/dialog/usageName", "");
  }

  onCustodyRoleChange(): void {
    const model = this.getView().getModel("custody") as JSONModel;
    this.selectCustodyRole(model.getProperty("/dialog/role") as string);
  }

  async onCustodyUsageValueHelp(): Promise<void> {
    const model = this.getView().getModel("custody") as JSONModel;
    const role = model.getProperty("/dialog/role") as string;
    const selected = await DialogHelper.openTableSelectDialog(
      this, "UsagesSelectDialog", ["Name", "Description"],
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined, custodyUsageFilter(role));
    if (!selected) return;
    model.setProperty("/dialog/usageCode", selected.getProperty("Code"));
    model.setProperty("/dialog/usageName", selected.getProperty("Name"));
  }

  async onConfirmCustody(): Promise<void> {
    const model = this.getView().getModel("custody") as JSONModel;
    const dialog = model.getProperty("/dialog") as { role: string; usageCode: number; unitPrice: number; priceInvalid: boolean };
    if (!dialog.usageCode) { MessageBox.warning("Escolha a natureza da etapa."); return; }
    if (dialog.priceInvalid || !isCustodyPriceValid(dialog.unitPrice)) { MessageBox.warning("Informe o preço unitário da nota."); return; }

    const key = (this.getView().getBindingContext() as Context).getProperty("Key") as string;
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.storageTransactionsCreateCustodyDocument,
        { StorageTransactionKey: key, Role: dialog.role, UsageCode: dialog.usageCode, UnitPrice: dialog.unitPrice });
      if (!result.ok) { MessageBox.error(result.message); return; }
      this.custodyDialog?.close();
      MessageToast.show("Nota criada. Confira transporte e pesos e emita a NF-e.", { closeOnBrowserNavigation: false });
      const created = odataValue<string>(result.data);
      this.navTo(isPurchaseRole(dialog.role) ? "purchaseInvoicesDetail" : "salesInvoicesDetail", { id: created });
    } finally {
      this.setBusy(false);
    }
  }

  onCustodyPriceValidationError(ev: Event): void {
    const input = ev.getSource<Input>();
    input.setValueState("Error");
    input.setValueStateText("Preço unitário inválido.");
    (this.getView().getModel("custody") as JSONModel).setProperty("/dialog/priceInvalid", true);
  }

  onCustodyPriceValidationSuccess(ev: Event): void {
    ev.getSource<Input>().setValueState("None");
    (this.getView().getModel("custody") as JSONModel).setProperty("/dialog/priceInvalid", false);
  }

  onCancelCustody(): void { this.custodyDialog?.close(); }

  onOpenCustodyDocument(ev: Event): void {
    const ctx = ev.getSource<Control>().getBindingContext("custody");
    const key = ctx?.getProperty("DocumentKey") as string;
    if (!key) return;
    this.navTo(ctx.getProperty("IsSalesInvoice") ? "salesInvoicesDetail" : "purchaseInvoicesDetail", { id: key });
  }

  private bindRoyaltyLines(key: string): void {
    const table = this.byId("royaltyLinesTable") as Table;
    table.bindItems({
      path: "/RoyaltyWriteOffLines",
      parameters: { $expand: "RoyaltyWriteOff", $filter: `StorageTransactionKey eq ${key}` },
      template: new ColumnListItem({
        cells: [
          new Text({ text: { path: "RoyaltyWriteOff/WriteOffDate", type: new ODataDate({ pattern: "dd/MM/yyyy" }) } }),
          new Text({ text: "{RoyaltyWriteOff/ItsId}" }),
          new Text({ text: "{RoyaltyWriteOff/TaxId}" }),
          new Text({ text: "{RoyaltyWriteOff/Name}" }),
          new Text({ text: { path: "Weight", type: new ODataDecimal({ maxFractionDigits: 3 } as ConstructorParameters<typeof ODataDecimal>[0]) } }),
          new Text({ text: { path: "RoyaltyWriteOff/Status", targetType: "any", formatter: (s: string) => (s === "Cancelled" ? "Cancelada" : "Ativa") } }),
        ],
      }),
    });
  }

  private async loadRoyaltyBalance(key: string): Promise<void> {
    const ui = this.getModel("ui") as JSONModel;
    const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
    ui.setProperty("/royaltyBalance", { netText: "-", writtenOffText: "-", balanceText: "-" });
    // Lista filtrada (vazia quando não elegível) em vez de leitura por chave, que daria 404 e popup global.
    const binding = (this.getModel() as ODataModel).bindList(
      "/RoyaltyTransactionBalances", undefined, undefined, [new Filter("StorageTransactionKey", FilterOperator.EQ, key)],
    );
    try {
      const contexts = await binding.requestContexts(0, 1);
      // Resposta atrasada de outro romaneio não pode sobrescrever o atual.
      if (this.royaltyRequestedKey !== key) {
        return;
      }
      if (contexts.length > 0) {
        const row = contexts[0].getObject() as { NetWeight: number, WrittenOffWeight: number, Balance: number };
        ui.setProperty("/royaltyBalance", {
          netText: fmt.format(row.NetWeight), writtenOffText: fmt.format(row.WrittenOffWeight), balanceText: fmt.format(row.Balance),
        });
      }
    } catch (error) {
      console.warn("Falha ao carregar o saldo de royalty do romaneio", error);
    } finally {
      binding.destroy();
    }
  }

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("storageTransactionsEdit", {id: oContext.getProperty("Key") as string });
    }
  }


  navToStorageTransactionsList() {
    this.navTo("storageTransactions");
  }

  async onReject() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Cancelar o romaneio ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/StorageTransactionsCancel(...)");
      action.setParameter("Key", oContext.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio cancelado com sucesso.");
          this.navToStorageTransactionsList()
        })
        .finally(()=> this.setBusy(false))
    }


  }

  async onReverse() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Estornar o romaneio ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/StorageTransactionsReverse(...)");
      const key = oContext.getProperty("Key") as string;
      action.setParameter("Key", key);

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio estornado com sucesso.");
          this.setData(key)
        })
        .finally(()=> this.setBusy(false))
    }


  }
}
