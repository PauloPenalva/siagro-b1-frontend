import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import Context from "sap/ui/model/odata/v4/Context";
import Dialog from "sap/m/Dialog";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * @namespace siagrob1.controller.storageAddresses
 */
export default class Main extends BaseController {

  formatter = { ...formatter }

  private closeLotDialog?: Dialog;

	onInit(): void {
		this.getRouter().getRoute("storageAddresses").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void {
		(this.getView().byId("tableLoteArmazenagem").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Description", FilterOperator.Contains, query),
        new Filter("ItemCode", FilterOperator.Contains, query),
        new Filter("CardCode", FilterOperator.Contains, query),
        new Filter("Code", FilterOperator.Contains, query),
 			],
			and: false,
		});

		(this.getView().byId("tableLoteArmazenagem").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
			this.navTo("storageAddressesNew");
	}

	onEdit(): void {
		const oTable = this.byId("tableLoteArmazenagem") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Code") as string;
    
		this.navTo("storageAddressesEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableLoteArmazenagem") as Table;
		
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    const oBindingContext = oTable.getContextByIndex(i) as Context;
 
		if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
			try{
				this.setBusy(true)
	
				await oBindingContext.delete("$auto");
	
				await oModel.submitBatch(oModel.getUpdateGroupId())
					
				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					MessageBox.information("Registro deletado.")
				}
			} finally {
				this.setBusy(false)
			}
		}

	}

  /** Recusa do servidor já aparece pelo handler de mensagens do Component ($reported). */
  private showActionError(err: unknown): void {
    if ((err as { $reported?: boolean })?.$reported) return;
    MessageBox.error((err as Error)?.message || "Erro ao executar a operação.");
  }

  private selectedLot(): Context | undefined {
    const oTable = this.byId("tableLoteArmazenagem") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return undefined;
    }

    return oTable.getContextByIndex(i) as Context;
  }

  /** Encerra o lote a partir da data escolhida (padrão: hoje). */
  async onCloseLot(): Promise<void> {
    const oContext = this.selectedLot();
    if (!oContext) return;

    if (oContext.getProperty("Status") === "Closed") {
      MessageBox.warning("O lote já está encerrado.");
      return;
    }

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    // Data local, não toISOString: perto da meia-noite o UTC já seria o dia seguinte.
    const todayText = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    this.closeLotDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.storageAddresses.fragments.CloseDialog");
    this.closeLotDialog.setModel(new JSONModel({
      code: oContext.getProperty("Code") as string,
      description: oContext.getProperty("Description") as string,
      closingDate: todayText,
      today,
    }), "closeLot");
    this.closeLotDialog.open();
  }

  onCancelCloseLot(): void {
    this.closeLotDialog?.close();
  }

  async onConfirmCloseLot(): Promise<void> {
    const data = (this.closeLotDialog?.getModel("closeLot") as JSONModel).getData() as {
      code: string;
      closingDate: string;
    };

    if (!data.closingDate) {
      MessageBox.warning("Informe a data de encerramento.");
      return;
    }

    this.closeLotDialog?.close();

    const action = (this.getModel() as ODataModel).bindContext("/StorageAddressesClose(...)");
    action.setParameter("Code", data.code);
    action.setParameter("ClosingDate", data.closingDate);

    try {
      this.setBusy(true);
      await action.invoke();
      MessageToast.show(`Lote ${data.code} encerrado.`);
      this.onRefresh();
    } catch (err) {
      this.showActionError(err);
    } finally {
      this.setBusy(false);
    }
  }

  /** Reabre o lote; o cálculo diário volta a incluí-lo a partir do próximo processamento. */
  async onReopenLot(): Promise<void> {
    const oContext = this.selectedLot();
    if (!oContext) return;

    if (oContext.getProperty("Status") !== "Closed") {
      MessageBox.warning("O lote não está encerrado.");
      return;
    }

    const code = oContext.getProperty("Code") as string;

    if (!(await confirmDialog(
      `Reabrir o lote ${code}? Os dias em que ficou encerrado só voltam a ser cobrados pelo reprocessamento.`,
      "Reabrir lote"))) {
      return;
    }

    const action = (this.getModel() as ODataModel).bindContext("/StorageAddressesReopen(...)");
    action.setParameter("Code", code);

    try {
      this.setBusy(true);
      await action.invoke();
      MessageToast.show(`Lote ${code} reaberto.`);
      this.onRefresh();
    } catch (err) {
      this.showActionError(err);
    } finally {
      this.setBusy(false);
    }
  }
}
