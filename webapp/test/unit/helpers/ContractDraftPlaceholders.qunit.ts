import { placeholderToken } from "siagrob1/helpers/ContractDraftPlaceholders";

QUnit.module("ContractDraftPlaceholders - token do placeholder");

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
