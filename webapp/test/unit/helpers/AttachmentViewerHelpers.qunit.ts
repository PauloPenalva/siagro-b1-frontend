import {
	normalizeContentType,
	parseContentDispositionFileName,
	resolveContentType,
	resolveViewerKind
} from "siagrob1/helpers/AttachmentViewerHelpers";

QUnit.module("AttachmentViewerHelpers - visualizador de anexos (GAC-1171)");

QUnit.test("o Content-Type informado decide, sem parâmetros e sem caixa", function (assert) {
	assert.strictEqual(resolveContentType("application/PDF; charset=binary", "x.bin"), "application/pdf");
	assert.strictEqual(resolveContentType("image/png", "sem-extensao"), "image/png");
});

QUnit.test("normalizeContentType tira parâmetros, caixa e espaços: o diálogo mantém o blob original quando o tipo bate", function (assert) {
	assert.strictEqual(normalizeContentType("text/plain;charset=utf-8"), "text/plain");
	assert.strictEqual(normalizeContentType(" Application/PDF "), "application/pdf");
	assert.strictEqual(normalizeContentType(""), "");
	assert.strictEqual(normalizeContentType(null), "");
	assert.strictEqual(normalizeContentType(undefined), "");
	// É a comparação do diálogo: igual ao tipo resolvido, o blob (com charset) fica como veio.
	assert.strictEqual(normalizeContentType("text/plain;charset=utf-8"), resolveContentType("text/plain;charset=utf-8", "nota.txt"));
	assert.notStrictEqual(normalizeContentType("application/octet-stream"), resolveContentType("application/octet-stream", "nota.pdf"));
});

QUnit.test("octet-stream ou vazio cai na extensão do arquivo (anexos antigos dos contratos)", function (assert) {
	assert.strictEqual(resolveContentType("application/octet-stream", "Contrato 123.PDF"), "application/pdf");
	assert.strictEqual(resolveContentType("", "foto.jpeg"), "image/jpeg");
	assert.strictEqual(resolveContentType(null, "ticket.jpg"), "image/jpeg");
	assert.strictEqual(resolveContentType(undefined, "nota.txt"), "text/plain");
});

QUnit.test("extensão desconhecida continua octet-stream", function (assert) {
	assert.strictEqual(resolveContentType("application/octet-stream", "planilha.xlsx"), "application/octet-stream");
	assert.strictEqual(resolveContentType("", "anexo"), "application/octet-stream");
});

QUnit.test("PDF, imagem e texto puro são exibíveis", function (assert) {
	assert.strictEqual(resolveViewerKind("application/pdf"), "pdf");
	assert.strictEqual(resolveViewerKind("image/png"), "image");
	assert.strictEqual(resolveViewerKind("image/jpeg"), "image");
	assert.strictEqual(resolveViewerKind("text/plain"), "text");
});

QUnit.test("tipo ativo NÃO é exibido: blob herda a origem da aplicação", function (assert) {
	assert.strictEqual(resolveViewerKind("text/html"), "unsupported");
	assert.strictEqual(resolveViewerKind("image/svg+xml"), "unsupported");
	assert.strictEqual(resolveViewerKind("application/xhtml+xml"), "unsupported");
	assert.strictEqual(resolveViewerKind("text/javascript"), "unsupported");
	assert.strictEqual(resolveViewerKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "unsupported");
});

QUnit.test("resolveViewerKind normaliza o próprio tipo: não depende do chamador já ter usado resolveContentType", function (assert) {
	assert.strictEqual(resolveViewerKind("image/svg+xml; charset=utf-8"), "unsupported");
	assert.strictEqual(resolveViewerKind("IMAGE/SVG+XML"), "unsupported");
	assert.strictEqual(resolveViewerKind(" text/html "), "unsupported");
	assert.strictEqual(resolveViewerKind("Application/PDF"), "pdf");
	assert.strictEqual(resolveViewerKind("text/plain; charset=utf-8"), "text");
});

QUnit.test("nome do arquivo pelo Content-Disposition do ASP.NET", function (assert) {
	assert.strictEqual(
		parseContentDispositionFileName("attachment; filename=ticket.pdf; filename*=UTF-8''Ticket%20descarga%20a%C3%A7%C3%A3o.pdf"),
		"Ticket descarga ação.pdf");
	assert.strictEqual(parseContentDispositionFileName("attachment; filename=\"nota fiscal.pdf\""), "nota fiscal.pdf");
	assert.strictEqual(parseContentDispositionFileName("attachment; filename=nota.pdf"), "nota.pdf");
});

QUnit.test("sem nome utilizável devolve null", function (assert) {
	assert.strictEqual(parseContentDispositionFileName(null), null);
	assert.strictEqual(parseContentDispositionFileName(""), null);
	assert.strictEqual(parseContentDispositionFileName("inline"), null);
});

QUnit.test("filename* malformado cai no filename simples", function (assert) {
	assert.strictEqual(
		parseContentDispositionFileName("attachment; filename=reserva.pdf; filename*=UTF-8''%E0%A4%A"),
		"reserva.pdf");
});

QUnit.test("filename* sem valor e sem filename simples devolve null", function (assert) {
	assert.strictEqual(parseContentDispositionFileName("attachment; filename*=UTF-8''"), null);
});

QUnit.test("filename* com aspas percent-encoded preserva as aspas no nome decodificado", function (assert) {
	assert.strictEqual(
		parseContentDispositionFileName("attachment; filename*=UTF-8''%22Relat%C3%B3rio%22.pdf"),
		"\"Relatório\".pdf");
});
