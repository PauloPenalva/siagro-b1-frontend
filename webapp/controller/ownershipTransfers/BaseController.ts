import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import JSONModel from "sap/ui/model/json/JSONModel";
import TableSelectDialog, { TableSelectDialog$ConfirmEvent } from "sap/m/TableSelectDialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import RequestModel from "siagrob1/model/RequestModel";


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
    const aContexts = await this._openStorageAddressesList();

    if (!aContexts.length) {
      return;
    }

    ev.getSource().setValue(aContexts[0].getProperty("Code") as string);
  }

  /**
   * Abre o diálogo de saldos por lote e resolve com os contextos escolhidos.
   *
   * Resolve com lista vazia quando não há o que escolher (sem contexto ou sem
   * produto), em vez de ficar pendurada.
   */
  private async _openStorageAddressesList(): Promise<Context[]> {
    const view = this.getView();
    const ctx = view.getBindingContext();

    if (!ctx) return [];

    const itemCode = ctx.getProperty("ItemCode") as string;

    if (!itemCode) {
      MessageBox.warning("Selecione o produto.");
      return [];
    }

    this._dialog ??= await Fragment.load({
      name: "siagrob1.view.ownershipTransfers.fragments.StorageAddressesBalanceDialog",
      controller: this,
      id: view.getId(),
    }) as TableSelectDialog;

    if (view.indexOfDependent(this._dialog) < 0) {
      view.addDependent(this._dialog);
    }

    // Registrado antes do open para não perder o confirm; a promise só é
    // aguardada no fim.
    const pSelection = new Promise<Context[]>((resolve) => {
      const fnConfirm = (oEvent: TableSelectDialog$ConfirmEvent) => {
        this._dialog.detachConfirm(fnConfirm);
        resolve(oEvent.getParameter("selectedContexts") as Context[]);
      };

      this._dialog.attachConfirm(fnConfirm);
    });

    const requestModel = new RequestModel();

    this.setBusy(true);
    try {
      const results = await requestModel.get<object>(
        `${this.api.storageAddressesBalance}(Code='${itemCode}')`
      );

      const viewModel = this.getModel("viewModel") as JSONModel;
      viewModel.setData(results);
    } finally {
      this.setBusy(false);
    }

    this._dialog.open(undefined);

    return pSelection;
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
