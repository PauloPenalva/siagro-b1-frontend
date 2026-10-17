import { CompanyOption } from "siagrob1/types/Company";

/**
 * Última empresa escolhida nesta máquina. Sobrevive ao logout de propósito, como o tema: é
 * conveniência do navegador para o próximo login, não dado de sessão.
 */
export const LAST_COMPANY_KEY = "LAST_COMPANY";

/** Empresa pré-selecionada: a última usada, se ainda existir na lista; senão a primeira; vazio sem lista. */
export function pickInitialCompany(companies: CompanyOption[], lastCode: string): string {
  if (!companies?.length) {
    return "";
  }

  const last = companies.find(company => company.code === lastCode);

  return (last ?? companies[0]).code;
}

/** O seletor só aparece quando há escolha a fazer; com uma empresa o servidor a escolhe sozinho. */
export function shouldShowCompanySelect(companies: CompanyOption[]): boolean {
  return (companies?.length ?? 0) > 1;
}

export function rememberCompany(code: string): void {
  if (!code) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_COMPANY_KEY, code);
  } catch {
    // Storage bloqueado (janela privada): só perde a conveniência.
  }
}

export function recallCompany(): string {
  try {
    return window.localStorage.getItem(LAST_COMPANY_KEY);
  } catch {
    return null;
  }
}
