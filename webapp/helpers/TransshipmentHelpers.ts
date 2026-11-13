import formatter from "siagrob1/model/formatter";

/**
 * Transferência entre armazéns de terceiros (GAC-1176): o PROCESSO é o do transbordo (GAC-1181) —
 * saída da carga, entrada pesada, quebra —, mas a mercadoria TERMINA no armazém e a carga é
 * concluída sem faturamento. Estas funções são puras para a regra de tela ficar testável; quem
 * decide de verdade é o servidor (`ShipmentLoadsTransshipmentCompleteService`).
 */

/** "Transshipment" | "Transfer" — `ShipmentLoadTransshipment.Type`. Ausente = transbordo. */
export type TransshipmentType = "Transshipment" | "Transfer";

export type TransshipmentRow = {
	Key: string;
	Sequence?: number;
	Type?: string;
	WarehouseCode?: string;
	WarehouseName?: string;
	/** Edm.Decimal chega como STRING. */
	ShrinkageQuantity?: number | string;
	EntryStorageTransactionKey?: string;
	/** Preenchido = a carga terminou aqui (transferência concluída). */
	FinalDestinationAt?: string;
};

export type TransshipmentSummary = {
	/** chave do transbordo → "Transbordo N — armazém (X) Nome" / "Transferência N — …". */
	lookup: Record<string, string>;
	/** Σ da quebra de transporte (saída − entrada) de todos os transbordos da carga. */
	shrinkageTotal: number;
	/** O ÚLTIMO transbordo é destino final: a carga foi concluída por transferência. */
	hasFinal: boolean;
};

export function summarizeTransshipments(rows: TransshipmentRow[]): TransshipmentSummary {
	const list = rows ?? [];
	const lookup: Record<string, string> = {};
	let shrinkage = 0;

	list.forEach(row => {
		lookup[row.Key] = formatter.formatTransshipmentLabel(row);
		shrinkage += Number(row.ShrinkageQuantity ?? 0) || 0;
	});

	// "O último", não "algum": depois de uma transferência a carga mista ainda pode abrir outro
	// transbordo (recusa), e aí o anterior vira histórico — mesmo critério de
	// ShipmentLoadsRecalculateTransshippedService.EndsAtFinalTransshipmentAsync no servidor.
	const last = list.reduce<TransshipmentRow>(
		(current, row) => (!current || (row.Sequence ?? 0) > (current.Sequence ?? 0) ? row : current),
		undefined);

	return {
		lookup,
		shrinkageTotal: Math.round(shrinkage * 1000) / 1000,
		hasFinal: !!last?.FinalDestinationAt,
	};
}

/** Por que a linha NÃO pode ser concluída como transferência — ou `null` se pode. */
export function completeTransferRefusal(row: TransshipmentRow, linkedKeys: string[]): string {
	if (row.FinalDestinationAt) return "Esta transferência já foi concluída.";

	if (!row.EntryStorageTransactionKey)
		return "Registre a entrada no armazém antes de concluir a transferência.";

	if ((linkedKeys ?? []).includes(row.Key))
		return "Este transbordo já tem a Expedição de saída vinculada: a mercadoria seguiu viagem.";

	return null;
}

/** Por que a linha NÃO pode ser reaberta — ou `null` se pode. */
export function reopenTransferRefusal(row: TransshipmentRow): string {
	return row.FinalDestinationAt ? null : "Esta transferência não foi concluída.";
}

/** Situações em que a carga já consumiu (ou encerrou) o romaneio e ele não pode sair dela. */
const CLOSED_LOAD_STATUSES = ["PartiallyInvoiced", "Invoiced", "Discharged", "Completed", "TransitLoss"];

/**
 * Aviso de quem tenta estornar/desvincular um romaneio de carga encerrada — ou `null` se a carga
 * ainda aceita a mudança. A regra é do servidor; isto só antecipa a frase.
 *
 * A Concluída tem frase PRÓPRIA (GAC-1176): a carga Normal chega a ela pela Conferência de
 * Entregas (há nota a cancelar) ou por transferência entre armazéns de terceiros (não há nota
 * nenhuma — mandar "cancelar os documentos de saída" deixaria o usuário procurando o que não
 * existe). A tela não sabe qual dos dois foi, então diz os dois caminhos.
 */
export function closedLoadWarning(
	loadCode: string, loadStatus: string, statusText: string, action: string
): string {
	if (!CLOSED_LOAD_STATUSES.includes(loadStatus)) return null;

	if (loadStatus === "Completed") {
		return `A carga ${loadCode} está concluída. Se ela foi concluída por transferência entre armazéns, ` +
			"reabra a transferência na carga; senão, cancele os documentos de saída da carga " +
			`antes de ${action}.`;
	}

	return `A carga ${loadCode} já tem faturamento (${statusText}). ` +
		`Cancele os documentos de saída da carga antes de ${action}.`;
}

export type TransshipmentTexts = {
	startTitle: string;
	entryTitle: string;
	started: string;
	entered: string;
	reversed: string;
	reverseQuestion: string;
	missingDate: string;
	missingWarehouse: string;
	missingWeight: string;
	/** Rótulos dos campos do diálogo de início. */
	warehouseLabel: string;
	startDateLabel: string;
};

/** Os textos do diálogo e dos avisos, no vocabulário da parada — o usuário não lê "transbordo" numa transferência. */
export function transshipmentTexts(type: string): TransshipmentTexts {
	if (type === "Transfer") {
		return {
			startTitle: "Iniciar Transferência",
			entryTitle: "Registrar Entrada da Transferência",
			started: "Transferência iniciada.",
			entered: "Entrada da transferência registrada.",
			reversed: "Transferência estornada.",
			reverseQuestion: "Estornar a transferência selecionada ?",
			missingDate: "Informe a data da transferência.",
			missingWarehouse: "Informe o armazém de destino da transferência.",
			missingWeight: "Informe o peso pesado na entrada da transferência.",
			warehouseLabel: "Armazém de Destino",
			startDateLabel: "Data da Transferência",
		};
	}

	return {
		startTitle: "Iniciar Transbordo",
		entryTitle: "Registrar Entrada do Transbordo",
		started: "Transbordo iniciado.",
		entered: "Entrada do transbordo registrada.",
		reversed: "Transbordo estornado.",
		reverseQuestion: "Estornar o transbordo selecionado ?",
		missingDate: "Informe a data do transbordo.",
		missingWarehouse: "Informe o armazém do transbordo.",
		missingWeight: "Informe o peso pesado na entrada do transbordo.",
		warehouseLabel: "Armazém do Transbordo",
		startDateLabel: "Data do Transbordo",
	};
}
