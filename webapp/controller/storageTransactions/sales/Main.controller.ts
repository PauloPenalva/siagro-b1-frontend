import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";

/** Romaneio selecionado, com o vínculo de carga que decide o que a tela pode fazer com ele. */
type SelectedShipment = {
  Key: string,
  Code: string,
  TransactionStatus: string,
  LoadKey?: string,
  LoadCode?: string,
  LoadStatus?: string,
}

/** Situações da carga, para o filtro — mesmos rótulos de formatter.formatShipmentLoadStatus. */
const SHIPMENT_LOAD_STATUSES = [
  { key: "Planned", text: "Planejada" },
  { key: "Open", text: "Carregada" },
  { key: "PartiallyInvoiced", text: "Faturada Parcial" },
  { key: "Invoiced", text: "Faturada" },
  { key: "Returned", text: "Devolvida" },
  { key: "Cancelled", text: "Cancelada" },
];

/**
 * Romaneios de Embarque.
 *
 * É a única tela em que o romaneio de embarque de venda aparece com a CARGA a que pertence, e a
 * única que chama o estorno (`ShippingTransactionsReverse`) — que ficou órfão quando a vinculação
 * virou página própria.
 *
 * O backend exige que o romaneio esteja SOLTO para estornar (o serviço recusa
 * `ShipmentLoadKey != null`) e que a carga não tenha nenhum documento de saída vivo para
 * desvincular. A tela antecipa as duas regras: em vez de deixar o usuário levar o erro, ela
 * oferece "Desvincular e estornar" quando a carga ainda não foi faturada, e explica qual carga
 * impede a operação quando já foi.
 *
 * A tela reaproveita a rota `storageTransactionsSales`, que existia sem menu e sem controller
 * próprio — a filterbar dela nunca chegou a filtrar nada, porque o controller herdado só conhece
 * a tabela da tela de armazenagem.
 *
 * @namespace siagrob1.controller.storageTransactions.sales
 */
export default class Main extends CommonController {

  formatter = { ...formatter };

  /** Trava de reentrância das actions: estorno e desvinculação mexem em saldo. */
  private _actionInFlight = false;

