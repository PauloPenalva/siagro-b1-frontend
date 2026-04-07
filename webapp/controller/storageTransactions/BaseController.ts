import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import { TruckDriver } from "siagrob1/types/TruckDriver";
import MessageBox from "sap/m/MessageBox";
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import { Item } from "siagrob1/types/Items";
import { UnitOfMeasure } from "siagrob1/types/UnitOfMeasure";
import { Warehouse } from "siagrob1/types/Warehouse";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import formatter from "siagrob1/model/formatter";


/**
 * @namespace siagrob1.controller.storageContracts
 */
export abstract class BaseController extends CommonController {
  
  formatter = formatter;

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


  onAddQualityInspection() {
    const oTable = this.byId(
      "storageTransactionQualityInspectionTable"
    ) as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveQualityInspection() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId(
      "storageTransactionQualityInspectionTable"
    ) as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  async formatDriverName(key: string) {
    if (!key) {
      return null;
    }

    try {
      this.setBusy(true);
      const data = await this.getResource<TruckDriver>(
        `${this.api.truckDrivers}('${key}')`
      );

      return data?.Name;
    } finally {
      this.setBusy(false);
    }
  }

  async formatBusinessPartnerName(key: string) {
    if (!key) {
      return null;
    }

    try {
      this.setBusy(true);
      const data = await this.getResource<BusinessPartner>(
        `${this.api.businessPartners}('${key}')`
      );

      return data?.CardName;
    } finally {
      this.setBusy(false);
    }
  }

  async formatItemName(key: string) {
    if (!key) {
      return null;
    }

    const data = await this.getResource<Item>(`${this.api.items}('${key}')`);
    return data?.ItemName;
  }

  async formatUnitOfMeasureDescription(key: string) {
    if (!key) {
      return null;
    }

    const data = await this.getResource<UnitOfMeasure>(
      `${this.api.unitsOfMeasure}('${key}')`
    );
    return data?.Description;
  }

  async formatWarehouseName(key: string) {
    if (!key) {
      return null;
    }

    const data = await this.getResource<Warehouse>(
      `${this.api.warehouses}('${key}')`
    );
    return data?.Name;
  }

  async formatQualityAttribName(key: string) {
    if (!key) {
      return null;
    }

    const data = await this.getResource<QualityAttrib>(
      `${this.api.qualityAttrib}('${key}')`
    );
    return data?.Name;
  }

  async formatProcessingCostDescription(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.processingCosts}('${key}')`)
      
      return data?.Description;
    } finally {
      this.setBusy(false);
    }

  }

   async formatStorageAddressDescription(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.storageAddresses}('${key}')`)
      
      return data?.Description;
    } finally {
      this.setBusy(false);
    }

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
