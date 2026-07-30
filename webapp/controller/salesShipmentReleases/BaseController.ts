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
      property: "SalesContract/DeliveryEndDate",
      type: EdmType.Date,
    });

    aCols.push({
      label: "Prev.Pagto.",
      property: "SalesContract/StandardCashFlowDate",
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
      property: "SalesContract/Code",
      type: EdmType.String
    });

    aCols.push({
      label: "Vendedor",
      property: "SalesContract/AgentName",
      type: EdmType.String,
    });

    aCols.push({
      label: "Cod.Cliente",
      property: "SalesContract/CardCode",
      type: EdmType.String,
    });

    aCols.push({
      label: "Cliente",
      property: "SalesContract/CardName",
      type: EdmType.String,
    });

    aCols.push({
      label: "Cod.Produto",
      property: "SalesContract/ItemCode",
      type: EdmType.String,
    });

    aCols.push({
      label: "Produto",
      property: "SalesContract/ItemName",
      type: EdmType.String,
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
    const table = this.byId("tableSalesShipmentReleases") as Table;
    const binding = table.getBinding("rows") as ODataListBinding;
    const cols = this.createColumnConfig();

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: 'Liberações de Entrega de Venda.xlsx',
      workbook: {
        columns: cols,
        hierarchyLevel: "Level",
        context: {
          sheetName: 'Liberações de Entrega de Contrato de Venda'
        }
      }
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function() {
      oSheet.destroy();
    });
  }

}
