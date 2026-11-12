/* O projeto roda com strictNullChecks desligado; "| null" documenta o contrato (null = não se aplica). */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type RefusalDestinationKey = "Rebilling" | "Warehouse" | "Transshipment" | "TransitLoss";

export type RefusalDestinationForm = {
  DestinationIndex: number;
  DestinationWarehouseCode?: string;
  TransitLossReason?: string;
  Reason?: string;
};

const DESTINATIONS: RefusalDestinationKey[] = ["Rebilling", "Warehouse", "Transshipment", "TransitLoss"];

/** Índice do RadioButtonGroup do diálogo de recusa para o destino. Ordem fixa: 0,1,2,3. */
export function destinationFromIndex(index: number): RefusalDestinationKey {
  return DESTINATIONS[index] ?? "Rebilling";
}

/** Armazém só se aplica à devolução ao armazém (1) e ao transbordo (2). */
function needsWarehouse(destination: RefusalDestinationKey): boolean {
  return destination === "Warehouse" || destination === "Transshipment";
}

/** Erro de validação em pt-BR, ou null se o formulário pode ser enviado. */
export function validateRefusalForm(form: RefusalDestinationForm): string | null {
  const destination = destinationFromIndex(form.DestinationIndex);

  if (!form.Reason?.trim()) {
    return "Informe o motivo da recusa.";
  }

  if (needsWarehouse(destination) && !form.DestinationWarehouseCode?.trim()) {
    return "Informe o armazém de destino da mercadoria devolvida.";
  }

  if (destination === "TransitLoss" && !form.TransitLossReason?.trim()) {
    return "Informe o tipo da quebra de trajeto.";
  }

  return null;
}

/** Parâmetros que dependem do destino; os que não se aplicam vão null (nunca undefined). */
export function destinationParameters(form: RefusalDestinationForm): {
  Destination: RefusalDestinationKey;
  DestinationWarehouseCode: string | null;
  TransitLossReason: string | null;
} {
  const destination = destinationFromIndex(form.DestinationIndex);

  return {
    Destination: destination,
    DestinationWarehouseCode: needsWarehouse(destination) ? (form.DestinationWarehouseCode?.trim() ?? null) : null,
    TransitLossReason: destination === "TransitLoss" ? (form.TransitLossReason?.trim() ?? null) : null,
  };
}

const TRANSIT_LOSS_CONFIRM_TEXT =
  "A quebra de trajeto devolve os documentos selecionados e retira o volume da carga. " +
  "A mercadoria não retorna a nenhum armazém e não fica disponível para faturamento. Confirmar?";

/**
 * Texto da confirmação da quebra. Na filial que emite NF-e pelo Siagro a recusa nasce pendente e a
 * quebra só é gravada quando as NF-e de entrada das devoluções forem autorizadas.
 */
export function transitLossConfirmText(withNfe: boolean): string {
  return withNfe
    ? `${TRANSIT_LOSS_CONFIRM_TEXT} A quebra só é lançada depois que as NF-e de entrada das devoluções forem autorizadas.`
    : TRANSIT_LOSS_CONFIRM_TEXT;
}

export type RefusalSuccessKind = "PendingNfe" | "TransitLoss" | "Transshipment" | "Warehouse" | "Rebilling";

/** Qual mensagem de sucesso mostrar: com NF-e pelo Siagro toda recusa fica pendente, qualquer destino. */
export function refusalSuccessKind(destination: RefusalDestinationKey, withNfe: boolean): RefusalSuccessKind {
  return withNfe ? "PendingNfe" : destination;
}
