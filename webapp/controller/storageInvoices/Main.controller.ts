
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import Context from "sap/ui/model/odata/v4/Context";

/**
 * @namespace siagrob1.controller.storageInvoices
 */
export default class Main extends BaseController {

	onInit(): void  {
    this.createFilterModel();
    this.getRouter().getRoute("storageTransactions")
    .attachPatternMatched(() => this.applyFilters())
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters()
	}

  private applyFilters() {
    const oBinding = this.getView().byId("storageInvoicesTable").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as any;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];

      if (!value) return;

      if (key == "Status" ) {
        filters.push(`${key} eq '${value}'`)
      } else if (key == "DateFrom") {
        filters.push(`ClosingDate ge ${value}`)
      } else if (key == "DateTo") {
        filters.push(`ClosingDate le ${value}`)
      } else {
        filters.push(`contains(${key},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({
      $filter: filterParam
    });
  }

	onDetail(): void {
		const oTable = this.byId("storageInvoicesTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("storageInvoicesDetail", {id: sId});
	}

  onCreate(): void {
    this.navTo("storageInvoicesAdd");
  }

  private refreshData() {
    const oTable = this.byId("storageInvoicesTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 

  async onPrint(): Promise<void> {
    const oTable = this.byId("storageInvoicesTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para imprimir.");
      return;
    }
    
		const oContext = oTable.getContextByIndex(i) as Context;
    
		const key = oContext.getProperty("Key") as string;

    try {

        this.setBusy(true);

        const response = await fetch(`/reports/StorageInvoicesReport/${key}/print`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
        });

        if (!response.ok) {
            throw new Error("Falha ao gerar relatório.");
        }

        const blob = await response.blob();
        const fileURL = URL.createObjectURL(blob);

        // abre em nova aba
        window.open(fileURL, "_blank");

        // opcional: liberar memória depois de um tempo
        setTimeout(() => URL.revokeObjectURL(fileURL), 60000);

    } catch (error) {
        const err = error as Error;
        MessageBox.error(err?.message);
    } finally {
      this.setBusy(false);
    }
  }
}
