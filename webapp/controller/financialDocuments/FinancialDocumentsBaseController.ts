import { Column, EdmType } from "sap/ui/export/library";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * Lógica comum das três listas de documento financeiro (Contas a Pagar, Contas a Receber e
 * Adiantamentos). As três leem o MESMO entity set — o que muda é o filtro fixo de direção e
 * de natureza, mais os rótulos. Concentrar aqui é o que impede as telas de divergirem, do
 * mesmo jeito que PurchaseContractsBaseController/SalesContractsBaseController fazem.
 */
export abstract class FinancialDocumentsBaseController extends CommonController {

  /** Id da sap.ui.table.Table da subclasse. */
  protected abstract get tableId(): string;

  /**
   * Os dois getters abaixo declaram `| null` e o eslint reclama que e redundante. Ele esta
   * certo HOJE: este projeto roda com `strictNullChecks: false`, entao null ja e atribuivel a
   * qualquer tipo. Mantemos assim mesmo porque o `| null` documenta o contrato para as tres
   * subclasses — `direction` e null em Adiantamentos, que mostra os dois lados — e porque no dia
   * em que `strictNullChecks` for ligado a anotacao vira correta e estes disables somem.
   * Remover o `| null` agora deixaria um tipo que mente e sobreviveria aquela migracao.
   */
  /** Direção fixa da tela, ou null quando a tela não filtra por direção (adiantamentos). */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected abstract get direction(): "Payable" | "Receivable" | null;

  /** Filtro fixo de natureza, em sintaxe OData, ou null. */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected abstract get natureFilter(): string | null;

  /** Nome da rota desta lista, guardado ao abrir o detalhe para o botão Voltar acertar o alvo. */
  protected abstract get originRoute(): string;

  protected binding(): ODataListBinding {
    return this.byId(this.tableId).getBinding("rows") as ODataListBinding;
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  /**
   * Ponto de entrada do gancho de rota das tres listas.
   *
   * O router deste app reaproveita a instancia da view, e `changeParameters` so refaz a busca
   * quando os parametros MUDAM — voltando do detalhe com o mesmo filtro, a lista mostraria
   * saldo e situacao anteriores a baixa que o usuario acabou de fazer. Por isso o refresh e
   * explicito. Custa um GET a mais quando o filtro mudou; e o preco de nunca exibir dinheiro
   * desatualizado.
   */
  protected onRouteMatched(): void {
    this.applyFilters();
    this.binding()?.refresh();
  }

  /**
   * Escapa um literal de string para o `$filter`: aspa simples vira duas, que e o escape do
   * OData v4. Sem isto, um parceiro chamado "Sant'Ana" — nome comum no Brasil — monta um
   * $filter malformado e a requisicao falha nas tres telas que herdam este metodo.
   */
  private static escapeODataLiteral(value: string): string {
    return String(value).replace(/'/g, "''");
  }

  /**
   * Monta o $filter como STRING CRUA e aplica por changeParameters.
   * sap.ui.model.Filter nao sabe formatar enum OData e estoura "Unsupported type".
   * undefined REMOVE o parametro — e assim que "Limpar" volta a trazer tudo.
   */
  protected applyFilters(): void {
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = (filterModel?.getData() ?? {}) as Record<string, string | boolean>;
    const filters: string[] = [];

    if (this.direction) {
      filters.push(`Direction eq '${this.direction}'`);
    }

    if (this.natureFilter) {
      filters.push(this.natureFilter);
    }

    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];

      if (value === "" || value === null || value === undefined || value === false) return;

      if (key === "Status" || key === "Nature") {
        filters.push(`${key} eq '${FinancialDocumentsBaseController.escapeODataLiteral(String(value))}'`);
      } else if (key === "DueFrom") {
        filters.push(`DueDate ge ${String(value)}`);
      } else if (key === "DueTo") {
        filters.push(`DueDate le ${String(value)}`);
      } else if (key === "OverdueOnly") {
        // IsOverdue e OpenAmount sao [NotMapped] no backend: nao existem como coluna e o EF
        // nao traduz nenhum dos dois para SQL, entao "$filter=IsOverdue eq true" estoura em
        // 500. Traduzido literalmente para as colunas reais que compoem a expressao, para o
        // filtro concordar com o realce vermelho da coluna Vencimento, que le IsOverdue.
        const today = new Date();
        const iso = [
          String(today.getFullYear()),
          String(today.getMonth() + 1).padStart(2, "0"),
          String(today.getDate()).padStart(2, "0"),
        ].join("-");

        filters.push(`DueDate lt ${iso} and NetAmount gt SettledAmount`);
      } else if (key === "BranchCode" || key === "CardCode") {
        filters.push(`${key} eq '${FinancialDocumentsBaseController.escapeODataLiteral(String(value))}'`);
      } else {
        filters.push(`contains(${key},'${FinancialDocumentsBaseController.escapeODataLiteral(String(value))}')`);
      }
    });

    this.binding()?.changeParameters({
      $filter: filters.length > 0 ? filters.join(" and ") : undefined,
    });
  }

  protected selectedContext(): Context | null {
    const oTable = this.byId(this.tableId) as Table;
    const i = oTable.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione um título.");
      return null;
    }
    return oTable.getContextByIndex(i) as Context;
  }

  onDetail(): void {
    const oContext = this.selectedContext();
    if (!oContext) return;

    // Guarda de onde o usuario veio: sem isto o Voltar do detalhe joga sempre na mesma lista,
    // e quem entrou por Contas a Receber acaba em Contas a Pagar.
    (this.getModel("viewModel") as JSONModel)
      .setProperty("/financialDocumentOriginRoute", this.originRoute);

    this.navTo("financialDocumentsDetail", { id: oContext.getProperty("Key") as string });
  }

  protected createColumnConfig(): Column[] {
    const aCols: Column[] = [];
    aCols.push({ label: "Título", property: "Code", type: EdmType.String });
    aCols.push({ label: "Cod.Parceiro", property: "CardCode", type: EdmType.String });
    aCols.push({ label: "Parceiro", property: "CardName", type: EdmType.String });
    aCols.push({
      label: "Natureza", property: "Nature", type: EdmType.Enumeration,
      valueMap: {
        "Provisional": "Provisório", "Firm": "Firme",
        "Advance": "Adiantamento", "TaxWithholding": "Retenção",
      },
    });
    aCols.push({
      label: "Situação", property: "Status", type: EdmType.Enumeration,
      valueMap: {
        "Open": "Em aberto", "PartiallySettled": "Baixado parcial",
        "Settled": "Quitado", "Canceled": "Cancelado",
      },
    });
    aCols.push({ label: "Emissão", property: "DocumentDate", type: EdmType.Date });
    aCols.push({ label: "Vencimento", property: "DueDate", type: EdmType.Date });
    aCols.push({ label: "Valor", property: "NetAmount", type: EdmType.Number, scale: 2, delimiter: true });
    aCols.push({ label: "Baixado", property: "SettledAmount", type: EdmType.Number, scale: 2, delimiter: true });
    aCols.push({ label: "Em aberto", property: "OpenAmount", type: EdmType.Number, scale: 2, delimiter: true });
    aCols.push({ label: "Contrato", property: "OriginDocNumber", type: EdmType.String });
    aCols.push({ label: "Filial", property: "BranchCode", type: EdmType.String });
    return aCols;
  }
}
