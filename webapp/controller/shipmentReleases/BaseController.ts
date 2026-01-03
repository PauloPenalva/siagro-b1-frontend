import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import Spreadsheet from "sap/ui/export/Spreadsheet";

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
          property: "Status",
          type: EdmType.Enumeration,
          valueMap: {
            "Pending": "Pendente",
            "Actived": "Ativo",
            "Cancelled": "Cancelado.",
            "Paused": "Pausado",
          }
        });
        
        aCols.push({
          label: "Dt.Liberação",
          property: "ReleaseDate",
          type: EdmType.Date,
        });

        aCols.push({
          label: "Limite Entrega",
          property: "PurchaseContract/DeliveryEndDate",
          type: EdmType.Date,
        });

        aCols.push({
          label: "Prev.Pagto.",
          property: "PurchaseContract/StandardCashFlowDate",
          type: EdmType.Date,
        });

        aCols.push({
          label: "Quantidade",
          property: "ReleasedQuantity",
          type: EdmType.Number,
          scale: 3,
          delimiter: true
        });

        aCols.push({
          label: "Armazém",
          property: "DeliveryLocationCode",
          type: EdmType.String
        });

        aCols.push({
          label: "Contrato",
          property: "PurchaseContract/Code",
          type: EdmType.String
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
          label: "Tipo Mercado",
          property: "PurchaseContract/MarketType",
          type: EdmType.Enumeration,
          valueMap: {
            "Internal": "Interno",
            "External": "Exportação",
          }
        });

        aCols.push({
          label: "Saldo",
          property: "AvailableQuantity",
          type: EdmType.Number,
          scale: 3,
          delimiter: true
        });
  
        return aCols;
      }
  
    onExcel() {
      const table = this.byId("tableShipmentReleases") as Table;
      const binding = table.getBinding("rows") as ODataListBinding
      const cols = this.createColumnConfig();
  
      const setting: SpreadsheetSettings = {
        dataSource: binding,
        fileName: 'Liberações de Entrega.xlsx',
        workbook: {
          columns: cols,
          hierarchyLevel: "Level",
          context: {
            sheetName: 'Liberações de Entrega de Contrato de Compra'
          }
        }
      };
  
      const oSheet = new Spreadsheet(setting);
      void oSheet.build().finally(function() {
        oSheet.destroy();
      });
    }
    
}
