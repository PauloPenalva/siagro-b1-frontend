
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import Table from "sap/ui/table/Table";
import BaseController from "../PurchaseContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageToast from "sap/m/MessageToast";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";

/**
 * @namespace siagrob1.controller.purchaseContracts.allocation
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void  {
    
	}

  private createColumnConfig() {
			const aCols: Column[] = [];

			aCols.push({
				label: "Contrato",
				property: "PurchaseContract/Code",
				type: EdmType.String,
			});

			aCols.push({
				label: "Cod.Fornecedor",
				property: "PurchaseContract/CardCode",
				type: EdmType.String,
			});

			aCols.push({
				label: "Fornecedor",
				property: "PurchaseContract/CardName",
				type: EdmType.String,
			});

			aCols.push({
				label: "Cod.Produto",
				property: "PurchaseContract/ItemCode",
				type: EdmType.String,
			});

			aCols.push({
				label: "Produto",
				property: "PurchaseContract/ItemName",
				type: EdmType.String,
			});

			aCols.push({
				label: "Romaneio",
				property: "StorageTransaction/Code",
				type: EdmType.String,
			});

			aCols.push({
				label: "Emissão",
				property: "StorageTransaction/TransactionDate",
				type: EdmType.Date,
     	});

      aCols.push({
				label: "Tipo",
				property: "StorageTransaction/TransactionType",
        type: EdmType.Enumeration,
        valueMap: {
          "Purchase": "Compra",
          "PurchaseReturn": "Dev.Compra",
          "PurchaseQtyComplement": "Compl.Qtd.",
          "PurchasePriceComplement": "Compl.Preço",
        }
     	});

      aCols.push({
				label: "Quantidade",
				property: "Volume",
        type: EdmType.Number,
				scale: 3,
				delimiter: true
			});
			
      aCols.push({
				label: "Un.Med.",
				property: "StorageTransaction/UnitOfMeasureCode",
        type: EdmType.String
			});

      aCols.push({
				label: "Un.Med.",
				property: "StorageTransaction/WarehouseCode",
        type: EdmType.String
			});

      aCols.push({
				label: "Placa",
				property: "StorageTransaction/TruckCode",
        type: EdmType.String
			});

      aCols.push({
				label: "Nota Fiscal",
				property: "StorageTransaction/InvoiceNumber",
        type: EdmType.String
			});

      aCols.push({
				label: "Serie",
				property: "StorageTransaction/InvoiceSerie",
        type: EdmType.String
			});

      aCols.push({
				label: "Qtd.Nota Fiscal",
				property: "StorageTransaction/InvoiceQty",
        type: EdmType.Number,
				scale: 3,
				delimiter: true
			});

			return aCols;
		}

  onExcel() {
    const table = this.byId("tablePurchaseContractsAllocations") as Table;
    const binding = table.getBinding("rows") as ODataListBinding
    const cols = this.createColumnConfig();

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: 'Entregas de Contrato de Compra.xlsx',
      workbook: {
        columns: cols,
        hierarchyLevel: "Level",
        context: {
          sheetName: 'Entregas de Contrato de Compra'
        }
      }
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function() {
      oSheet.destroy();
    });
  }


  async onDelete() {
    const table = this.byId("tablePurchaseContractsAllocations") as Table;
    const context = table.getContextByIndex(table.getSelectedIndex()) as Context;

    if (!context) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    if (await DialogHelper.confirmDialog("Estornar entrega de contrato ?")) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext(this.api.purchaseContractsAllocationsDelete);
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Entrega estornada com sucesso.");
          this.refreshData();
        })
        .finally(() => this.setBusy(false));
    }

  }

  private refreshData() {
    const oTable = this.byId("tablePurchaseContractsAllocations") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
}
