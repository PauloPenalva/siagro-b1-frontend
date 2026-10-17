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

/** Linha da tabela de séries da Configuração da NF-e; `isNew` libera a edição do número da série. */
export type NfeSeriesRow = NfeSeries & { isNew: boolean };

/**
 * Vetores paralelos que o `BranchNfeSettingsSave` espera. Os Inputs entregam texto (linhas novas
 * guardam a série como string), por isso a conversão para número; a descrição é aparada.
 */
export function buildSeriesSavePayload(rows: NfeSeriesRow[]): { Series: number[]; Descriptions: string[]; NextNumbers: number[] } {
  return {
    Series: rows.map((r) => Number(r.Series)),
    Descriptions: rows.map((r) => (r.Description ?? "").trim()),
    NextNumbers: rows.map((r) => Number(r.NextNumber)),
  };
}
