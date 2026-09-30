import {
	createDraftParameters,
	draftButtonState,
	draftFileName,
	draftsFromResponse,
	templatePickerFilter,
} from "siagrob1/helpers/contractDraftActions";

const NOTHING = {
	editBody: false,
	remove: false,
	pdf: false,
	send: false,
	cancel: false,
	refresh: false,
};

QUnit.module("contractDraftActions - guardas dos botões");

QUnit.test("sem linha selecionada, nenhum botão fica habilitado", function (assert) {
	assert.deepEqual(draftButtonState(undefined), NOTHING);
	assert.deepEqual(draftButtonState(null), NOTHING);
});

QUnit.test("rascunho: edita, exclui, envia, baixa — não cancela nem atualiza", function (assert) {
	assert.deepEqual(draftButtonState({ Status: "Draft" }), {
		editBody: true,
		remove: true,
		pdf: true,
		send: true,
		cancel: false,
		refresh: false,
	});
});

QUnit.test("aguardando assinatura: só cancela, atualiza e baixa", function (assert) {
	assert.deepEqual(draftButtonState({ Status: "AwaitingSignature" }), {
		editBody: false,
		remove: false,
		pdf: true,
		send: false,
		cancel: true,
		refresh: true,
	});
});

QUnit.test("parcialmente assinada se comporta como aguardando assinatura", function (assert) {
	assert.deepEqual(
		draftButtonState({ Status: "PartiallySigned" }),
		draftButtonState({ Status: "AwaitingSignature" })
	);
});

QUnit.test("assinada COM anexo: só o PDF", function (assert) {
	assert.deepEqual(
		draftButtonState({ Status: "Signed", SignedAttachmentKey: "6f9b…" }),
		{ ...NOTHING, pdf: true }
	);
});

QUnit.test("assinada SEM anexo ainda deixa atualizar a situação", function (assert) {
	// O backend deixa a minuta assinada sem PDF quando o download no provedor falha. Esta é a
	// única forma de o usuário buscar o documento depois; sem ela, o contrato fica sem a via
	// assinada e ninguém sabe por quê.
	assert.deepEqual(
		draftButtonState({ Status: "Signed", SignedAttachmentKey: null }),
		{ ...NOTHING, pdf: true, refresh: true }
	);
	assert.deepEqual(
		draftButtonState({ Status: "Signed" }),
		{ ...NOTHING, pdf: true, refresh: true }
	);
});

QUnit.test("cancelada: nada além do PDF", function (assert) {
	assert.deepEqual(draftButtonState({ Status: "Canceled" }), { ...NOTHING, pdf: true });
});

QUnit.test("situação desconhecida não habilita nada que mude a minuta", function (assert) {
	assert.deepEqual(draftButtonState({ Status: "AlgoNovo" }), { ...NOTHING, pdf: true });
});

QUnit.module("contractDraftActions - resposta crua das functions");

QUnit.test("array cru é devolvido como está", function (assert) {
	const rows = [{ Key: "a" }, { Key: "b" }];

	assert.deepEqual(draftsFromResponse(rows), rows);
});

QUnit.test("envelope OData também é aceito, se o backend passar a usá-lo", function (assert) {
	assert.deepEqual(draftsFromResponse({ value: [{ Key: "a" }] }), [{ Key: "a" }]);
});

QUnit.test("resposta vazia ou inesperada vira lista vazia, não estouro", function (assert) {
	// Bindar direto no que a function devolve quebrava com "Cannot read properties of undefined
	// (reading 'length')"; a tabela precisa de um array sempre.
	assert.deepEqual(draftsFromResponse(undefined), []);
	assert.deepEqual(draftsFromResponse(null), []);
	assert.deepEqual(draftsFromResponse(""), []);
	assert.deepEqual(draftsFromResponse({ nada: 1 }), []);
});

QUnit.module("contractDraftActions - parâmetros da criação");

QUnit.test("os obrigatórios sempre vão", function (assert) {
	assert.deepEqual(createDraftParameters("Purchase", "ck", "tk", "", ""), {
		ContractType: "Purchase",
		ContractKey: "ck",
		TemplateKey: "tk",
	});
});

QUnit.test("opcionais em branco são OMITIDOS, não enviados vazios", function (assert) {
	// DraftType é enum no servidor: mandar "" não é "use o default", é valor inválido.
	const params = createDraftParameters("Sales", "ck", "tk", "", "   ");

	assert.notOk("DraftType" in params);
	assert.notOk("Description" in params);
});

QUnit.test("opcionais preenchidos vão, com a descrição aparada", function (assert) {
	assert.deepEqual(createDraftParameters("Purchase", "ck", "tk", "Amendment", "  Aditivo 1 "), {
		ContractType: "Purchase",
		ContractKey: "ck",
		TemplateKey: "tk",
		DraftType: "Amendment",
		Description: "Aditivo 1",
	});
});

QUnit.module("contractDraftActions - nome do arquivo do PDF");

QUnit.test("compõe contrato e sequência, com extensão", function (assert) {
	assert.strictEqual(draftFileName({ ContractCode: "CC0001", Sequence: 2 }), "CC0001-minuta-2.pdf");
});

QUnit.test("sem código do contrato ainda sai um nome utilizável", function (assert) {
	assert.strictEqual(draftFileName({ Sequence: 1 }), "minuta-1.pdf");
	assert.strictEqual(draftFileName(undefined), "minuta.pdf");
});

QUnit.module("contractDraftActions - filtro do seletor de modelo");

QUnit.test("num contrato de compra, oferece os modelos de Compra e os de Ambos", function (assert) {
	assert.strictEqual(
		templatePickerFilter("Purchase"),
		"(ContractType eq 'Purchase' or ContractType eq 'Both') and Active eq true"
	);
});

QUnit.test("num contrato de venda, oferece os de Venda e os de Ambos", function (assert) {
	assert.strictEqual(
		templatePickerFilter("Sales"),
		"(ContractType eq 'Sales' or ContractType eq 'Both') and Active eq true"
	);
});

QUnit.test("modelo inativo nunca aparece", function (assert) {
	// Inativo continua valendo para minutas antigas, mas não pode originar minuta nova.
	assert.ok(templatePickerFilter("Purchase").includes("Active eq true"));
	assert.ok(templatePickerFilter("Sales").includes("Active eq true"));
});
