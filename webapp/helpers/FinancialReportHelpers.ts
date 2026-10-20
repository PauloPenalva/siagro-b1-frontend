/** Espelha FinancialDirection / FinancialPositionMode do servidor (a API de relatórios lê enum numérico). */
export const DIRECTION = { Receivable: 0, Payable: 1 } as const;
export const MODE = { Firm: 0, Provisional: 1 } as const;
