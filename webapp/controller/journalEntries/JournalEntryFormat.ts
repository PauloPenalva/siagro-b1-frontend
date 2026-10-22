/** Linha do lançamento como a API devolve (enum em texto). */
export type JournalLine = {
  LineNumber: number;
  EntryType: "Debit" | "Credit" | "Double" | "HistoryContinuation";
  DebitAccountCode?: string;
  CreditAccountCode?: string;
  Amount: number;
  History: string;
  DebitCostCenterCode?: string;
  CreditCostCenterCode?: string;
  DebitAccountingItemCode?: string;
  CreditAccountingItemCode?: string;
};

const ORIGINS: Record<string, string> = {
  Manual: "Manual",
  StandardPosting: "Lançamento padrão",
  ResultClosing: "Apuração",
  Reversal: "Estorno",
};

const TYPES: Record<string, string> = {
  Debit: "Débito",
  Credit: "Crédito",
  Double: "Partida dobrada",
  HistoryContinuation: "Cont. histórico",
};

const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function originText(origin: string): string {
  return ORIGINS[origin] ?? origin ?? "";
}

export function entryTypeText(type: string): string {
  return TYPES[type] ?? type ?? "";
}

export function formatMoney(value: number): string {
  return value ? money.format(Number(value)) : "";
}

export function isDebitSide(type: string): boolean {
  return type === "Debit" || type === "Double";
}

export function isCreditSide(type: string): boolean {
  return type === "Credit" || type === "Double";
}

/** Total a débito do lançamento (= total a crédito, porque o servidor só grava balanceado). */
export function totalDebit(lines: JournalLine[]): number {
  return (lines ?? []).filter((l) => isDebitSide(l.EntryType)).reduce((s, l) => s + Number(l.Amount || 0), 0);
}

/** Histórico completo da primeira linha de valor, juntando as continuações (tipo 4) que a seguem. */
export function firstHistory(lines: JournalLine[]): string {
  const sorted = [...(lines ?? [])].sort((a, b) => a.LineNumber - b.LineNumber);
  let text = "";
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].EntryType !== "HistoryContinuation") break;
    text += sorted[i].History ?? "";
  }
  return text;
}
