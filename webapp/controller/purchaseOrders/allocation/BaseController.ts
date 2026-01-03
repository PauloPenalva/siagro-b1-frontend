import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";

export abstract class BaseController extends CommonController {
   private createColumnConfig() {
    const aCols: Column[] = [];

    aCols.push({
      label: "Filial",
      property: "Branch/ShortName",
      type: EdmType.String,
    });

    aCols.push({
      label: "Status",
      property: "TransactionStatus",
      type: EdmType.Enumeration,
      valueMap: {
        "Pending": "Pendente",
        "Confirmed": "Confirmado",
        "Cancelled": "Cancelado",
        "Invoiced": "Faturado",
      }
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
        Receipt: "Entrada",
        Shipment: "Saída",
        QualityLoss: "Quebra Técnica",
        SalesShipment: "Venda",
        SalesShipmentReturn: "Dev.Venda",
        Purchase: "Compra",
        PurchaseReturn: "Dev.Compra",
        PurchaseQtyComplement: "Compl.Qtd.",
        PurchasePriceComplement: "Compl.Preço"
      }
    });

    aCols.push({
      label: "Emissão",
      property: "TransactionDate",
      type: EdmType.Date,
    });

    aCols.push({
      label: "Veículo",
      property: "TruckCode",
      type: EdmType.String,
    });

    aCols.push({
      label: "Documento",
      property: "InvoiceNumber",
      type: EdmType.String,
    });

    aCols.push({
      label: "Qtd. Documento",
      property: "InvoiceQty",
      type: EdmType.Number,
      scale: 3,
      delimiter: true
    });

    aCols.push({
      label: "Peso Liquido",
      property: "NetWeight",
      type: EdmType.Number,
      scale: 3,
      delimiter: true
    });

    aCols.push({
      label: "Saldo",
      property: "AvaiableVolumeToAllocate",
      type: EdmType.Number,
      scale: 3,
      delimiter: true
    });

    aCols.push({
      label: "Um",
      property: "UnitOfMeasureCode",
      type: EdmType.String,
    });
    
    aCols.push({
      label: "Armazém",
      property: "WarehouseCode",
      type: EdmType.String,
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
    const table = this.byId("storageTransactionsAllocationTable") as Table;
    const binding = table.getBinding("rows") as ODataListBinding
    const cols = this.createColumnConfig();

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: 'Romaneios de compra pendentes.xlsx',
      workbook: {
        columns: cols,
        hierarchyLevel: "Level",
        context: {
          sheetName: 'Romaneios de Compra para Alocar'
        }
      }
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function() {
      oSheet.destroy();
    });
  }
}
