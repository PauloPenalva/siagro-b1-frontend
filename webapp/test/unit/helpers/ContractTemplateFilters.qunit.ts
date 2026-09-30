import { contractTemplateFilter } from "siagrob1/helpers/ContractTemplateFilters";

QUnit.module("ContractTemplateFilters - $filter da lista de modelos");

QUnit.test("sem nenhum critério não restringe nada", function (assert) {
	assert.strictEqual(contractTemplateFilter("", "", ""), undefined);
	assert.strictEqual(contractTemplateFilter(null, null, null), undefined);
	assert.strictEqual(contractTemplateFilter("   ", "", ""), undefined, "só espaço não é busca");
});

QUnit.test("a busca cobre Nome e Título, num grupo parentizado", function (assert) {
	assert.strictEqual(
		contractTemplateFilter("compra", "", ""),
		"(contains(Name,'compra') or contains(Title,'compra'))"
	);
});

QUnit.test("aspas na busca são escapadas, não quebram a consulta", function (assert) {
	assert.strictEqual(
		contractTemplateFilter("d'água", "", ""),
		"(contains(Name,'d''água') or contains(Title,'d''água'))"
	);
});

QUnit.test("escopo entra como literal de enum, sem aspas", function (assert) {
	assert.strictEqual(contractTemplateFilter("", "Purchase", ""), "ContractType eq 'Purchase'");
	assert.strictEqual(contractTemplateFilter("", "Both", ""), "ContractType eq 'Both'");
});

QUnit.test("ativo vira booleano, e 'N' não é o mesmo que vazio", function (assert) {
	assert.strictEqual(contractTemplateFilter("", "", "Y"), "Active eq true");
	assert.strictEqual(contractTemplateFilter("", "", "N"), "Active eq false");
	assert.strictEqual(contractTemplateFilter("", "", ""), undefined, "vazio = os dois");
});

QUnit.test("os três critérios se somam com and", function (assert) {
	assert.strictEqual(
		contractTemplateFilter("safra", "Sales", "Y"),
		"(contains(Name,'safra') or contains(Title,'safra')) and ContractType eq 'Sales' and Active eq true"
	);
});

QUnit.test("a busca é usada aparada nas pontas", function (assert) {
	assert.strictEqual(
		contractTemplateFilter("  safra  ", "", ""),
		"(contains(Name,'safra') or contains(Title,'safra'))"
	);
});
