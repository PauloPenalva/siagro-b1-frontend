import ManagedObject from "sap/ui/base/ManagedObject";
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

  /** Raízes já varridas (view ou diálogo) - a varredura é cara e só precisa rodar uma vez. */
  private scanned = new WeakSet<ManagedObject>();

  private registered = new WeakSet<Table>();

  /**
   * Largura declarada no XML, por coluna. Guardada ANTES de aplicar o layout do usuário: é o que
   * permite gravar só o que diverge do padrão e, com isso, deixar uma mudança futura de default
   * chegar a quem já personalizou.
   */
  private columnDefaults = new WeakMap<Column, string>();

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
   */
  public async load(username?: string): Promise<void> {
    if (username) {
      this.username = username;
    }

    const response = await new RequestModel().get<TableLayoutsResponse>(ServerRoutes.myTableLayouts);

    this.fill(response?.Layouts ?? []);
    this.writeMirror();
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

      this.fill(cached.layouts ?? []);
    } catch (error) {
      console.warn("Espelho local do layout das tabelas ilegível.", error);
      window.localStorage.removeItem(TABLE_LAYOUTS_KEY);
    }
  }

  /** Quantas tabelas o usuário personalizou - alimenta o resumo em "Meu Perfil". */
  public count(): number {
    return this.layouts.size;
  }

  /** Restauração do padrão, acionada em "Meu Perfil". */
  public async clearAll(): Promise<void> {
    await new RequestModel().delete(ServerRoutes.myTableLayouts);

    this.clearTimers();
    this.layouts.clear();
    this.writeMirror();
  }

  /** Zera tudo. Chamado no logout. */
  public reset(): void {
    this.clearTimers();
    this.layouts.clear();
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

    oTable.getColumns().forEach((column) => {
      if (!this.columnDefaults.has(column)) {
        this.columnDefaults.set(column, column.getWidth() ?? "");
      }
    });

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
        if (entry.Width) {
          widths.set(entry.Key, entry.Width);
        }
      });

      columns.forEach((column, index) => {
        const width = widths.get(keys[index]);

        if (width && column.getWidth() !== width) {
          column.setWidth(width);
        }
      });

      const order = this.mergeOrder(keys, saved.map((entry) => entry.Key));

      if (order) {
        this.applyOrder(oTable, order);
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

  private applyOrder(oTable: Table, aOrder: number[]): void {
    const current = oTable.getColumns();
    const desired = aOrder.map((index) => current[index]);

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
      const entry: TableColumnLayout = { Key: keys[index] };

      // Só o que diverge do XML: gravar a largura padrão a congelaria para sempre naquele usuário,
      // e uma mudança futura de default nunca chegaria a ele.
      if (width && width !== declared) {
        entry.Width = width;
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
   * 401 não deve expulsar ninguém para o login por causa de um redimensionamento.
   */
  private async put(sTableKey: string, aColumns: TableColumnLayout[]): Promise<void> {
    try {
      await new RequestModel({ TableKey: sTableKey, Columns: aColumns })
        .put(ServerRoutes.myTableLayouts);
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
      if (layout?.TableKey && Array.isArray(layout.Columns)) {
        this.layouts.set(layout.TableKey, layout.Columns);
      }
    });
  }

  private writeMirror(): void {
    if (!this.username) {
      return;
    }

    const payload: CachedTableLayouts = {
      username: this.username,
      layouts: Array.from(this.layouts, ([TableKey, Columns]) => ({ TableKey, Columns }))
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
