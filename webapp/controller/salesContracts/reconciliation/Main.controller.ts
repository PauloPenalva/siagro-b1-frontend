import CheckBox from "sap/m/CheckBox";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import TextArea from "sap/m/TextArea";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";

interface NegativeContract {
  SalesContractKey: string;
  Code: string;
  CardName: string;
  ItemName: string;
  Balance: number;
}

interface ReconciliationTarget {
  SalesContractKey: string;
  Code: string;
  Balance: number;
  ActiveReleaseBalance: number;
  ReconciliationVolume?: number;
}

interface RecalcAllResult {
  Scanned: number;
  Changed: number;
}

/**
 * Conciliação de entregas de contratos de VENDA (tela ADMIN).
 *
 * Orientada à ENTREGA, não ao contrato: a conciliação com o relatório do cliente começa
 * pela nota fiscal ("a NF 186703 é do contrato B"), e o contrato onde ela está costuma
 * NÃO estar negativo. Por isso a tabela principal é a de alocações, com busca server-side,
 * e a lista de contratos negativos virou um painel de diagnóstico com atalho de filtro.
 *
 * A liberação de entrega do destino não é escolhida aqui — o servidor consome as ativas
 * por FIFO de data. Furar o saldo do destino é opt-in explícito, com motivo.
 *
 * @namespace siagrob1.controller.salesContracts.reconciliation
 */
export default class Main extends CommonController {

  formatter = formatter;

  private reconciliationDialog: Dialog;

