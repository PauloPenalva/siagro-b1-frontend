/**
 * As 27 UFs, lista estática para Selects: a tabela STATES pode estar vazia em STANDALONE (não é semeada),
 * então um binding OData deixaria o Select sem opções.
 */
export const STATE_CODES: Array<{ key: string, text: string }> = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
  "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
].map((code) => ({ key: code, text: code }));
