/** Série de NF-e da filial, como o servidor devolve em `BranchNfeSettingsGet`. */
export type NfeSeries = { Series: number; Description: string; NextNumber: number; IsUsed: boolean };

/** Texto da série no Select: "300 - Remessa para armazém de terceiro". */
export function formatNfeSeries(s: NfeSeries): string {
  return `${s.Series} - ${s.Description}`;
}

/**
 * Série pré-selecionada: a do documento, se existir na lista (comparada pelo número, então "001" é 1);
 * senão a padrão da filial.
 */
export function pickInitialSeries(list: NfeSeries[], defaultSeries: number, documentSeries?: string): number {
  const wanted = Number.parseInt(documentSeries ?? "", 10);
  return Number.isNaN(wanted) || !list.some((s) => s.Series === wanted) ? defaultSeries : wanted;
}
