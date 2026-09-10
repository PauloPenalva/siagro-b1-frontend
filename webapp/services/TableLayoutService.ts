import ManagedObject from "sap/ui/base/ManagedObject";
import ElementRegistry from "sap/ui/core/ElementRegistry";
import View from "sap/ui/core/mvc/View";
import Table from "sap/ui/table/Table";
import Column from "sap/ui/table/Column";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import {
  CachedTableLayouts,
  TableColumnLayout,
  TableLayout,
  TableLayoutsResponse
} from "siagrob1/types/TableLayout";

/**
 * Espelho local do layout. Ao contrário do tema, NÃO sobrevive ao logout: é dado da conta, não
 * preferência do navegador.
 */
export const TABLE_LAYOUTS_KEY = "TABLE_LAYOUTS";

/** Só a ida ao servidor é adiada; o cache local é atualizado na hora. */
const PUT_DEBOUNCE_MS = 800;

/**
 * Propriedades que carregam o *conteúdo* da célula. `editable`/`visible`/`enabled` ficam de fora de
 * propósito: elas costumam apontar para um flag da tela, não para o dado da coluna.
 */
const CONTENT_PROPERTIES = ["text", "value", "number", "selectedKey", "selected", "src", "title"];

type BindingPart = { path?: string; model?: string };
type ContentBindingInfo = { path?: string; model?: string; parts?: (string | BindingPart)[] };
type BindingInfoProvider = { getBindingInfo(sName: string): ContentBindingInfo };
type TextProvider = { getText?: () => string };

/**
 * Largura e ordem das colunas por usuário (GAC-1163).
 *
 * O serviço é singleton e vive fora das views: uma tabela pode ser destruída (a navegação usa
 * `clearControlAggregation: true`) enquanto o PUT dela ainda está na fila, e o ajuste não pode se
 * perder por causa disso.
 */
class TableLayoutService {
  /** Layout conhecido de cada tabela, por chave. É a fonte que a aplicação consulta. */
  private layouts = new Map<string, TableColumnLayout[]>();

  private username = "";

  /**
   * Tabelas cujo layout o servidor ainda não confirmou. É o que impede o GET do boot de apagar um
   * ajuste cujo PUT falhou: a falha é muda, então sem esta fila o espelho local era a única cópia,
   * e a primeira resposta do servidor sem aquela tabela a jogava fora.
   */
  private pending = new Set<string>();

  /** Raízes já varridas (view ou diálogo) - a varredura é cara e só precisa rodar uma vez. */
  private scanned = new WeakSet<ManagedObject>();

  private registered = new WeakSet<Table>();

  /**
   * Largura declarada no XML, por coluna. Guardada ANTES de aplicar o layout do usuário: é o que
   * permite gravar só o que diverge do padrão e, com isso, deixar uma mudança futura de default
   * chegar a quem já personalizou.
   */
  private columnDefaults = new WeakMap<Column, string>();

  /** Ordem declarada no XML, por tabela. Só serve para a restauração do padrão. */
  private declaredOrder = new WeakMap<Table, Column[]>();

  private timers = new Map<string, number>();

  /** Trava contra cascata durante a aplicação programática. */
  private applying = false;

  private warnedMissingView = false;

  /* ------------------------------------------------------------------ */
  /* Carga e cache                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Lê os layouts do servidor. Chamado uma única vez no boot, junto do menu e da filial - o custo de
   * uma chamada por tabela na abertura de cada tela seria muito maior.
   *
   * O servidor manda só no que ele já confirmou. O que está na fila de pendentes vence a resposta e
   * é reenviado - senão um PUT que falhou em silêncio seria apagado no próximo boot.
   */
  public async load(username?: string): Promise<void> {
    if (username) {
      this.username = username;
    }

    const response = await new RequestModel().get<TableLayoutsResponse>(ServerRoutes.myTableLayouts);

    const unsynced = Array.from(this.pending)
      .filter((tableKey) => this.layouts.has(tableKey))
      .map((tableKey) => [tableKey, this.layouts.get(tableKey)] as const);

    this.fill(response?.layouts ?? []);

    this.pending = new Set(unsynced.map(([tableKey]) => tableKey));
    unsynced.forEach(([tableKey, columns]) => this.layouts.set(tableKey, columns));

    this.writeMirror();

    await Promise.all(unsynced.map(([tableKey, columns]) => this.put(tableKey, columns)));
  }

