import { filterRowsByWords } from "siagrob1/helpers/BillingReleaseSearch";

/** Tipo do contrato planejado — o mesmo valor que a action recebe em `ContractType`. */
export type PlannedContractType = "Purchase" | "Sales";

/**
 * Liberação de embarque (compra) oferecida ao planejamento da carga: linha da function
 * `ShipmentReleasesGetPurchaseContracts`, a mesma da Seleção de Liberação da Expedição de Grãos.
 */
export type PlannedPurchaseRelease = {
  ShipmentReleaseKey?: string,
  BranchShortName?: string,
  PurchaseContractCode?: string,
  RowId?: number,
  FName?: string,
  TaxId?: string,
  City?: string,
  State?: string,
  DeliveryLocationCode?: string,
  DeliveryLocationName?: string,
  /** Nome fantasia do armazém (AliasName do cadastro), com a razão social como reserva. */
  WarehouseFName?: string,
  /** Região logística do CONTRATO de compra; vazia quando o contrato não tem. */
  LogisticRegionCode?: string,
  LogisticRegionName?: string,
  ItemName?: string,
}

/**
 * Liberação de entrega (venda) oferecida ao planejamento da carga: linha da function
 * `SalesShipmentReleasesGetAvailable`, a mesma do diálogo de Faturamento.
 */
export type PlannedSalesRelease = {
  SalesShipmentReleaseKey?: string,
  BranchShortName?: string,
  SalesContractCode?: string,
  Complement?: string,
  CardCode?: string,
  CardName?: string,
  CardFName?: string,
  DeliveryLocationCode?: string,
  DeliveryLocationName?: string,
}

const PURCHASE_SEARCHED_FIELDS: (keyof PlannedPurchaseRelease)[] = [
  "BranchShortName",
  "PurchaseContractCode",
  "FName",
  "TaxId",
  "City",
  "State",
  "DeliveryLocationCode",
  "DeliveryLocationName",
  "WarehouseFName",
  "LogisticRegionCode",
  "LogisticRegionName",
  "ItemName",
];

/** Busca digitada acima da lista de liberações de compra do planejamento da carga (GAC-1185). */
export function filterPlannedPurchaseReleases<T extends PlannedPurchaseRelease>(releases: T[], query: string): T[] {
  return filterRowsByWords(releases, query, PURCHASE_SEARCHED_FIELDS);
}

/**
 * Chave da liberação escolhida, conforme o tipo: é o `ReleaseKey` da action. Vazio quando não há
 * linha — ou quando a linha é do outro tipo, para uma chave de venda nunca viajar como compra.
 */
export function plannedReleaseKey(
  type: PlannedContractType,
  release: PlannedPurchaseRelease & PlannedSalesRelease
): string {
  const key = type === "Purchase" ? release?.ShipmentReleaseKey : release?.SalesShipmentReleaseKey;

  return key ?? "";
}

/**
 * Posição de uma linha na ordem EXIBIDA pela tabela (`rowAt` lê a linha de cada índice, já com a
 * ordenação e o filtro de coluna do usuário). A seleção da sap.ui.table é por esse índice, que só
 * coincide com a posição no array de dados enquanto ninguém ordena uma coluna. Devolve -1 quando
 * não há linha procurada ou ela não está entre as exibidas.
 */
export function findRowIndex<T>(length: number, rowAt: (index: number) => T, target: T): number {
  if (!target) {
    return -1;
  }

  for (let index = 0; index < length; index++) {
    if (rowAt(index) === target) {
      return index;
    }
  }

  return -1;
}

/**
 * Quantidade prevista digitada no diálogo. É opcional: vazio vale (`null`); preenchida, precisa
 * ser um número maior que zero.
 */
export function parsePlannedQuantity(text: string): { valid: boolean, value: number } {
  const trimmed = `${text ?? ""}`.trim();

  if (trimmed === "") {
    return { valid: true, value: null };
  }

  const value = Number(trimmed);

  return value > 0 ? { valid: true, value } : { valid: false, value: null };
}
