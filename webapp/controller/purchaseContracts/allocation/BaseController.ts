import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";

export class BaseController extends CommonController {

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

}
