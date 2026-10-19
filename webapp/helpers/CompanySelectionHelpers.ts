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

/**
 * O seletor aparece sempre que a lista chegou, mesmo com uma empresa só: o usuário vê em qual empresa
 * vai entrar. Sem lista (falha ao carregar) ele some e o servidor escolhe a empresa padrão.
 */
export function shouldShowCompanySelect(companies: CompanyOption[]): boolean {
  return (companies?.length ?? 0) > 0;
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
