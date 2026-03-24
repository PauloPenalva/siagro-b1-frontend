import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

export abstract class BaseController extends CommonController {

   async onCancel() {
     if(!await DialogHelper.confirmDialog("Confirma cancelar ticket ?"))
      return;

    const context = this.getView().getBindingContext();
    if (context) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/WeighingTicketsCancel(...)");
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio criado com sucesso.");
          this.navToTicketsList();
        })
        .finally(() => this.setBusy(false));
    }
  }

  onRefresh() {
    const list = this.byId("tableWeighingTicketsCompleted");
    const binding = list?.getBinding("rows") as ODataListBinding;

    binding?.refresh();
  }

  private createColumnConfig() {
    const aCols: Column[] = [];

    aCols.push({
      label: "Filial",
      property: "Branch/ShortName",
      type: EdmType.Enumeration,
    });

    aCols.push({
      label: "Codigo",
      property: "Code",
      type: EdmType.String,
    });

    aCols.push({
      label: "Operação",
      property: "Type",
      type: EdmType.Enumeration,
      valueMap: {
        "Receipt": "Entrada",
        "Shipment": "Saída"
      }
    });

    aCols.push({
      label: "Emissão",
      property: "Date",
      type: EdmType.Date,
    });

    aCols.push({
      label: "Produto",
      property: "ItemCode",
      type: EdmType.String
    });
    aCols.push({
      label: "Cliente",
      property: "CardCode",
      type: EdmType.String
    });
    aCols.push({
      label: "Placa",
      property: "TruckCode",
      type: EdmType.String
    });
    aCols.push({
      label: "Motorista",
      property: "TruckDriverCode",
      type: EdmType.String
    });

    aCols.push({
      label: "Documento",
      property: "InvoiceNumber",
      type: EdmType.String
    });

    aCols.push({
      label: "Primeira Pesagem",
      property: "FirstWeighValue",
      type: EdmType.Number,
      scale: 0,
      delimiter: true
    });

    aCols.push({
      label: "Segunda Pesagem",
      property: "SecondWeighValue",
      type: EdmType.Number,
      scale: 0,
      delimiter: true
    });

    aCols.push({
      label: "Peso Bruto",
      property: "GrossWeight",
      type: EdmType.Number,
      scale: 3,
      delimiter: true,
    });


    return aCols;
  }

  onExcel() {
    const table = this.byId("tableWeighingTicketsCompleted") as Table;
    const binding = table.getBinding("rows") as ODataListBinding
    const cols = this.createColumnConfig();

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: 'Tickets de Pesagem.xlsx',
      workbook: {
        columns: cols,
        hierarchyLevel: "Level",
        context: {
          sheetName: 'Tickets'
        }
      }
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () {
      oSheet.destroy();
    });
  }

  navToTicketsList() {
    this.navTo("weighingTicketsCompleted");
  }

}
