/**
 * Layout de tabela por usuário (GAC-1163) - contrato de `/security/users/me/table-layouts`.
 *
 * Os campos são camelCase porque é assim que o ASP.NET Core serializa a resposta. Na ida o nome não
 * importaria (o binding do servidor ignora caixa), mas manter os dois lados iguais evita que o
 * mesmo tipo sirva para ler e não para escrever.
 */

/** Uma coluna. A posição é a do array; não existe campo de posição. */
export type TableColumnLayout = {
  /** Chave derivada da coluna - ver `TableLayoutService.deriveColumnKeys`. */
  key: string;

  /** Ausente quando a coluna está na largura padrão declarada no XML. */
  width?: string;
};

export type TableLayout = {
  /** `<viewName>::[<escopo>--]<localId>`. */
  tableKey: string;
  version?: number;
  columns: TableColumnLayout[];
  updatedAt?: string;
};

export type TableLayoutsResponse = {
  layouts?: TableLayout[];
};

/**
 * Espelho em `localStorage`. O username faz parte do documento porque duas contas dividem a mesma
 * máquina: sem ele, o usuário B veria por um instante o layout do usuário A.
 */
export type CachedTableLayouts = {
  username: string;
  layouts: TableLayout[];
};
