import {
	TEMPLATE_SCOPE_OPTIONS,
	SIGNATORY_ROLE_OPTIONS,
	signatoryRoleLabel,
	signatoryRoleText,
	templateScopeText,
} from "siagrob1/model/contractDrafts";

QUnit.module("contractDrafts - papel do signatário");

QUnit.test("traduz o nome do membro do enum para o rótulo em português", function (assert) {
	assert.strictEqual(signatoryRoleText("Sign"), "Assinar");
	assert.strictEqual(signatoryRoleText("SignAsParty"), "Assinar como parte");
	assert.strictEqual(signatoryRoleText("SignAsWitness"), "Assinar como testemunha");
});

QUnit.test("papel ausente deixa a célula vazia em vez de escrever 'undefined'", function (assert) {
	assert.strictEqual(signatoryRoleText(undefined), "");
	assert.strictEqual(signatoryRoleText(null), "");
	assert.strictEqual(signatoryRoleText(""), "");
});

QUnit.test("papel novo no backend aparece cru, não some da tela", function (assert) {
	assert.strictEqual(signatoryRoleText("SignAsSomethingNew"), "SignAsSomethingNew");
});

QUnit.test("os 13 atos do D4Sign estão todos rotulados", function (assert) {
	assert.strictEqual(Object.keys(signatoryRoleLabel).length, 13);
	assert.ok(
		Object.values(signatoryRoleLabel).every((label) => label.length > 0),
		"nenhum rótulo vazio"
	);
});

QUnit.module("contractDrafts - opções do Select de papel");

QUnit.test("o Select oferece os 13 atos, com chave igual ao valor do backend", function (assert) {
	assert.strictEqual(SIGNATORY_ROLE_OPTIONS.length, 13);
	assert.deepEqual(SIGNATORY_ROLE_OPTIONS[0], { key: "Sign", text: "Assinar" });
	assert.ok(
		SIGNATORY_ROLE_OPTIONS.every((o) => signatoryRoleLabel[o.key] === o.text),
		"cada opção usa o mesmo rótulo da tabela"
	);
});

QUnit.test("a ordem das opções é a dos códigos do provedor, começando por Assinar", function (assert) {
	const keys = SIGNATORY_ROLE_OPTIONS.map((o) => o.key);

	assert.strictEqual(keys[0], "Sign");
	assert.strictEqual(keys[3], "SignAsParty");
	assert.strictEqual(keys[12], "SignAsPartyAndJointDebtor");
});

QUnit.module("contractDrafts - escopo do modelo de contrato");

QUnit.test("traduz o escopo para o rótulo da coluna 'Aplica-se a'", function (assert) {
	assert.strictEqual(templateScopeText("Purchase"), "Compra");
	assert.strictEqual(templateScopeText("Sales"), "Venda");
	assert.strictEqual(templateScopeText("Both"), "Compra e venda");
});

QUnit.test("escopo ausente deixa a célula vazia", function (assert) {
	assert.strictEqual(templateScopeText(undefined), "");
	assert.strictEqual(templateScopeText(""), "");
});

QUnit.test("escopo novo no backend aparece cru, não some da tela", function (assert) {
	assert.strictEqual(templateScopeText("Leasing"), "Leasing");
});

QUnit.test("o filtro de escopo oferece os três valores, com rótulo igual ao da coluna", function (assert) {
	assert.deepEqual(
		TEMPLATE_SCOPE_OPTIONS,
		[
			{ key: "Purchase", text: "Compra" },
			{ key: "Sales", text: "Venda" },
			{ key: "Both", text: "Compra e venda" },
		]
	);
});
