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
export type NfeSeriesRow = NfeSeries & { isNew: boolean; /** Valor anterior da série digitada (linhas novas), para o padrão acompanhar a edição. */ lastSeries?: string };

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

/**
 * Aviso quando trocar a série descarta o número já reservado no documento (uma nova reserva é feita
 * na série escolhida). Vazio quando não há reserva ou a série é a mesma (comparada pelo número).
 */
export function abandonedReservationWarning(documentSeries: string, documentNumber: string, chosenSeries: number): string {
  const reserved = Number.parseInt(documentSeries ?? "", 10);
  if (Number.isNaN(reserved) || !(documentNumber ?? "").toString().trim() || reserved === Number(chosenSeries)) {
    return "";
  }
  return `O nº ${documentNumber} da série ${documentSeries}, reservado para este documento, ficará sem uso e precisará ser inutilizado.`;
}

/** Série ou próximo número em branco: o servidor aceitaria como 0, então a tela barra antes de salvar. */
export function hasBlankSeriesRow(rows: NfeSeriesRow[]): boolean {
  const blank = (v: unknown) => (typeof v === "string" ? v.trim() === "" : v === undefined || v === null);
  return rows.some((r) => blank(r.Series) || blank(r.NextNumber));
}

/**
 * Padrão acompanha a edição do número da série: se a linha era a padrão antes da edição
 * (`previousSeries`), o novo padrão é o valor digitado; senão o padrão não muda.
 */
export function followDefaultSeries(defaultSeries: number, previousSeries: string, newSeries: string): number {
  return Number(previousSeries) === Number(defaultSeries) ? Number(newSeries) : defaultSeries;
}
