
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CommonController from "../common/CommonController";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";

/**
 * @namespace siagrob1.controller.storageTransactions
 */
export default class Main extends CommonController {

	onInit(): void  {
    
	}

  onCreate() {
		this.navTo("storageTransactionsNew");
	}

	onDetail(): void {
		const oTable = this.byId("storageTransactionsTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("storageTransactionsDetail", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("storageTransactionsTable") as Table;
		
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
					//MessageBox.information("Registro deletado.")
				}
			} finally {
				this.setBusy(false)
			}
		}

	}

  async onCopy() {
    const oTable = this.byId("storageTransactionsTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    
    const oBindingContext = oTable.getContextByIndex(i) as Context;
    const bConfirm = await confirmDialog("Copiar Romaneio ?");
    if (bConfirm) {
    
      const key = oBindingContext.getProperty("Key") as string;
      const model = this.getModel() as ODataModel;

      const action = model.bindContext(this.api.storageTransactionCopy)
      action.setParameter("Key", key);

      this.setBusy(true);
      void action.invoke()
        .then(() => this.refreshData())
        .finally(() => this.setBusy(false));
    }
  }

  private refreshData() {
    const oTable = this.byId("storageTransactionsTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
   private createColumnConfig() {
        const aCols: Column[] = [];

        aCols.push({
          label: "Status",
          property: "TransactionStatus",
          type: EdmType.Enumeration,
        });

        aCols.push({
          label: "Codigo",
          property: "Code",
          type: EdmType.String,
        });
        
        aCols.push({
          label: "Tipo",
          property: "TransactionType",
          type: EdmType.Enumeration,
          valueMap: {
            "Purchase": "Compra",
            "PurchaseReturn": "Dev.Compra",
            "PurchaseQtyComplement": "Compl.Qtd.",
            "PurchasePriceComplement": "Compl.Preço",
            "SalesShipment": "Saída para Venda",
            "SalesShipmentReturn": "Dev.Venda"
          }
        });

        aCols.push({
          label: "Emissão",
          property: "TransactionDate",
          type: EdmType.Date,
        });

        aCols.push({
          label: "Placa",
          property: "TruckCode",
          type: EdmType.String
        });

        aCols.push({
          label: "Documento",
          property: "InvoiceNumber",
          type: EdmType.String
        });
  
        aCols.push({
          label: "Qtd.Documento",
          property: "InvoiceQty",
          type: EdmType.Number,
          scale: 3,
          delimiter: true
        });

        aCols.push({
          label: "Peso Bruto",
          property: "GrossWeight",
          type: EdmType.Number,
          scale: 3,
          delimiter: true,
        });

        aCols.push({
          label: "Peso Liquido",
          property: "NetWeight",
          type: EdmType.Number,
          scale: 3,
          delimiter: true
        });

        aCols.push({
          label: "Armazem",
          property: "WarehouseCode",
          type: EdmType.String
        });

        aCols.push({
          label: "Cod.Fornecedor",
          property: "CardCode",
          type: EdmType.String,
        });
  
        aCols.push({
          label: "Fornecedor",
          property: "CardName",
          type: EdmType.String,
        });
  
        aCols.push({
          label: "Cod.Produto",
          property: "ItemCode",
          type: EdmType.String,
        });
  
        aCols.push({
          label: "Produto",
          property: "ItemName",
          type: EdmType.String,
        });
  
        aCols.push({
          label: "Chave NF-e",
          property: "ChaveNFe",
          type: EdmType.String,
        });

        return aCols;
      }
  
    onExcel() {
      const table = this.byId("storageTransactionsTable") as Table;
      const binding = table.getBinding("rows") as ODataListBinding
      const cols = this.createColumnConfig();
     
      const setting: SpreadsheetSettings = {
        dataSource: binding,
        fileName: 'Romaneios de Movimentação.xlsx',
        workbook: {
          columns: cols,
          hierarchyLevel: "Level",
          context: {
            sheetName: 'Romaneios de Movimentação'
          }
        }
      };
  
      const oSheet = new Spreadsheet(setting);
      void oSheet.build().finally(function() {
        oSheet.destroy();
      });
    }
}
