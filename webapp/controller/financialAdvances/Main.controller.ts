import { SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { FinancialDocumentsBaseController } from "siagrob1/controller/financialDocuments/FinancialDocumentsBaseController";

/**
 * Adiantamentos — a única tela que INCLUI documento financeiro (as outras duas só listam e dão
 * baixa). Mostra os dois lados (compra e venda) porque a direção nasce do tipo de contrato
 * escolhido no diálogo de inclusão, não de um filtro fixo da tela.
 *
 * @namespace siagrob1.controller.financialAdvances
 */
export default class Main extends FinancialDocumentsBaseController {
  formatter = { ...formatter }

  private _advanceDialog: Dialog;

  protected get tableId(): string { return "financialAdvancesTable"; }
  /** Esta tela mostra os dois lados; a direcao vem do contrato escolhido na inclusao. */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected get direction(): "Payable" | "Receivable" | null { return null; }
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected get natureFilter(): string | null { return "Nature eq 'Advance'"; }
  protected get originRoute(): string { return "financialAdvances"; }

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("financialAdvances")
      .attachPatternMatched(() => this.onRouteMatched());
  }

  async onCreate(): Promise<void> {
    (this.getModel("viewModel") as JSONModel).setProperty("/advanceDialog", {
      contractType: "Purchase",
      contractCode: "",
      contractKey: null,
      amount: 0,
      dueDate: "",
      comments: "",
    });

    this._advanceDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialAdvances.fragments.CreateAdvanceDialog");
    this._advanceDialog.open();
  }

  onCloseAdvanceDialog(): void {
    this._advanceDialog?.close();
  }

  /** Trocar o tipo invalida o contrato ja escolhido — senao sobra contrato de compra num
   *  adiantamento de venda, e a action falharia com "Contrato nao encontrado". */
  onAdvanceContractTypeChange(): void {
    const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setProperty("/advanceDialog/contractCode", "");
    viewModel.setProperty("/advanceDialog/contractKey", null);
  }

  /**
   * Value help do contrato do adiantamento.
   *
   * NAO usa `PurchaseContractsSelectDialog`: apesar do nome, ele binda a FUNCTION
   * `/PurchaseContractsGetShipmentReleasesAvailable`, escopada a saldo de liberacao de embarque
   * por produto e local de entrega. Adiantamento nao tem nem produto nem local, e a lista viria
   * sempre vazia.
   *
   * Tambem NAO reusa `PurchaseInvoiceContractsSelectDialog`: aquele inclui ENCERRADO de proposito,
   * porque a NF de entrada costuma chegar depois de o contrato fechar. O adiantamento exige
   * APROVADO — `FinancialAdvancesCreateService` recusa o resto. Dai o
   * `PurchaseContractsApprovedSelectDialog`, identico a ele menos o status.
   *
   * O filtro de status mora no $filter ESTATICO de cada fragmento, nunca aqui como
   * `sap.ui.model.Filter`: filtro de enum montado como objeto estoura "Unsupported type" no UI5.
   * Os dois fragmentos ja filtram Status eq 'Approved', entao nao vai defaultFilter nenhum.
   */
  async openAdvanceContractValueHelp(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const contractType = viewModel.getProperty("/advanceDialog/contractType") as string;
    const dialogName = contractType === "Sales"
      ? "SalesContractsSelectDialog"
      : "PurchaseContractsApprovedSelectDialog";

    const oSelected = await DialogHelper.openTableSelectDialog(this, dialogName, ["Code", "CardName"]);

    if (!oSelected) return;

    viewModel.setProperty("/advanceDialog/contractCode", oSelected.getProperty("Code") as string);
    viewModel.setProperty("/advanceDialog/contractKey", oSelected.getProperty("Key") as string);
  }


  async onConfirmCreateAdvance(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const form = viewModel.getProperty("/advanceDialog") as {
      contractType: string; contractKey: string; amount: number;
      dueDate: string; comments: string;
    };

    if (!form.contractKey) {
      MessageBox.alert("Selecione o contrato.");
      return;
    }

    if (!(Number(form.amount) > 0)) {
      MessageBox.alert("O valor do adiantamento deve ser maior que zero.");
      return;
    }

    if (!form.dueDate) {
      MessageBox.alert("Informe o vencimento do adiantamento.");
      return;
    }

    this.onCloseAdvanceDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialAdvancesCreate);
      action.setParameter("ContractType", form.contractType);
      action.setParameter("ContractKey", form.contractKey);
      action.setParameter("Amount", Number(form.amount));
      action.setParameter("DueDate", form.dueDate);
      action.setParameter("Comments", form.comments ?? "");
      await action.invoke();

      MessageToast.show("Adiantamento incluído.");
      this.onRefresh();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao incluir o adiantamento.");
    } finally {
      this.setBusy(false);
    }
  }

  onExcel(): void {
    const table = this.byId(this.tableId) as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Adiantamentos.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        hierarchyLevel: "Level",
        context: { sheetName: "Adiantamentos" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () { oSheet.destroy(); });
  }
}
