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
import ODataDate from "sap/ui/model/odata/type/Date";
import ODataDecimal from "sap/ui/model/odata/type/Decimal";

/**
 * @namespace siagrob1.controller.storageTransactions
 */
export default class Detail extends BaseController {

	onInit(): void  {	
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
    void this.loadRoyaltyBalance(id);
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
    try {
      const ctx = (this.getModel() as ODataModel).bindContext(`/RoyaltyTransactionBalances(${key})`);
      const row = await ctx.requestObject() as { NetWeight: number, WrittenOffWeight: number, Balance: number };
      // Resposta atrasada de outro romaneio não pode sobrescrever o atual.
      if ((this.getView().getBindingContext()?.getProperty("Key") as string) !== key) {
        return;
      }
      ui.setProperty("/royaltyBalance", {
        netText: fmt.format(row.NetWeight), writtenOffText: fmt.format(row.WrittenOffWeight), balanceText: fmt.format(row.Balance),
      });
    } catch {
      // Romaneio não elegível (pendente, sem situação, saída...): seção sem saldo.
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
