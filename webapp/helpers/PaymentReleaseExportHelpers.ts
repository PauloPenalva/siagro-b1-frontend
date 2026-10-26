import formatter from "siagrob1/model/formatter";

/** Departamentos da liberação: código no backend, propriedade da coluna e cabeçalho do Excel. */
export const PAYMENT_RELEASE_EXPORT_DEPARTMENTS: [code: string, property: string, label: string][] = [
  ["Board", "ReleaseBoard", "Lib. Diretoria"],
  ["Stock", "ReleaseStock", "Lib. Estoque"],
  ["Legal", "ReleaseLegal", "Lib. Jurídico"],
  ["Fiscal", "ReleaseFiscal", "Lib. Fiscal"],
  ["Royalties", "ReleaseRoyalties", "Lib. Royalties"],
  ["Financial", "ReleaseFinancial", "Lib. Financeiro"],
  ["Store", "ReleaseStore", "Lib. Loja"],
];

type ContractRow = {
  PaymentReleases?: { Department: string; Released: boolean }[];
  IsBarter?: boolean;
  [property: string]: unknown;
};

/**
 * Achata um contrato (com PaymentReleases expandido) numa linha do Excel: mantém as colunas do
 * contrato e acrescenta uma coluna Sim/Não por departamento ("—" para Loja fora de barter),
 * com a mesma regra da lista (`formatDepartmentRelease`).
 */
export function mapPaymentReleaseExportRow(contract: ContractRow): Record<string, unknown> {
  const { PaymentReleases, ...rest } = contract;
  const row: Record<string, unknown> = { ...rest };

  for (const [code, property] of PAYMENT_RELEASE_EXPORT_DEPARTMENTS) {
    row[property] = formatter.formatDepartmentRelease(PaymentReleases ?? [], code, contract.IsBarter);
  }

  return row;
}
