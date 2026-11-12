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

/** (strictNullChecks desligado: "string" abaixo inclui null.) Erro de validação em pt-BR, ou null se o formulário pode ser enviado. */
export function validateRefusalForm(form: RefusalDestinationForm): string {
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
	DestinationWarehouseCode: string;
	TransitLossReason: string;
} {
	const destination = destinationFromIndex(form.DestinationIndex);

	return {
		Destination: destination,
		DestinationWarehouseCode: needsWarehouse(destination) ? (form.DestinationWarehouseCode?.trim() ?? null) : null,
		TransitLossReason: destination === "TransitLoss" ? (form.TransitLossReason?.trim() ?? null) : null,
	};
}
