import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import JSONModel from "sap/ui/model/json/JSONModel";
import TableSelectDialog from "sap/m/TableSelectDialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import Filter from "sap/ui/model/Filter";
import ListBinding from "sap/ui/model/ListBinding";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";


/**
 * @namespace siagrob1.controller.ownershipTransfers
 */
export abstract class BaseController extends CommonController {
  private _dialog: TableSelectDialog;

  async onConfirm() {
    const view = this.getView();
    const context = view.getBindingContext() as Context;
    if (context) {
      
      if (await DialogHelper.confirmDialog("Confirmar Romaneio ?")) {
        const model = context.getModel() as ODataModel;
        const action = model.bindContext("/StorageTransactionsConfirmed(...)");
        action.setParameter("Key",  context.getProperty("Key"))

        this.setBusy(true);
        void action.invoke()
          .then(() => this.navTo("storageTransactions"))
          .finally(() => this.setBusy(false));
      }
    }
  }

  async openStorageAddressesListValueHelp(ev: Input$ValueHelpRequestEvent) {
    this._openStorageAddressesList()
      .then((oContext: Context) => {
        const value = oContext?.getProperty("/Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  private async _openStorageAddressesList(): Promise<Context> {
    return new Promise(async (resolve) => {
      const view = this.getView();
      const ctx = view.getBindingContext();
      if (ctx) {
        const itemCode = ctx.getProperty("ItemCode");
        if (!itemCode){
          MessageBox.warning("Selecione o produto.");
          throw new Error("Selecione o produto.")
        }

        this._dialog ??= await Fragment.load({
            name: "siagrob1.view.ownershipTransfers.fragments.StorageAddressesBalanceDialog",
            controller: this,
            id: view.getId(),
          }) as TableSelectDialog;
      
        if (this.getView().indexOfDependent(this._dialog) < 0) {
          this._dialog.attachConfirm(ev => {
            const oContext = ev
              .getParameter("selectedItem")
              .getBindingContext() as Context;
  
            resolve(oContext);
          });

          this._dialog.attachSearch(ev => {
            const value = ev.getParameter("value");
            const oFilters = new Filter({
              filters: [
                new Filter("Description", FilterOperator.Contains, value),
              ],
              and: false,
            });
            
            (ev.getSource().getBinding("items") as ListBinding).filter([oFilters]);  
          });
          
          this.getView().addDependent(this._dialog);
        }

        this._dialog.open("");

        const model = this.getModel() as ODataModel;
        const func = model.bindContext("/StorageAddressesListOpenedByItem(...)");
        func.setParameter("Code", itemCode);
        
        this.setBusy(true);
        func.invoke()
          .then(() => {
            const resultContext = func.getBoundContext();
            const viewModel = this.getModel("viewModel") as JSONModel
            viewModel.setData(resultContext.getObject() as object);
          })
          .finally(() => this.setBusy(false));
      }
    });
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