  /**
   * Aplica o espelho local antes da resposta do servidor. Não existe flash a evitar (o roteador só
   * inicia depois do `hydrate`), mas isto mantém o usuário com o layout dele quando o GET falha.
   */
  public applyCachedLayouts(username?: string): void {
    this.username = username ?? "";

    if (!this.username) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(TABLE_LAYOUTS_KEY);

      if (!raw) {
        return;
      }

      const cached = JSON.parse(raw) as CachedTableLayouts;

      // Duas contas dividem a mesma máquina: sem esta conferência o usuário B veria o layout do A.
      if (cached?.username !== this.username) {
        window.localStorage.removeItem(TABLE_LAYOUTS_KEY);
        return;
      }

      const layouts = cached.layouts ?? [];

      this.fill(layouts);

      // Espelho sem `pending` é anterior à fila: nada garante que chegou ao servidor, então tudo
      // conta como pendente. É o que recupera quem ainda tem o layout só no navegador.
      this.pending = new Set(cached.pending ?? layouts.map((layout) => layout.tableKey));
    } catch (error) {
      console.warn("Espelho local do layout das tabelas ilegível.", error);
      window.localStorage.removeItem(TABLE_LAYOUTS_KEY);
    }
  }

  /** Quantas tabelas o usuário personalizou - alimenta o resumo em "Meu Perfil". */
  public count(): number {
    return this.layouts.size;
  }

  /**
   * Reordena as colunas de um export para Excel na ordem em que a tabela está na TELA.
   *
   * O casamento é entre a `property` da coluna de export e a chave derivada da coluna da tabela -
   * as duas usam o mesmo caminho de binding (`Branch/ShortName`, `Status`, `Type`...).
   *
   * Nada é adicionado nem removido: é só uma permutação, então o conteúdo da planilha é o mesmo.
   * As colunas que só existem no export (a maioria das telas tem algumas) ficam ancoradas na
   * vizinha à esquerda pelo mesmo merge da ordem das colunas - é o que garante que, para quem NÃO
   * personalizou nada, a planilha continue idêntica à de hoje.
   */
  public orderExportColumns<T extends { property?: string | string[] }>(
    oTable: Table, aColumns: T[]
  ): T[] {
    if (!oTable || oTable.isDestroyed() || !aColumns?.length) {
      return aColumns;
    }

    const tableKeys = this.deriveColumnKeys(oTable.getColumns());
    const exportKeys = aColumns.map((column) =>
      typeof column.property === "string" ? column.property : "");

    const order = this.mergeOrder(exportKeys, tableKeys);

    return order ? order.map((index) => aColumns[index]) : aColumns;
  }

  /** Restauração do padrão, acionada em "Meu Perfil". */
  public async clearAll(): Promise<void> {
    await new RequestModel().delete(ServerRoutes.myTableLayouts);

    this.clearTimers();
    this.layouts.clear();
    this.pending.clear();
    this.writeMirror();
    this.restoreDeclaredLayout();
  }

  /**
   * Devolve as tabelas VIVAS ao que o XML declara.
   *
   * Sem isto o usuário clica em "Restaurar", volta para a tela e continua vendo o layout antigo: o
   * roteador reaproveita a instância da view, e `clearControlAggregation` limpa a agregação do
   * container, não as colunas. Só um F5 corrigiria - e ninguém vai adivinhar isso.
   */
  private restoreDeclaredLayout(): void {
    this.applying = true;

    try {
      ElementRegistry.forEach((element) => {
        if (!this.isTable(element)) {
          return;
        }

        const declared = this.declaredOrder.get(element);

        if (!declared) {
          return;
        }

        declared.forEach((column) => column.setWidth(this.columnDefaults.get(column) ?? ""));

        this.applyOrder(element, declared);
      });
    } finally {
      this.applying = false;
    }
  }

  /** Zera tudo. Chamado no logout. */
  public reset(): void {
    this.clearTimers();
    this.layouts.clear();
    this.pending.clear();
    this.username = "";

    try {
      window.localStorage.removeItem(TABLE_LAYOUTS_KEY);
    } catch (error) {
      console.warn("Não foi possível limpar o layout das tabelas.", error);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Registro                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Varre uma raiz (view ou diálogo) e registra todas as `sap.ui.table.Table` encontradas.
   *
   * Chamado pelo `BaseController` no `onBeforeRendering`, e explicitamente para os diálogos, que
   * renderizam por conta própria e não passam pelo ciclo da view.
   */
  public registerTables(oRoot?: ManagedObject): void {
    if (!oRoot || this.scanned.has(oRoot)) {
      return;
    }

    this.scanned.add(oRoot);

    const tables = oRoot.findAggregatedObjects(
      true,
      (control: ManagedObject) => control.isA("sap.ui.table.Table")
    ) as Table[];

    tables.forEach((table) => this.registerTable(table));
  }

  private registerTable(oTable: Table): void {
    if (this.registered.has(oTable)) {
      return;
    }

    this.registered.add(oTable);

    const tableKey = this.deriveTableKey(oTable);

    if (!tableKey) {
      return;
    }

    // Estado declarado no XML, capturado ANTES de aplicar o do usuário: é o que a restauração do
    // padrão devolve, e o que permite gravar só as larguras que divergem.
    const columns = oTable.getColumns();

    columns.forEach((column) => {
      if (!this.columnDefaults.has(column)) {
        this.columnDefaults.set(column, column.getWidth() ?? "");
      }
    });

    this.declaredOrder.set(oTable, columns.slice());

    this.applyLayout(oTable, tableKey);

    // Os handlers entram DEPOIS da aplicação: assim a cascata é impossível por construção, e não só
    // pelo flag `applying`.
    oTable.attachColumnResize(() => this.onColumnChanged(oTable, tableKey));
    oTable.attachColumnMove(() => this.onColumnChanged(oTable, tableKey));
  }

  /* ------------------------------------------------------------------ */
  /* Identidade                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * `<viewName>::[<escopo>--]<localId>` - ex.
   * `siagrob1.view.purchaseContracts.Main::tablePurchaseContracts`.
   *
   * O nome da view vem do markup e por isso é estável entre sessões; o id de runtime não é (o
   * prefixo do container é gerado). Isso também separa as duas tabelas homônimas
   * `tableReleaseTransactions`, que existem em fragments de telas diferentes.
   *
   * `View#getLocalId` não serve sozinho: ele só casa com o prefixo `"<viewId>--"`, e o
   * `DialogHelper` monta o id do diálogo com `"_"`.
   */
  private deriveTableKey(oTable: Table): string {
    const view = this.findView(oTable);

    if (!view) {
      if (!this.warnedMissingView) {
        this.warnedMissingView = true;
        console.warn("Tabela fora de uma view: layout não será persistido.", oTable.getId());
      }
      return null;
    }

    const viewId = view.getId();
    const tableId = oTable.getId();

    let suffix = tableId.startsWith(viewId) ? tableId.slice(viewId.length) : tableId;
    suffix = suffix.replace(/^[-_]+/, "");

    // Id gerado pelo runtime (`__xmlfragment0--...`): o contador reinicia a cada boot, então a chave
    // não seria a mesma amanhã. Melhor não persistir do que encher o banco de chaves mortas.
    if (suffix.includes("__")) {
      return null;
    }

    const parts = suffix.split("--");
    const localId = parts.pop() || tableId;
    const scope = parts
      .map((part) => part.split(".").pop())
      .filter(Boolean)
      .join("--");

    return `${view.getViewName()}::${scope ? `${scope}--` : ""}${localId}`;
  }

  private findView(oControl: ManagedObject): View {
    let parent: ManagedObject = oControl.getParent();

    while (parent) {
      if (this.isView(parent)) {
        return parent;
      }
      parent = parent.getParent();
    }

    return null;
  }

  /**
   * Predicado próprio: usar `isA` direto no laço faz o TypeScript estreitar o ramo negativo para
   * `never`, e a linha seguinte deixa de compilar.
   */
  private isView(oControl: ManagedObject): oControl is View {
    return oControl.isA("sap.ui.core.mvc.View");
  }

  private isTable(oControl: ManagedObject): oControl is Table {
    return oControl.isA("sap.ui.table.Table");
  }

  /**
   * Chave de cada coluna. Nenhuma das colunas do app declara `id`, então ela é derivada - e a
   * primeira candidata **ainda livre naquela tabela** vence.
   *
   * O fall-through não é detalhe: três telas têm a coluna "Tipo de Contrato" com
   * `sortProperty="Code"` copiado da coluna "Codigo". Sem ele as duas disputariam a mesma chave;
   * com ele a segunda cai no path do template e vira `Type`, que é o certo. Corrigir aquele
   * `sortProperty` depois não muda a chave, então o layout de ninguém é perdido.
   */
  private deriveColumnKeys(aColumns: Column[]): string[] {
    const taken = new Set<string>();

    return aColumns.map((column, index) => {
      const label = this.labelText(column);

      const candidates = [
        column.getSortProperty(),
        column.getFilterProperty(),
        this.templatePath(column),
        label ? `label:${label}` : ""
      ].filter(Boolean);

      let key = candidates.find((candidate) => !taken.has(candidate)) ?? candidates[0] ?? `col${index}`;

      // Só para a coluna genuinamente duplicada (duas "Modelo" idênticas no cadastro de veículos).
      if (taken.has(key)) {
        let suffix = 2;
        while (taken.has(`${key}#${suffix}`)) {
          suffix++;
        }
        key = `${key}#${suffix}`;
      }

      taken.add(key);
      return key;
    });
  }

  private templatePath(oColumn: Column): string {
    const template = oColumn.getTemplate();

    if (!template || typeof template === "string") {
      return "";
    }

    const provider = template as unknown as BindingInfoProvider;

    for (const property of CONTENT_PROPERTIES) {
      const info = provider.getBindingInfo(property);

      if (!info) {
        continue;
      }

      if (info.path) {
        return this.withModel(info.model, info.path);
      }

      // Binding composto: junta TODAS as partes. É o que separa as três colunas de quantidade
      // entregue da Conferência de Entregas, que compartilham o mesmo primeiro path.
      const joined = (info.parts ?? [])
        .map((part) => (typeof part === "string" ? part : this.withModel(part.model, part.path)))
        .filter(Boolean)
        .join("+");

      if (joined) {
        return joined;
      }
    }

    return "";
  }

  private withModel(model?: string, path?: string): string {
    if (!path) {
      return "";
    }

    return model ? `${model}>${path}` : path;
  }

  private labelText(oColumn: Column): string {
    const label = oColumn.getLabel();

    if (!label) {
      return "";
    }

    if (typeof label === "string") {
      return label;
    }

    const provider = label as unknown as TextProvider;

    return typeof provider.getText === "function" ? provider.getText() ?? "" : "";
  }

  /* ------------------------------------------------------------------ */
  /* Aplicação                                                           */
  /* ------------------------------------------------------------------ */

  private applyLayout(oTable: Table, sTableKey: string): void {
    const saved = this.layouts.get(sTableKey);

    if (!saved?.length) {
      return;
    }

    this.applying = true;

    try {
      const columns = oTable.getColumns();
      const keys = this.deriveColumnKeys(columns);

      const widths = new Map<string, string>();
      saved.forEach((entry) => {
        if (entry.width) {
          widths.set(entry.key, entry.width);
        }
      });

      columns.forEach((column, index) => {
        const width = widths.get(keys[index]);

        if (width && column.getWidth() !== width) {
          column.setWidth(width);
        }
      });

      const order = this.mergeOrder(keys, saved.map((entry) => entry.key));

      if (order) {
        this.applyOrder(oTable, order.map((index) => columns[index]));
      }
    } finally {
      this.applying = false;
    }
  }

  /**
   * Ordem final: as colunas conhecidas seguem a ordem salva, e as novas ficam ao lado da vizinha
   * conhecida à esquerda - ou seja, na posição em que o desenvolvedor as declarou.
   *
   * A alternativa ("só aplicar se o conjunto de chaves for idêntico") jogaria fora a personalização
   * de todos os usuários daquela tela a cada coluna nova, sem aviso.
   *
   * @returns os índices na ordem desejada, ou `null` quando a tabela mudou demais.
   */
  private mergeOrder(aCurrentKeys: string[], aSavedKeys: string[]): number[] {
    const savedIndex = new Map<string, number>();
    aSavedKeys.forEach((key, index) => savedIndex.set(key, index));

    const known = aCurrentKeys.filter((key) => savedIndex.has(key)).length;

    // Tabela reescrita: menos da metade reconhecida, a ordem salva não diz mais nada.
    if (known < Math.ceil(aCurrentKeys.length / 2)) {
      return null;
    }

    let rank = -1;
    const ranks = aCurrentKeys.map((key) => {
      const index = savedIndex.get(key);

      if (index !== undefined) {
        rank = index;
        return index;
      }

      // Coluna nova: logo depois da vizinha conhecida à esquerda.
      rank += 1e-3;
      return rank;
    });

    return aCurrentKeys
      .map((_, index) => index)
      .sort((a, b) => ranks[a] - ranks[b] || a - b);
  }

  private applyOrder(oTable: Table, aDesired: Column[]): void {
    const current = oTable.getColumns();
    const desired = aDesired;

    if (desired.length !== current.length || desired.some((column) => !column)) {
      return;
    }

    if (desired.every((column, index) => column === current[index])) {
      return;
    }

    // `removeAllColumns` limpa `_aSortedColumns`. Inofensivo aqui porque nenhuma coluna do app
    // declara `sorted`/`sortOrder` e isto roda uma única vez, antes de qualquer interação do
    // usuário - reordenar depois de ele ordenar apagaria o indicador de ordenação.
    oTable.removeAllColumns();
    desired.forEach((column) => oTable.addColumn(column));
  }

  /* ------------------------------------------------------------------ */
  /* Captura                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * `columnResize` e `columnMove` são `allowPreventDefault` e disparam ANTES de a mudança ser
   * aplicada - por isso o estado nunca é reconstruído a partir dos parâmetros do evento, e sim lido
   * da tabela um macrotask depois, quando já é o final.
   *
   * O snapshot e o cache são imediatos; só o PUT entra em debounce. Assim, redimensionar e navegar
   * em 300 ms não perde o ajuste.
   */
  private onColumnChanged(oTable: Table, sTableKey: string): void {
    if (this.applying) {
      return;
    }

    window.setTimeout(() => {
      if (oTable.isDestroyed()) {
        return;
      }

      const columns = this.readLayout(oTable);

      if (JSON.stringify(columns) === JSON.stringify(this.layouts.get(sTableKey))) {
        return;
      }

      this.layouts.set(sTableKey, columns);
      this.pending.add(sTableKey);
      this.writeMirror();
      this.schedulePut(sTableKey, columns);
    }, 0);
  }

  private readLayout(oTable: Table): TableColumnLayout[] {
    const columns = oTable.getColumns();
    const keys = this.deriveColumnKeys(columns);

    return columns.map((column, index) => {
      const width = column.getWidth() ?? "";
      const declared = this.columnDefaults.get(column) ?? "";
      const entry: TableColumnLayout = { key: keys[index] };

      // Só o que diverge do XML: gravar a largura padrão a congelaria para sempre naquele usuário,
      // e uma mudança futura de default nunca chegaria a ele.
      if (width && width !== declared) {
        entry.width = width;
      }

      return entry;
    });
  }

  private schedulePut(sTableKey: string, aColumns: TableColumnLayout[]): void {
    window.clearTimeout(this.timers.get(sTableKey));

    this.timers.set(
      sTableKey,
      window.setTimeout(() => {
        this.timers.delete(sTableKey);
        void this.put(sTableKey, aColumns);
      }, PUT_DEBOUNCE_MS)
    );
  }

  /**
   * Falha aqui é muda de propósito: um MessageBox por gravação frustrada seria insuportável, e um
   * 401 não deve expulsar ninguém para o login por causa de um redimensionamento. Muda, mas não
   * perdida: a tabela fica na fila de pendentes e é reenviada no próximo boot.
   */
  private async put(sTableKey: string, aColumns: TableColumnLayout[]): Promise<void> {
    try {
      await new RequestModel({ tableKey: sTableKey, columns: aColumns })
        .put(ServerRoutes.myTableLayouts);

      // Comparação por referência: se o usuário mexeu de novo enquanto este PUT voava, há outro na
      // fila, e é ele quem decide se a tabela sai dela.
      if (this.layouts.get(sTableKey) === aColumns) {
        this.pending.delete(sTableKey);
        this.writeMirror();
      }
    } catch (error) {
      console.warn("Falha ao salvar o layout da tabela.", sTableKey, error);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Interno                                                             */
  /* ------------------------------------------------------------------ */

  private fill(aLayouts: TableLayout[]): void {
    this.layouts.clear();

    aLayouts.forEach((layout) => {
      if (layout?.tableKey && Array.isArray(layout.columns)) {
        this.layouts.set(layout.tableKey, layout.columns);
      }
    });
  }

  private writeMirror(): void {
    if (!this.username) {
      return;
    }

    const payload: CachedTableLayouts = {
      username: this.username,
      layouts: Array.from(this.layouts, ([tableKey, columns]) => ({ tableKey, columns })),
      pending: Array.from(this.pending)
    };

    try {
      window.localStorage.setItem(TABLE_LAYOUTS_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Não foi possível espelhar o layout das tabelas.", error);
    }
  }

  private clearTimers(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.clear();
  }
}

export default new TableLayoutService();
