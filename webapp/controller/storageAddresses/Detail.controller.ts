import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Text from "sap/m/Text";
import { HorizontalAlign } from "sap/ui/core/library";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import { Column as ExportColumn, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Sorter from "sap/ui/model/Sorter";
import FloatType from "sap/ui/model/type/Float";
import Column from "sap/ui/table/Column";
import { RowActionItem$PressEvent } from "sap/ui/table/RowActionItem";
import Table from "sap/ui/table/Table";
import {
  lotTotals,
  LotQualityAttrib,
  LotTransaction,
  pivotLotTransactions,
} from "siagrob1/helpers/StorageAddressDetailHelpers";
import CommonController from "../common/CommonController";

/** Texto do usuário dentro de literal OData: aspa simples se escreve dobrada. */
const quote = (value: string) => value.replace(/'/g, "''");

const PAGE_SIZE = 500;

/**
 * Tipos que a tela "Romaneio" (`storageTransactionsDetail`) atende — o mesmo escopo da lista de
 * Romaneios de Movimentação. Os demais (compra, venda...) têm telas próprias, com outras ações.
 */
const MOVEMENT_DETAIL_TYPES = [
  "Receipt", "Shipment", "TechnicalLoss", "SalesShipmentReturn", "WarehouseLoss", "WarehouseGain",
];

const emptyLot = () => ({
  rows: [] as LotTransaction[],
  attribs: [] as LotQualityAttrib[],
  count: 0,
  totals: lotTotals([]),
});

/**
 * Detalhe do Lote de Armazenagem (GAC-1198): os romaneios do lote e a classificação de cada um
 * numa tabela só. Somente leitura.
 *
 * @namespace siagrob1.controller.storageAddresses
 */
export default class Detail extends CommonController {

  private code: string;

  /** Colunas de classificação criadas na última carga — refeitas a cada lote aberto. */
  private qualityColumns: Column[] = [];

  /** Descarta a resposta de um lote que o usuário já deixou para trás. */
  private loadToken = 0;

  onInit(): void {
    this.getView().setModel(new JSONModel(emptyLot()), "lot");
    this.getRouter().getRoute("storageAddressesDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    this.code = id;

    this.getView().bindElement({ path: `/StorageAddresses('${quote(id)}')` });
    void this.loadTransactions();
  }

  onRefresh(): void {
    void this.loadTransactions();
  }

  /**
   * Lê todos os romaneios do lote e vira a classificação em colunas. A leitura é por páginas
   * porque o lote de um produtor grande passa de mil romaneios, e o total do rodapé só vale com
   * a lista inteira.
   */
  private async loadTransactions(): Promise<void> {
    const token = ++this.loadToken;
    const table = this.byId("tableStorageAddressTransactions") as Table;
    const lotModel = this.getView().getModel("lot") as JSONModel;

    // Lote novo na mesma view (ela sobrevive entre navegações): não deixa o anterior à mostra.
    lotModel.setData(emptyLot());
    this.rebuildQualityColumns([]);
    table.setBusy(true);

    try {
      const transactions = await this.requestAllTransactions();
      if (token !== this.loadToken) return;

      const { rows, attribs } = pivotLotTransactions(transactions);
      this.rebuildQualityColumns(attribs);
      lotModel.setData({ rows, attribs, count: rows.length, totals: lotTotals(rows) });
    } catch (err) {
      if (token !== this.loadToken) return;
      // Erro técnico de OData já foi mostrado pelo handler de mensagens do Component.
      if (!(err as { $reported?: boolean })?.$reported) {
        MessageBox.error((err as Error)?.message || "Erro ao carregar os romaneios do lote.");
      }
    } finally {
      if (token === this.loadToken) table.setBusy(false);
    }
  }

  private async requestAllTransactions(): Promise<LotTransaction[]> {
    const binding = (this.getModel() as ODataModel).bindList(
      "/StorageTransactions",
      undefined,
      // `$orderby` explícito: com `$skip`/`$top` o servidor reordena por chave e a ordem do
      // service se perde. RowId desempata os romaneios do mesmo dia.
      [new Sorter("TransactionDate"), new Sorter("RowId")],
      undefined,
      {
        $count: true,
        // Código exato: `contains` com "44" traria também o lote 144, o 440...
        $filter: `StorageAddressCode eq '${quote(this.code)}'`,
        $select: [
          "Key", "Code", "TransactionType", "TransactionStatus", "TransactionDate", "TruckCode",
          "InvoiceNumber", "GrossWeight", "DryingDiscount", "CleaningDiscount", "OthersDicount",
          "NetWeight", "UnitOfMeasureCode",
        ],
        $expand: {
          QualityInspections: {
            $select: ["Key", "QualityAttribCode", "Value"],
            $expand: { QualityAttrib: { $select: ["Code", "Name"] } },
          },
        },
      }
    );

    const transactions: LotTransaction[] = [];

    for (;;) {
      const contexts = await binding.requestContexts(transactions.length, PAGE_SIZE);
      transactions.push(...contexts.map((context) => context.getObject() as LotTransaction));

      // Pelo total, e não por "veio página curta": se o servidor limitar o tamanho da página,
      // uma página curta não significa fim da lista.
      const count = binding.getCount();
      if (contexts.length === 0) break;
      if (count === undefined ? contexts.length < PAGE_SIZE : transactions.length >= count) break;
    }

    return transactions;
  }

  /** Uma coluna por atributo de classificação que aparece nos romaneios deste lote. */
  private rebuildQualityColumns(attribs: LotQualityAttrib[]): void {
    const table = this.byId("tableStorageAddressTransactions") as Table;

    this.qualityColumns.forEach((column) => {
      table.removeColumn(column);
      column.destroy();
    });

    this.qualityColumns = attribs.map((attrib) => new Column({
      // O nome do cadastro já diz a unidade ("% UMIDADE", "PH", "FN"): não acrescenta "%".
      label: attrib.name,
      tooltip: `Classificação: ${attrib.name} (${attrib.code})`,
      sortProperty: attrib.property,
      hAlign: HorizontalAlign.End,
      width: "8rem",
      template: new Text({
        wrapping: false,
        text: {
          path: `lot>${attrib.property}`,
          // `as object`: a tipagem do Float só declara parte das opções do NumberFormat.
          type: new FloatType({
            decimals: 1, decimalSeparator: ",", groupingEnabled: true, groupingSeparator: ".",
          } as object),
        },
      }),
    }));

    this.qualityColumns.forEach((column) => table.addColumn(column));
  }

  onRowNavigate(ev: RowActionItem$PressEvent): void {
    const transaction = ev.getParameter("row").getBindingContext("lot").getObject() as LotTransaction;

    if (!MOVEMENT_DETAIL_TYPES.includes(transaction.TransactionType)) {
      MessageToast.show("Este tipo de romaneio é consultado na tela própria dele.");
      return;
    }

    this.navTo("storageTransactionsDetail", { id: transaction.Key });
  }

  onEdit(): void {
    this.navTo("storageAddressesEdit", { id: this.code });
  }

  navToStorageAddressesList(): void {
    this.navTo("storageAddresses");
  }

  private createColumnConfig(): ExportColumn[] {
    const number = (label: string, property: string, scale: number): ExportColumn =>
      ({ label, property, type: EdmType.Number, scale, delimiter: true });

    const attribs = (this.getView().getModel("lot") as JSONModel).getProperty("/attribs") as LotQualityAttrib[];

    return [
      {
        label: "Status", property: "TransactionStatus", type: EdmType.Enumeration,
        valueMap: {
          Pending: "Pendente", Confirmed: "Confirmado", Cancelled: "Cancelado",
          Invoiced: "Faturado", Returned: "Devolvido",
        },
      },
      { label: "Codigo", property: "Code", type: EdmType.String },
      { label: "Tipo", property: "TypeText", type: EdmType.String },
      { label: "Emissão", property: "TransactionDate", type: EdmType.Date },
      { label: "Veículo", property: "TruckCode", type: EdmType.String },
      { label: "Documento", property: "InvoiceNumber", type: EdmType.String },
      number("Peso Bruto", "GrossWeight", 3),
      number("Desc. Secagem", "DryingDiscount", 3),
      number("Desc. Limpeza", "CleaningDiscount", 3),
      number("Outros Desc.", "OthersDicount", 3),
      number("Peso Liquido", "NetWeight", 3),
      { label: "UM", property: "UnitOfMeasureCode", type: EdmType.String },
      ...attribs.map((attrib) => number(attrib.name, attrib.property, 1)),
    ];
  }

  onExcel(): void {
    const rows = (this.getView().getModel("lot") as JSONModel).getProperty("/rows") as LotTransaction[];

    if (!rows.length) {
      MessageBox.warning("O lote não tem romaneios para exportar.");
      return;
    }

    const setting: SpreadsheetSettings = {
      // O texto do tipo sai do mesmo formatter da tela, para a planilha nunca divergir dela.
      dataSource: rows.map((row) => ({
        ...row,
        TypeText: this.formatter.formatStorageTransactionType(row.TransactionType),
      })),
      fileName: `Lote de Armazenagem ${this.code}.xlsx`,
      workbook: {
        columns: this.createColumnConfig(),
        context: { sheetName: "Romaneios do Lote" },
      },
    };

    const sheet = new Spreadsheet(setting);
    void sheet.build().finally(() => sheet.destroy());
  }
}
