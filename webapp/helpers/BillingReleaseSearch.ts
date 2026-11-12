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
 * Filtra as liberações de venda do diálogo de faturamento pelo texto digitado (GAC-1217).
 * Cada palavra precisa aparecer em alguma das colunas de texto da linha — "cargill 763" acha
 * o contrato 763 da Cargill. Busca vazia devolve a própria lista.
 */
export function filterBillingReleases<T extends SearchableBillingRelease>(releases: T[], query: string): T[] {
  if (!Array.isArray(releases)) {
    return [];
  }

  const words = normalize(query).split(/\s+/).filter(Boolean);

  if (!words.length) {
    return releases;
  }

  return releases.filter((release) => {
    const text = normalize(SEARCHED_FIELDS.map((field) => release?.[field] ?? "").join(" "));

    return words.every((word) => text.includes(word));
  });
}
