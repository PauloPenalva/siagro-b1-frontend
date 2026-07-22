import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

interface ReleaseTarget {
  SalesShipmentReleaseKey: string;
  SalesContractKey: string;
  SalesContractCode: string;
  CardCode: string;
  ItemCode: string;
  Price: number;
  AvailableQuantity: number;
  ReallocationVolume?: number;
}

/**
 * @namespace siagrob1.controller.salesContracts.allocation
 */
export default class Main extends BaseController {

  formatter = formatter;

  private reallocationDialog: Dialog;

	onInit(): void  {
    this.createFilterModel();
    this.getView().setModel(new JSONModel([]), "viewModel");

    this.getRouter().getRoute("salesContractsAllocations")
       .attachPatternMatched(() => this.applyFilters());
	}

  onSearch(): void {
    this.applyFilters();
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  /**
   * Abre o diálogo de realocação para a linha selecionada. Só linhas realocáveis
   * (com volume positivo, e que não sejam devolução) podem ser movidas.
   */
  async onReallocate() {
    const table = this.byId("tableSalesContractsAllocations") as Table;
    const context = table.getContextByIndex(table.getSelectedIndex()) as Context;

    if (!context) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const origin = context.getProperty("Origin") as string;
    const volume = +context.getProperty("Volume");

    if (origin === "Return" || volume <= 0) {
      MessageBox.warning("Só é possível realocar entregas com volume disponível (não devoluções).");
      return;
    }

    this.reallocationDialog ??=
      await DialogHelper.createDialog(this, "siagrob1.view.salesContracts.allocation.fragments.ReallocationDialog");

    // Liga o diálogo ao PRÓPRIO elemento (GET-by-key roteado com $expand automático via
    // autoExpandSelect) em vez de herdar o contexto da linha. Herdar dispararia um late
    // property request na navegação SalesContractsAllocations(key)/SalesInvoiceItem — que o
    // entity set não roteia (só Get/Get(key)) e retorna 404. Ver ui5-v4-odata-binding-gotchas.
    this.reallocationDialog.bindElement(context.getPath());
    this.reallocationDialog.open();

    // Os contratos de destino só podem ser carregados depois do cabeçalho chegar
    // (precisamos de CardCode/ItemCode do contexto já resolvido).
    const elementBinding = this.reallocationDialog.getElementBinding() as ODataContextBinding;
    this.setBusy(true);
    elementBinding.attachEventOnce("dataReceived", () => {
      void this.loadReallocationTargets().finally(() => this.setBusy(false));
    });
  }

  private async loadReallocationTargets(): Promise<void> {
    const context = this.reallocationDialog.getBindingContext() as Context;
    // Ler as chaves pelas navegações expandidas (SalesContract/Key), não pelas FKs
    // (SalesContractKey), pois autoExpandSelect não seleciona a FK — só a Key da nav.
    const sourceContractKey = context.getProperty("SalesContract/Key") as string;
    const cardCode = context.getProperty("SalesContract/CardCode") as string;
    const itemCode = context.getProperty("SalesInvoiceItem/ItemCode") as string;

    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/SalesShipmentReleasesGetAvailable(...)");
    func.setParameter("ItemCode", itemCode);

    await func.invoke();
    const result = func.getBoundContext().getObject() as ReleaseTarget[] | { value: ReleaseTarget[] };
    const rows = Array.isArray(result) ? result : (result.value ?? []);

    // Só contratos do MESMO cliente e diferentes do de origem — exclui as liberações do
    // próprio contrato de origem. Comparação case-insensitive (GUIDs podem divergir de caixa).
    const source = (sourceContractKey ?? "").toLowerCase();
    const targets = rows.filter(r =>
      r.CardCode === cardCode && (r.SalesContractKey ?? "").toLowerCase() !== source);

    (this.getModel("viewModel") as JSONModel).setData(targets);
  }

  onCloseReallocation() {
    (this.getModel("viewModel") as JSONModel).setData([]);
    this.reallocationDialog?.close();
  }

  async onConfirmReallocation() {
    const dlgId = this.getView().getId() + "_siagrob1.view.salesContracts.allocation.fragments.ReallocationDialog";
    const dlgTable = Fragment.byId(dlgId, "salesReallocationTargetTable") as Table;
    const selected = dlgTable.getSelectedIndices();

    if (selected.length !== 1) {
      MessageBox.warning("Selecione um contrato de destino na lista.");
      return;
    }

    const context = this.reallocationDialog.getBindingContext() as Context;
    const tableCtx = dlgTable.getContextByIndex(selected[0]);

    if (!tableCtx) {
      return;
    }

    const salesInvoiceItemKey = context.getProperty("SalesInvoiceItem/Key") as string;
    const sourceContractKey = context.getProperty("SalesContract/Key") as string;
    const sourceLineVolume = +context.getProperty("Volume");

    const targetContractKey = tableCtx.getProperty("SalesContractKey") as string;
    const targetReleaseKey = tableCtx.getProperty("SalesShipmentReleaseKey") as string;
    const releaseAvailable = +tableCtx.getProperty("AvailableQuantity");
    const volume = +tableCtx.getProperty("ReallocationVolume");

    if (!volume || volume <= 0) {
      MessageBox.warning("Informe o volume a realocar.");
      return;
    }

    if (volume > sourceLineVolume) {
      MessageBox.warning(
        `O volume informado é superior ao saldo desta linha (${this.formatter.formatDecimal(sourceLineVolume, 3)}).`);
      return;
    }

    if (volume > releaseAvailable) {
      MessageBox.warning(
        `O volume informado é superior ao saldo da liberação de destino (${this.formatter.formatDecimal(releaseAvailable, 3)}).`);
      return;
    }

    const confirmed = await DialogHelper.confirmDialog("Confirma a realocação da entrega para o contrato de destino?");
    if (!confirmed) {
      return;
    }

    this.reallocationDialog?.close();

    const action = (this.getModel() as ODataModel).bindContext(this.api.salesContractsReallocationCreate);
    action.setParameter("SalesInvoiceItemKey", salesInvoiceItemKey);
    action.setParameter("SourceSalesContractKey", sourceContractKey);
    action.setParameter("TargetSalesContractKey", targetContractKey);
    action.setParameter("TargetSalesShipmentReleaseKey", targetReleaseKey);
    action.setParameter("Volume", volume);

    this.setBusy(true);
    void action.invoke()
      .then(() => {
        MessageToast.show(
          `Entrega realocada com sucesso para o contrato ${tableCtx.getProperty("SalesContractCode")}.`);
        this.refreshData();
      })
      .finally(() => this.setBusy(false));
  }

  async onReverseReallocation() {
    const table = this.byId("tableSalesContractsAllocations") as Table;
    const context = table.getContextByIndex(table.getSelectedIndex()) as Context;

    if (!context) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    if (context.getProperty("Origin") !== "Reallocation") {
      MessageBox.warning("Selecione uma linha de realocação para estornar.");
      return;
    }

    if (await DialogHelper.confirmDialog("Estornar esta realocação?")) {
      const action = (this.getModel() as ODataModel).bindContext(this.api.salesContractsReallocationDelete);
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Realocação estornada com sucesso.");
          this.refreshData();
        })
        .finally(() => this.setBusy(false));
    }
  }

  private applyFilters() {
    const oBinding = this.getView().byId("tableSalesContractsAllocations").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as Record<string, string>;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];
      if (!value) return;

      if (key === "Origin") {
        filters.push(`Origin eq '${value}'`);
      } else if (key === "SalesContractBranchCode") {
        filters.push(`contains(SalesContract/BranchCode, '${value}')`);
      } else if (key === "SalesContractCode") {
        filters.push(`contains(SalesContract/Code, '${value}')`);
      } else if (key === "SalesContractCardCode") {
        filters.push(`contains(SalesContract/CardCode, '${value}')`);
      } else if (key === "SalesContractItemCode") {
        filters.push(`contains(SalesContract/ItemCode, '${value}')`);
      } else if (key === "InvoiceNumber") {
        filters.push(`contains(SalesInvoiceItem/SalesInvoice/InvoiceNumber, '${value}')`);
      } else if (key === "TaxDocumentNumber") {
        filters.push(`contains(SalesInvoiceItem/SalesInvoice/TaxDocumentNumber, '${value}')`);
      } else {
        filters.push(`contains(${key},'${value}')`);
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({ $filter: filterParam });
  }

  private refreshData() {
    const oTable = this.byId("tableSalesContractsAllocations") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }

}
