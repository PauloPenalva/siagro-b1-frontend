import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import { BusinessPartner } from "siagrob1/types/BusinessPartner";

export abstract class BaseController extends CommonController {
  
   async formatBusinessPartnerName(key: string){
      if (!key){
        return null;
      } 
  
      try {
        this.setBusy(true);
        const data = await this
          .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')`)
        
        return data?.CardName;
      } finally {
        this.setBusy(false);
      }
  
    }

    private createColumnConfig() {
      const aCols: Column[] = [];

      aCols.push({
        label: "Filial",
        property: "Branch/ShortName",
        type: EdmType.String,
      });

      aCols.push({
        label: "Numero",
        property: "InvoiceNumber",
        type: EdmType.String,
      });
      
      aCols.push({
        label: "Emissão",
        property: "InvoiceDate",
        type: EdmType.Date,
      });
      
      aCols.push({
        label: "Status",
        property: "InvoiceStatus",
        type: EdmType.Enumeration,
        valueMap: {
          "Pending": "Pendente",
          "Confirmed": "Confirmado",
          "Cancelled": "Cancelado",
        }
      });

      aCols.push({
        label: "Cod.Cliente",
        property: "CardCode",
        type: EdmType.String,
      });

      aCols.push({
        label: "Cliente",
        property: "CardName",
        type: EdmType.String,
      });
      
      aCols.push({
        label: "Valor Produtos",
        property: "TotalInvoiceItems",
        type: EdmType.Number,
        scale: 2,
        delimiter: true
      });

      aCols.push({
        label: "Placa",
        property: "TruckCode",
        type: EdmType.String
      });

      aCols.push({
        label: "Peso Bruto",
        property: "GrossWeight",
        type: EdmType.Number,
        scale: 3,
        delimiter: true,
      });


      aCols.push({
        label: "Nota Fiscal",
        property: "TaxDocumentNumber",
        type: EdmType.String,
      });

      aCols.push({
        label: "Série",
        property: "TaxDocumentSeries",
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
      const table = this.byId("tableSalesInvoices") as Table;
      const binding = table.getBinding("rows") as ODataListBinding
      const cols = this.createColumnConfig();
      
      const setting: SpreadsheetSettings = {
        dataSource: binding,
        fileName: 'Documentos de saida.xlsx',
        workbook: {
          columns: cols,
          hierarchyLevel: "Level",
          context: {
            sheetName: 'Documentos de saída'
          }
        }
      };
  
      const oSheet = new Spreadsheet(setting);
      void oSheet.build().finally(function() {
        oSheet.destroy();
      });
    }
    
}
