import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";

/**
 * POST de relatório que devolve PDF e abre o resultado em nova aba (mesmo fluxo de InvoiceReportController).
 * Lança Error com a mensagem do servidor em caso de recusa.
 */
export async function openPdfReport(url: string, payload: object): Promise<void> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error((await readErrorMessage(response)) || "Falha ao gerar relatório.");
	}

	const fileURL = URL.createObjectURL(await response.blob());
	window.open(fileURL, "_blank");
	setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
}