  onInit(): void {
    this.createFilterModel();
    this.getView().setModel(new JSONModel([]), "negativeModel");
    this.getView().setModel(new JSONModel([]), "targetsModel");
    this.getView().setModel(new JSONModel({}), "viewModel");

    this.getRouter().getRoute("salesContractsReconciliation")
      .attachPatternMatched(() => {
        this.applyFilters();
        void this.loadNegativeContracts();
      });
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  onRefreshNegatives(): void {
    void this.loadNegativeContracts();
  }

  /**
   * Busca server-side no entity set. Espelha o mapeamento de
   * `salesContracts/allocation/Main.controller.ts`, com duas diferenças: cliente e produto
   * casam contra código OU nome (o value help grava o código, quem digita à mão digita o
   * nome), e o valor é escapado — aspas simples no nome do cliente quebram o $filter.
   */
  private applyFilters(): void {
    const binding = (this.byId("tableAllocations") as Table).getBinding("rows") as ODataListBinding;
    const filterData = (this.getModel("filter") as JSONModel).getData() as Record<string, string>;
    const filters: string[] = [];

    const esc = (value: string) => value.replace(/'/g, "''");

    Object.keys(filterData ?? {}).forEach(key => {
      const value = filterData[key];
      if (!value) return;

      const v = esc(value);

      switch (key) {
        case "BranchCode":
          filters.push(`SalesContract/BranchCode eq '${v}'`);
          break;
        case "Code":
          filters.push(`contains(SalesContract/Code, '${v}')`);
          break;
        case "CardCode":
          filters.push(`(contains(SalesContract/CardCode, '${v}') or contains(SalesContract/CardName, '${v}'))`);
          break;
        case "ItemCode":
          filters.push(`(contains(SalesContract/ItemCode, '${v}') or contains(SalesContract/ItemName, '${v}'))`);
          break;
        case "HarvestSeasonCode":
          filters.push(`contains(SalesContract/HarvestSeasonCode, '${v}')`);
          break;
        case "TaxDocumentNumber":
          filters.push(`contains(SalesInvoiceItem/SalesInvoice/TaxDocumentNumber, '${v}')`);
          break;
        case "InvoiceNumber":
          filters.push(`contains(SalesInvoiceItem/SalesInvoice/InvoiceNumber, '${v}')`);
          break;
        default:
          filters.push(`contains(${key}, '${v}')`);
      }
    });

    binding.changeParameters({ $filter: filters.length > 0 ? filters.join(" and ") : undefined });
  }

  /**
   * AllocatedVolume é persistido-derivado: parte dos saldos negativos pode ser drift do
   * agregado, e não distribuição errada. Recalcular antes separa um caso do outro.
   */
  async onRecalculateAllBalances(): Promise<void> {
    if (!await DialogHelper.confirmDialog(
      "Recalcular o saldo de todos os contratos de venda? Isso corrige saldos que ficaram " +
      "dessincronizados e pode fazer contratos sumirem desta lista.")) {
      return;
    }

    const action = (this.getModel() as ODataModel).bindContext(this.api.salesContractsRecalculateAllBalances);

    this.setBusy(true);
    try {
      await action.invoke();
      const result = action.getBoundContext().getObject() as RecalcAllResult;
      MessageToast.show(`Recálculo concluído: ${result.Scanned} contratos verificados, ${result.Changed} corrigidos.`);
      await this.loadNegativeContracts();
      this.refreshAllocations();
    } finally {
      this.setBusy(false);
    }
  }

  private async loadNegativeContracts(): Promise<void> {
    const func = (this.getModel() as ODataModel).bindContext(this.api.salesContractsNegativeBalances);

    this.setBusy(true);
    try {
      await func.invoke();
      (this.getModel("negativeModel") as JSONModel)
        .setData(this.unwrap<NegativeContract>(func.getBoundContext().getObject()));
    } finally {
      this.setBusy(false);
    }
  }

  /** Atalho: clicar num contrato negativo joga o código no filtro e busca as entregas dele. */
  onSelectNegativeContract(): void {
    const table = this.byId("tableNegativeContracts") as Table;
    const context = table.getContextByIndex(table.getSelectedIndex());

    if (!context) {
      return;
    }

    const contract = context.getObject() as NegativeContract;
    (this.getModel("filter") as JSONModel).setProperty("/Code", contract.Code);
    this.applyFilters();
  }

  async onReconcile(): Promise<void> {
    const context = this.selectedAllocation();
    if (!context) {
      return;
    }

    const origin = context.getProperty("Origin") as string;
    const volume = +context.getProperty("Volume");

    if (origin === "Return" || volume <= 0) {
      MessageBox.warning("Só é possível conciliar entregas com volume disponível (não devoluções).");
      return;
    }

    this.reconciliationDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.salesContracts.reconciliation.fragments.ReconciliationDialog");

    // Ler as chaves pelas navegações expandidas (SalesContract/Key), nunca pelas FKs:
    // autoExpandSelect não seleciona a FK, só a Key da navegação.
    (this.getModel("viewModel") as JSONModel).setData({
      salesInvoiceItemKey: context.getProperty("SalesInvoiceItem/Key") as string,
      sourceContractKey: context.getProperty("SalesContract/Key") as string,
      sourceContractCode: context.getProperty("SalesContract/Code") as string,
      cardName: context.getProperty("SalesContract/CardName") as string,
      taxDocumentNumber: context.getProperty("SalesInvoiceItem/SalesInvoice/TaxDocumentNumber") as string,
      unitOfMeasureCode: context.getProperty("SalesInvoiceItem/UnitOfMeasureCode") as string,
      lineVolume: volume,
    });

    this.dialogControl<TextArea>("reconciliationReason").setValue("");
    this.dialogControl<CheckBox>("allowNegativeBalance").setSelected(false);
    this.onToggleAllowNegative();

    this.reconciliationDialog.open();
    await this.loadTargets(
      context.getProperty("SalesInvoiceItem/Key") as string,
      context.getProperty("SalesContract/Key") as string);
  }

  /**
   * Destinos candidatos: NÃO filtra por saldo nem exige liberação — contrato esgotado ou
   * já negativo é exatamente o que precisa aparecer.
   */
  private async loadTargets(salesInvoiceItemKey: string, sourceContractKey: string): Promise<void> {
    const func = (this.getModel() as ODataModel).bindContext(this.api.salesContractsReconciliationTargets);
    func.setParameter("SalesInvoiceItemKey", salesInvoiceItemKey);
    func.setParameter("SourceSalesContractKey", sourceContractKey);

    this.setBusy(true);
    try {
      await func.invoke();
      (this.getModel("targetsModel") as JSONModel)
        .setData(this.unwrap<ReconciliationTarget>(func.getBoundContext().getObject()));
    } finally {
      this.setBusy(false);
    }
  }

  /** O motivo só faz sentido — e só é obrigatório — quando o saldo vai ser furado. */
  onToggleAllowNegative(): void {
    const allowed = this.dialogControl<CheckBox>("allowNegativeBalance").getSelected();
    this.dialogControl<TextArea>("reconciliationReason").setEnabled(allowed);
  }

  onCloseReconciliation(): void {
    (this.getModel("targetsModel") as JSONModel).setData([]);
    this.reconciliationDialog?.close();
  }

  async onConfirmReconciliation(): Promise<void> {
    const dlgTable = this.dialogControl<Table>("reconciliationTargetTable");
    const selected = dlgTable.getSelectedIndices();

    if (selected.length !== 1) {
      MessageBox.warning("Selecione um contrato de destino na lista.");
      return;
    }

    const tableCtx = dlgTable.getContextByIndex(selected[0]);
    if (!tableCtx) {
      return;
    }

    const header = (this.getModel("viewModel") as JSONModel).getData() as Record<string, string | number>;
    const target = tableCtx.getObject() as ReconciliationTarget;
    const volume = +target.ReconciliationVolume;
    const allowNegative = this.dialogControl<CheckBox>("allowNegativeBalance").getSelected();
    const reason = (this.dialogControl<TextArea>("reconciliationReason").getValue() ?? "").trim();

    if (!volume || volume <= 0) {
      MessageBox.warning("Informe o volume a conciliar.");
      return;
    }

    if (volume > +header.lineVolume) {
      MessageBox.warning(
        `O volume informado é superior ao saldo desta entrega (${this.formatter.formatDecimal(+header.lineVolume, 3)}).`);
      return;
    }

    const resultingBalance = +target.Balance - volume;

    // Caminho seguro por padrão: estourar o saldo do destino exige o opt-in explícito.
    if (resultingBalance < 0 && !allowNegative) {
      MessageBox.warning(
        `O contrato de destino ${target.Code} só tem ${this.formatter.formatDecimal(+target.Balance, 3)} de saldo. ` +
        `Para conciliar mesmo assim, marque "Permitir saldo negativo no destino" e informe o motivo.`);
      return;
    }

    if (allowNegative && !reason) {
      MessageBox.warning("Informe o motivo. Ele fica gravado nas duas pontas do ajuste.");
      return;
    }

    const question = resultingBalance < 0
      ? `O contrato de destino ${target.Code} ficará com saldo NEGATIVO de ` +
        `${this.formatter.formatDecimal(resultingBalance, 3)}. Confirma a conciliação?`
      : `Confirma a conciliação da entrega para o contrato ${target.Code}?`;

    if (!await DialogHelper.confirmDialog(question)) {
      return;
    }

    this.reconciliationDialog?.close();

    const action = (this.getModel() as ODataModel).bindContext(this.api.salesContractsReallocationCreate);
    action.setParameter("SalesInvoiceItemKey", header.salesInvoiceItemKey);
    action.setParameter("SourceSalesContractKey", header.sourceContractKey);
    action.setParameter("TargetSalesContractKey", target.SalesContractKey);
    // Nulo de propósito: o servidor consome as liberações do destino por FIFO de data.
    action.setParameter("TargetSalesShipmentReleaseKey", null);
    action.setParameter("Volume", volume);
    action.setParameter("AllowNegativeBalance", allowNegative);
    action.setParameter("Reason", allowNegative ? reason : null);

    this.setBusy(true);
    try {
      await action.invoke();
      MessageToast.show(`Entrega conciliada com sucesso para o contrato ${target.Code}.`);
      this.refreshAllocations();
      await this.loadNegativeContracts();
    } finally {
      this.setBusy(false);
    }
  }

  async onReverse(): Promise<void> {
    const context = this.selectedAllocation();
    if (!context) {
      return;
    }

    const origin = context.getProperty("Origin") as string;
    if (origin !== "Reallocation" && origin !== "Reconciliation") {
      MessageBox.warning("Selecione uma linha de conciliação ou realocação para estornar.");
      return;
    }

    if (!await DialogHelper.confirmDialog("Estornar este ajuste?")) {
      return;
    }

    const action = (this.getModel() as ODataModel).bindContext(this.api.salesContractsReallocationDelete);
    action.setParameter("Key", context.getProperty("Key"));

    this.setBusy(true);
    try {
      await action.invoke();
      MessageToast.show("Ajuste estornado com sucesso.");
      this.refreshAllocations();
      await this.loadNegativeContracts();
    } finally {
      this.setBusy(false);
    }
  }

  private selectedAllocation(): Context | null {
    const table = this.byId("tableAllocations") as Table;
    const context = table.getContextByIndex(table.getSelectedIndex()) as Context;

    if (!context) {
      MessageBox.warning("Selecione uma entrega.");
      return null;
    }

    return context;
  }

  private refreshAllocations(): void {
    ((this.byId("tableAllocations") as Table).getBinding("rows") as ODataListBinding).refresh();
  }

  /** Functions OData retornam o array cru, sem envelope `value` — aceita as duas formas. */
  private unwrap<T>(result: unknown): T[] {
    if (Array.isArray(result)) {
      return result as T[];
    }
    return ((result as { value?: T[] })?.value) ?? [];
  }

  private dialogControl<T>(id: string): T {
    const dlgId = this.getView().getId() +
      "_siagrob1.view.salesContracts.reconciliation.fragments.ReconciliationDialog";
    return Fragment.byId(dlgId, id) as T;
  }
}
