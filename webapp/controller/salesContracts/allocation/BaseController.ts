import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";

export class BaseController extends CommonController {

  private createColumnConfig() {
    const aCols: Column[] = [];

    aCols.push({ label: "Contrato", property: "SalesContract/Code", type: EdmType.String });
    aCols.push({ label: "Cod.Cliente", property: "SalesContract/CardCode", type: EdmType.String });
    aCols.push({ label: "Cliente", property: "SalesContract/CardName", type: EdmType.String });
    aCols.push({ label: "Produto", property: "SalesContract/ItemName", type: EdmType.String });
    aCols.push({ label: "Nota Fiscal", property: "SalesInvoiceItem/SalesInvoice/TaxDocumentNumber", type: EdmType.String });
    aCols.push({ label: "Documento", property: "SalesInvoiceItem/SalesInvoice/InvoiceNumber", type: EdmType.String });
    aCols.push({ label: "Emissão", property: "SalesInvoiceItem/SalesInvoice/InvoiceDate", type: EdmType.Date });
    aCols.push({
      label: "Origem",
      property: "Origin",
      type: EdmType.Enumeration,
      valueMap: {
        "Billing": "Faturamento",
        "Reallocation": "Realocação",
        "Return": "Devolução",
        "Backfill": "Migração",
      }
    });
    aCols.push({ label: "Quantidade", property: "Volume", type: EdmType.Number, scale: 3, delimiter: true });
    aCols.push({ label: "Un.Med.", property: "SalesInvoiceItem/UnitOfMeasureCode", type: EdmType.String });
    aCols.push({ label: "Preço NF", property: "InvoiceUnitPrice", type: EdmType.Number, scale: 7, delimiter: true });
    aCols.push({ label: "Preço Ctr.", property: "ContractPrice", type: EdmType.Number, scale: 7, delimiter: true });
    aCols.push({ label: "Diferença", property: "PriceDifference", type: EdmType.Number, scale: 2, delimiter: true });

    return aCols;
  }

  onExcel() {
    const table = this.byId("tableSalesContractsAllocations") as Table;
    const binding = table.getBinding("rows") as ODataListBinding;
    const cols = this.createColumnConfig();

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: 'Entregas de Contrato de Venda.xlsx',
      workbook: {
        columns: cols,
        hierarchyLevel: "Level",
        context: {
          sheetName: 'Entregas de Contrato de Venda'
        }
      }
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function() {
      oSheet.destroy();
    });
  }

}
