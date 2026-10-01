import { filterPlaceholders } from "siagrob1/helpers/PlaceholderSearch";

const CAMPOS = [
	{ Name: "numero", Description: "Número do contrato" },
	{ Name: "complemento", Description: "Complemento do contrato" },
	{ Name: "emissao", Description: "Data de emissão (dd/mm/aaaa)" },
	{ Name: "fornecedor_cnpj", Description: "CNPJ do fornecedor" },
	{ Name: "local_entrega", Description: "Local de entrega" },
];

QUnit.module("PlaceholderSearch - busca do painel de campos");

QUnit.test("busca vazia devolve a lista inteira", function (assert) {
	assert.deepEqual(filterPlaceholders(CAMPOS, ""), CAMPOS);
	assert.deepEqual(filterPlaceholders(CAMPOS, undefined), CAMPOS);
	assert.deepEqual(filterPlaceholders(CAMPOS, "   "), CAMPOS, "só espaço não é busca");
});

QUnit.test("acha pelo nome do campo", function (assert) {
	const achados = filterPlaceholders(CAMPOS, "numero");

	assert.strictEqual(achados.length, 1);
	assert.strictEqual(achados[0].Name, "numero");
});

QUnit.test("acha também pela descrição, que é onde está o português", function (assert) {
	// Quem procura "CNPJ" não sabe que o campo se chama `fornecedor_cnpj`.
	const achados = filterPlaceholders(CAMPOS, "CNPJ");

	assert.strictEqual(achados.length, 1);
	assert.strictEqual(achados[0].Name, "fornecedor_cnpj");
});

QUnit.test("não diferencia maiúscula de minúscula", function (assert) {
	assert.strictEqual(filterPlaceholders(CAMPOS, "NUMERO").length, 1);
	assert.strictEqual(filterPlaceholders(CAMPOS, "Numero").length, 1);
});

QUnit.test("ignora acento, nos dois sentidos", function (assert) {
	// O nome do campo é sem acento (`emissao`) e a descrição é com (`emissão`). Quem digita
	// de um jeito tem de achar o outro, senão a busca parece quebrada.
	assert.strictEqual(filterPlaceholders(CAMPOS, "emissão").length, 1, "com acento acha o campo sem");
	assert.strictEqual(filterPlaceholders(CAMPOS, "emissao").length, 1, "sem acento acha a descrição com");
	assert.strictEqual(filterPlaceholders(CAMPOS, "numero do contrato").length, 1);
});

QUnit.test("busca parcial, em qualquer posição", function (assert) {
	assert.strictEqual(filterPlaceholders(CAMPOS, "entrega").length, 1);
	assert.strictEqual(filterPlaceholders(CAMPOS, "contrato").length, 2, "numero e complemento");
});

QUnit.test("busca sem resultado devolve lista vazia, não a lista toda", function (assert) {
	assert.deepEqual(filterPlaceholders(CAMPOS, "xpto"), []);
});

QUnit.test("lista ausente não estoura", function (assert) {
	assert.deepEqual(filterPlaceholders(undefined, "numero"), []);
	assert.deepEqual(filterPlaceholders(null, ""), []);
});

QUnit.test("campo sem descrição ainda é pesquisável pelo nome", function (assert) {
	const achados = filterPlaceholders([{ Name: "safra" }], "safra");

	assert.strictEqual(achados.length, 1);
});
