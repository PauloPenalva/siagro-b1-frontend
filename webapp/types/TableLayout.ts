/**
 * Layout de tabela por usuário (GAC-1163) - contrato de `/security/users/me/table-layouts`.
 */

/** Uma coluna. A posição é a do array; não existe campo de posição. */
export type TableColumnLayout = {
  /** Chave derivada da coluna - ver `TableLayoutService.deriveColumnKeys`. */
  Key: string;

  /** Ausente/nula quando a coluna está na largura padrão declarada no XML. */
  Width?: string;
};

export type TableLayout = {
  /** `<viewName>::[<escopo>--]<localId>`. */
  TableKey: string;
  Version?: number;
  Columns: TableColumnLayout[];
  UpdatedAt?: string;
};

export type TableLayoutsResponse = {
  Layouts?: TableLayout[];
};

/**
 * Espelho em `localStorage`. O username faz parte do documento porque duas contas dividem a mesma
 * máquina: sem ele, o usuário B veria por um instante o layout do usuário A.
 */
export type CachedTableLayouts = {
  username: string;
  layouts: TableLayout[];
};
