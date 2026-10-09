import { flattenMenuApps, filterApps, resolveApp } from "siagrob1/helpers/AppSearchHelpers";

const MENU = {
	navigation: [
		{ title: "Início", key: "main", enabled: true, icon: "sap-icon://home" },
		{
			title: "Contratos",
			key: "contracts",
			enabled: true,
			icon: "sap-icon://document",
			items: [
				{ title: "Contratos de Compra", key: "purchaseContracts", enabled: true },
				{ title: "Contratos de Venda", key: "salesContracts", enabled: true },
				{ title: "Aprovação de Contratos de Compra", key: "purchaseContractsApproval", enabled: false },
			],
		},
		{
			title: "Expedição",
			key: "shipping",
			enabled: true,
			items: [{ title: "Expedição de Grãos", key: "shippingTransaction", enabled: true }],
		},
	],
	fixedNavigation: [
		{
			title: "Administração",
			key: "admin",
			enabled: true,
			items: [{ title: "Usuários", key: "users", enabled: true }],
		},
	],
};

QUnit.module("AppSearchHelpers - aplicativos do menu lateral");

QUnit.test("achata o menu em folhas navegáveis, com o grupo como descrição", function (assert) {
	const apps = flattenMenuApps(MENU);

	assert.deepEqual(
		apps.map((app) => app.key),
		["main", "purchaseContracts", "salesContracts", "shippingTransaction", "users"],
		"grupo não é aplicativo (a chave dele não é rota) e item desabilitado fica de fora"
	);
	assert.deepEqual(apps[1], { key: "purchaseContracts", title: "Contratos de Compra", group: "Contratos", icon: "sap-icon://document" });
	assert.strictEqual(apps[0].group, "", "item de primeiro nível não tem grupo");
});

QUnit.test("menu ausente ou vazio não estoura", function (assert) {
	assert.deepEqual(flattenMenuApps(undefined), []);
	assert.deepEqual(flattenMenuApps({}), []);
	assert.deepEqual(flattenMenuApps({ navigation: [{ title: "Sem chave", enabled: true }] }), []);
});

QUnit.module("AppSearchHelpers - filtro da pesquisa");

QUnit.test("busca parcial, sem diferenciar maiúscula nem acento", function (assert) {
	const apps = flattenMenuApps(MENU);

	assert.deepEqual(filterApps(apps, "contratos").map((a) => a.key), ["purchaseContracts", "salesContracts"]);
	assert.deepEqual(filterApps(apps, "EXPEDICAO").map((a) => a.key), ["shippingTransaction"], "sem acento acha com acento");
	assert.deepEqual(filterApps(apps, "graos").map((a) => a.key), ["shippingTransaction"]);
});

QUnit.test("acha também pelo nome do grupo", function (assert) {
	// Quem procura "administração" quer ver o que há dentro do grupo.
	assert.deepEqual(filterApps(flattenMenuApps(MENU), "administracao").map((a) => a.key), ["users"]);
});

QUnit.test("todas as palavras precisam aparecer, em qualquer ordem", function (assert) {
	assert.deepEqual(filterApps(flattenMenuApps(MENU), "venda contr").map((a) => a.key), ["salesContracts"]);
});

QUnit.test("busca vazia não sugere nada", function (assert) {
	assert.deepEqual(filterApps(flattenMenuApps(MENU), ""), []);
	assert.deepEqual(filterApps(flattenMenuApps(MENU), "   "), []);
	assert.deepEqual(filterApps(flattenMenuApps(MENU), undefined), []);
});

QUnit.module("AppSearchHelpers - destino da pesquisa");

QUnit.test("título exato vence, mesmo não sendo o primeiro resultado", function (assert) {
	// "Aprovação de Contratos de Compra" também casa com "contratos de compra" e vem antes.
	const apps = [
		{ key: "purchaseContractsApproval", title: "Aprovação de Contratos de Compra", group: "Contratos", icon: "" },
		{ key: "purchaseContracts", title: "Contratos de Compra", group: "Contratos", icon: "" },
	];

	assert.strictEqual(filterApps(apps, "contratos de compra")[0].key, "purchaseContractsApproval", "pré-condição");
	assert.strictEqual(resolveApp(apps, "Contratos de Compra")?.key, "purchaseContracts");
});

QUnit.test("sem título exato, abre o primeiro resultado", function (assert) {
	assert.strictEqual(resolveApp(flattenMenuApps(MENU), "contratos")?.key, "purchaseContracts");
});

QUnit.test("nada encontrado devolve undefined", function (assert) {
	assert.strictEqual(resolveApp(flattenMenuApps(MENU), "xyz"), undefined);
	assert.strictEqual(resolveApp(flattenMenuApps(MENU), ""), undefined);
});