  onInit(): void {
    this.createFilterModel();
    this.getView().setModel(new JSONModel({ items: SHIPMENT_LOAD_STATUSES }), "loadStatuses");

    this.getRouter().getRoute("storageTransactionsSales")
      .attachPatternMatched(() => this.applyFilters());
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  onRefresh(): void {
    this.refreshShipments();
  }

  /**
   * Monta o `$filter` inteiro como string crua e o aplica como parâmetro estático do binding.
   * String crua e não `sap.ui.model.Filter` porque os enums (situação do romaneio e da carga) não
   * são serializáveis pelo modelo V4: ele estoura "Unsupported type" e a lista não filtra nada.
   *
   * `TransactionType eq 'SalesShipment'` é escopo fixo, não filtro: esta tela é só de embarque de
   * venda — a devolução tem outro ciclo e não se estorna por aqui.
   */
  private applyFilters(): void {
    const binding = this.byId("salesTransactionsTable")?.getBinding("rows") as ODataListBinding;
    if (!binding) return;

    const filterData = ((this.getModel("filter") as JSONModel)?.getData()
      ?? {}) as Record<string, string>;
    const filters: string[] = ["TransactionType eq 'SalesShipment'"];

    Object.keys(filterData).forEach((key) => {
      const value = filterData[key];
      if (!value) return;

      const esc = value.replace(/'/g, "''");

      if (key === "TransactionStatus") {
        filters.push(`${key} eq '${esc}'`);
      } else if (key === "HasLoad") {
        // O filtro mais útil da tela: "Sem carga" isola de imediato o que é estornável direto.
        filters.push(esc === "with" ? "ShipmentLoadKey ne null" : "ShipmentLoadKey eq null");
      } else if (key === "ShipmentLoadCode") {
        filters.push(`contains(ShipmentLoad/Code,'${esc}')`);
      } else if (key === "ShipmentLoadStatus") {
        filters.push(`ShipmentLoad/Status eq '${esc}'`);
      } else if (key === "DateFrom") {
        filters.push(`TransactionDate ge ${esc}`);
      } else if (key === "DateTo") {
        filters.push(`TransactionDate le ${esc}`);
      } else {
        filters.push(`contains(${key},'${esc}')`);
      }
    });

    binding.changeParameters({ $filter: filters.join(" and ") });
  }

  onDetail(): void {
    const shipment = this.selectedShipment();
    if (!shipment) return;

    this.navTo("storageTransactionsDetail", { id: shipment.Key });
  }

  // ---------------------------------------------------------------- carga

  async onDetachFromLoad(): Promise<void> {
    const shipment = this.selectedShipment();
    if (!shipment) return;

    if (!this.ensureDetachable(shipment)) return;

    if (!await DialogHelper.confirmDialog(
      `Desvincular o romaneio ${shipment.Code} da carga ${shipment.LoadCode} ?`)) return;

    await this.runAction(async () => {
      await this.detachAsync(shipment);
      MessageToast.show(`Romaneio ${shipment.Code} desvinculado da carga ${shipment.LoadCode}.`);
    });
  }

  /**
   * Estorno do embarque. Com a carga ainda sem faturamento o caminho não é recusar: é oferecer o
   * passo que falta. Desvincular e estornar viram uma decisão só, porque para o usuário elas SÃO
   * uma só — a separação é exigência do backend, não do negócio.
   */
  async onReverse(): Promise<void> {
    const shipment = this.selectedShipment();
    if (!shipment) return;

    if (shipment.TransactionStatus === "Invoiced") {
      MessageBox.warning(
        `O romaneio ${shipment.Code} já foi faturado e não pode ser estornado.`);
      return;
    }

    if (shipment.TransactionStatus === "Cancelled" || shipment.TransactionStatus === "Returned") {
      MessageBox.warning(`O romaneio ${shipment.Code} já está cancelado ou estornado.`);
      return;
    }

    let detachFirst = false;

    if (shipment.LoadKey) {
      if (!this.ensureDetachable(shipment)) return;

      const answer = await DialogHelper.confirmDialog(
        `O romaneio ${shipment.Code} está montado na carga ${shipment.LoadCode}. `
        + "Desvincular da carga e estornar o embarque ?",
        "Desvincular e estornar");

      if (!answer) return;
      detachFirst = true;
    } else if (!await DialogHelper.confirmDialog(
      `Estornar o embarque do romaneio ${shipment.Code} ? `
      + "O saldo volta para o contrato de compra e para a liberação de embarque.",
      "Estornar Embarque")) {
      return;
    }

    await this.runAction(async () => {
      if (detachFirst) await this.detachAsync(shipment);

      const action = (this.getModel() as ODataModel)
        .bindContext("/ShippingTransactionsReverse(...)");
      action.setParameter("Key", shipment.Key);
      await action.invoke();

      MessageToast.show(`Embarque do romaneio ${shipment.Code} estornado.`);
    });
  }

  private async detachAsync(shipment: SelectedShipment): Promise<void> {
    const action = (this.getModel() as ODataModel)
      .bindContext("/ShipmentLoadsDetachTransactions(...)");
    action.setParameter("Key", shipment.LoadKey);
    action.setParameter("StorageTransactionKeys", [shipment.Key]);
    await action.invoke();
  }

  /**
   * A UI decide pelo STATUS da carga; o backend decide pela existência de documento de saída vivo.
   * A diferença só produz falso-negativo — a tela pode deixar passar um caso que o backend recusa,
   * nunca o contrário — e aí a mensagem do backend aparece no MessageBox.
   */
  private ensureDetachable(shipment: SelectedShipment): boolean {
    if (!shipment.LoadKey) {
      MessageBox.warning(`O romaneio ${shipment.Code} não está vinculado a nenhuma carga.`);
      return false;
    }

    if (shipment.LoadStatus === "Cancelled") {
      MessageBox.warning(
        `A carga ${shipment.LoadCode} está cancelada — seus romaneios já foram devolvidos.`);
      return false;
    }

    if (shipment.LoadStatus === "PartiallyInvoiced" || shipment.LoadStatus === "Invoiced") {
      MessageBox.warning(
        `A carga ${shipment.LoadCode} já tem faturamento `
        + `(${formatter.formatShipmentLoadStatus(shipment.LoadStatus)}). `
        + "Cancele os documentos de saída da carga antes de desvincular este romaneio.");
      return false;
    }

    return true;
  }

  private async runAction(run: () => Promise<void>): Promise<void> {
    if (this._actionInFlight) return;
    this._actionInFlight = true;

    this.setBusy(true);
    try {
      await run();
      this.refreshShipments();
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
      this._actionInFlight = false;
    }
  }

  private selectedShipment(): SelectedShipment {
    const table = this.byId("salesTransactionsTable") as Table;
    const index = table?.getSelectedIndex() ?? -1;

    if (index < 0) {
      MessageBox.warning("Selecione um registro.");
      return undefined;
    }

    const ctx = table.getContextByIndex(index) as Context;

    // `getObject()` e não `getProperty("ShipmentLoad/Status")`: no romaneio SOLTO a navegação é
    // nula, e o getProperty por caminho estoura "Accessed value is not primitive" em vez de
    // devolver undefined — justamente no caso mais comum da tela, o do romaneio estornável.
    // A carga vem do $expand que o autoExpandSelect monta a partir das colunas.
    const row = ctx.getObject() as {
      Key: string,
      Code: string,
      TransactionStatus: string,
      ShipmentLoad?: { Key: string, Code: string, Status: string },
    };

    return {
      Key: row.Key,
      Code: row.Code,
      TransactionStatus: row.TransactionStatus,
      LoadKey: row.ShipmentLoad?.Key,
      LoadCode: row.ShipmentLoad?.Code,
      LoadStatus: row.ShipmentLoad?.Status,
    };
  }

  /**
   * O refresh é sempre da LISTA, nunca do contexto da linha: o GET por chave do backend não faz
   * Include da carga, então recarregar só a linha esvaziaria as colunas de carga.
   */
  private refreshShipments(): void {
    (this.byId("salesTransactionsTable")?.getBinding("rows") as ODataListBinding)?.refresh();
  }

  onExcel(): void {
    const binding = this.byId("salesTransactionsTable").getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Romaneios de embarque.xlsx",
      workbook: {
        columns: this.createColumnConfig(),
        hierarchyLevel: "Level",
        context: { sheetName: "Romaneios de embarque" },
      },
    };

    const sheet = new Spreadsheet(setting);
    void sheet.build().finally(function () {
      sheet.destroy();
    });
  }

  private createColumnConfig(): Column[] {
    const cols: Column[] = [];

    cols.push({ label: "Filial", property: "Branch/ShortName", type: EdmType.String });
    cols.push({ label: "Codigo", property: "Code", type: EdmType.String });
    cols.push({ label: "Emissão", property: "TransactionDate", type: EdmType.Date });
    cols.push({ label: "Carga", property: "ShipmentLoad/Code", type: EdmType.String });

    cols.push({
      label: "Situação da carga",
      property: "ShipmentLoad/Status",
      type: EdmType.Enumeration,
      valueMap: {
        Planned: "Planejada",
        Open: "Carregada",
        PartiallyInvoiced: "Faturada Parcial",
        Invoiced: "Faturada",
        Cancelled: "Cancelada",
      },
    });

    cols.push({
      label: "Status",
      property: "TransactionStatus",
      type: EdmType.Enumeration,
      valueMap: {
        Pending: "Pendente",
        Confirmed: "Confirmado",
        Cancelled: "Cancelado",
        Invoiced: "Faturado",
        Returned: "Estornado",
      },
    });

    cols.push({ label: "Veículo", property: "TruckCode", type: EdmType.String });
    cols.push({ label: "Documento", property: "InvoiceNumber", type: EdmType.String });
    cols.push({ label: "Peso Bruto", property: "GrossWeight", type: EdmType.Number });
    cols.push({ label: "Peso Liquido", property: "NetWeight", type: EdmType.Number });
    cols.push({ label: "Armazem", property: "WarehouseCode", type: EdmType.String });
    cols.push({ label: "Cli/For", property: "CardCode", type: EdmType.String });
    cols.push({ label: "Nome", property: "CardName", type: EdmType.String });
    cols.push({ label: "Cod.Produto", property: "ItemCode", type: EdmType.String });
    cols.push({ label: "Produto", property: "ItemName", type: EdmType.String });

    return cols;
  }
}
