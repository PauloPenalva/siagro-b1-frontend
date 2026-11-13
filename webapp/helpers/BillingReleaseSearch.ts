/** Colunas da liberação de venda em que a busca do diálogo de faturamento procura. */
export type SearchableBillingRelease = {
  BranchShortName?: string,
  SalesContractCode?: string,
  Complement?: string,
  CardCode?: string,
  CardName?: string,
  CardFName?: string,
  DeliveryLocationCode?: string,
  DeliveryLocationName?: string,
}

const SEARCHED_FIELDS: (keyof SearchableBillingRelease)[] = [
  "BranchShortName",
  "SalesContractCode",
  "Complement",
  "CardCode",
  "CardName",
  "CardFName",
  "DeliveryLocationCode",
  "DeliveryLocationName",
];

/** Minúsculas e sem acento, para a busca não depender de como o cadastro foi digitado. */
function normalize(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Filtra linhas pelo texto digitado: cada palavra precisa aparecer em alguma das colunas
 * informadas — "cargill 763" acha o contrato 763 da Cargill. Busca vazia devolve a própria
 * lista (mesma referência), e lista ausente vira lista vazia.
 */
export function filterRowsByWords<T>(rows: T[], query: string, fields: (keyof T)[]): T[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const words = normalize(query).split(/\s+/).filter(Boolean);

  if (!words.length) {
    return rows;
  }

  return rows.filter((row) => {
    const text = normalize(fields.map((field) => {
      const value = row?.[field];
      return typeof value === "string" ? value : "";
    }).join(" "));

    return words.every((word) => text.includes(word));
  });
}

/** Filtra as liberações de venda do diálogo de faturamento pelo texto digitado (GAC-1217). */
export function filterBillingReleases<T extends SearchableBillingRelease>(releases: T[], query: string): T[] {
  return filterRowsByWords(releases, query, SEARCHED_FIELDS);
}
