/** Configuração da integração SAP da empresa (modelo devolvido pelos três endpoints). */
export type SapIntegrationSettings = {
  InvoiceSyncEnabled: boolean;
  InvoiceSyncIntervalMinutes: number;
  InvoiceSyncLastRunAt: string;
};

export const MIN_SYNC_INTERVAL_MINUTES = 1;
export const MAX_SYNC_INTERVAL_MINUTES = 1440;
export const INVALID_INTERVAL_MESSAGE = "Informe um intervalo entre 1 e 1440 minutos.";

/**
 * Normaliza a resposta do servidor. Esta API já devolveu camelCase em REST puro e PascalCase em
 * OData, então os dois formatos são aceitos em vez de apostar em um.
 */
export function normalizeSapIntegrationSettings(raw: unknown): SapIntegrationSettings {
  const data = (raw ?? {}) as Record<string, unknown>;
  const pick = (name: string) => data[name] ?? data[name.charAt(0).toLowerCase() + name.slice(1)];

  const interval = Number(pick("InvoiceSyncIntervalMinutes"));

  return {
    InvoiceSyncEnabled: pick("InvoiceSyncEnabled") === true,
    InvoiceSyncIntervalMinutes: interval > 0 ? interval : 15,
    InvoiceSyncLastRunAt: (pick("InvoiceSyncLastRunAt") as string) || null,
  };
}

/** O intervalo vale de 1 a 1440 minutos e é inteiro (mesma regra do servidor). */
export function isValidSyncInterval(value: unknown): boolean {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= MIN_SYNC_INTERVAL_MINUTES && minutes <= MAX_SYNC_INTERVAL_MINUTES;
}
