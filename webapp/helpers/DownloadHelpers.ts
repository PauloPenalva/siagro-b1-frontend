/**
 * Download de arquivo devolvido por um POST (ZIP de XML/DACTE/DAMDFE em lote): fetch cru + blob.
 * Erro do servidor vem pelo readErrorMessage (BadRequest(string) é a própria mensagem).
 */
import MessageBox from "sap/m/MessageBox";
import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";

export async function downloadPostedFile(url: string, body: object, fileName: string): Promise<void> {
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			MessageBox.error((await readErrorMessage(response)) || "Falha ao gerar o arquivo.");
			return;
		}
		const blob = await response.blob();
		const href = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = href;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(href);
	} catch {
		MessageBox.error("Falha ao baixar o arquivo.");
	}
}
