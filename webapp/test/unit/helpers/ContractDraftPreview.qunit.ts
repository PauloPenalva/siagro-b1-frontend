import {
	PREVIEW_CLASS,
	placeholderToken,
	previewHtml,
} from "siagrob1/helpers/ContractDraftPreview";

QUnit.module("ContractDraftPreview - embrulho do corpo para o sap.ui.core.HTML");

QUnit.test("embrulha o corpo na classe que espelha o CSS do PDF", function (assert) {
	assert.strictEqual(
		previewHtml("<p>Olá</p>"),
		`<div class="${PREVIEW_CLASS}"><p>Olá</p></div>`
	);
});

QUnit.test("corpo vazio ainda produz UM elemento raiz", function (assert) {
	// sap.ui.core.HTML recusa conteúdo que não tenha exatamente um elemento raiz; devolver ""
	// quebraria o preview de um modelo novo, que nasce sem texto.
	assert.strictEqual(previewHtml(""), `<div class="${PREVIEW_CLASS}"></div>`);
	assert.strictEqual(previewHtml(undefined), `<div class="${PREVIEW_CLASS}"></div>`);
	assert.strictEqual(previewHtml(null), `<div class="${PREVIEW_CLASS}"></div>`);
});

QUnit.test("vários elementos irmãos continuam com um só raiz", function (assert) {
	assert.strictEqual(
		previewHtml("<h1>T</h1><p>a</p><p>b</p>"),
		`<div class="${PREVIEW_CLASS}"><h1>T</h1><p>a</p><p>b</p></div>`
	);
});

QUnit.test("a classe é exatamente a do css/contractDraft.css", function (assert) {
	assert.strictEqual(PREVIEW_CLASS, "siagroContractDraftPreview");
});

QUnit.module("ContractDraftPreview - token do placeholder");

QUnit.test("o nome vira o token de chaves duplas que o backend reconhece", function (assert) {
	assert.strictEqual(placeholderToken("numero"), "{{numero}}");
	assert.strictEqual(placeholderToken("fornecedor_cnpj"), "{{fornecedor_cnpj}}");
});

QUnit.test("nome vazio não produz token", function (assert) {
	// Um "{{}}" no texto seria recusado pelo backend como placeholder desconhecido, e a pessoa
	// não saberia de onde veio.
	assert.strictEqual(placeholderToken(""), "");
	assert.strictEqual(placeholderToken(undefined), "");
	assert.strictEqual(placeholderToken("   "), "");
});
