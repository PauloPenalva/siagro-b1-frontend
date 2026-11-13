import {
	filterPlannedPurchaseReleases,
	findRowIndex,
	parsePlannedQuantity,
	plannedReleaseKey,
} from "siagrob1/helpers/PlannedReleaseHelpers";

const releases = [
	{
		ShipmentReleaseKey: "k1", BranchShortName: "Filial Pilar", PurchaseContractCode: "00000522",
		FName: "JOÃO DA SILVA", TaxId: "111.222.333-44", City: "Pilar do Sul", State: "SP",
		DeliveryLocationCode: "ARM01", DeliveryLocationName: "ARMAZÉM CENTRAL", ItemName: "SOJA EM GRAOS",
		WarehouseFName: "COOPERATIVA PILAR", LogisticRegionCode: "009", LogisticRegionName: "SANTOS / GUARUJA",
	},
	{
		ShipmentReleaseKey: "k2", BranchShortName: "Filial Pilar", PurchaseContractCode: "00000763",
		FName: "CARGILL AGRICOLA S.A", TaxId: "60.498.706/0001-57", City: "Itapeva", State: "SP",
		DeliveryLocationCode: "ARM02", DeliveryLocationName: "SILO NORTE", ItemName: "SOJA EM GRAOS",
	},
	{
		ShipmentReleaseKey: "k3", BranchShortName: null, PurchaseContractCode: "00000748",
		FName: "FAZENDA BOA VISTA", TaxId: null, City: "Sorriso", State: "MT",
		DeliveryLocationCode: "ARM02", DeliveryLocationName: "SILO NORTE", ItemName: "SOJA EM GRAOS",
	},
];

const keys = (query: string) => filterPlannedPurchaseReleases(releases, query).map((r) => r.ShipmentReleaseKey);

QUnit.module("PlannedReleaseHelpers - liberações para o planejamento da carga (GAC-1185)");

QUnit.test("busca vazia devolve a própria lista", function (assert) {
	assert.strictEqual(filterPlannedPurchaseReleases(releases, ""), releases);
	assert.strictEqual(filterPlannedPurchaseReleases(releases, "   "), releases);
	assert.strictEqual(filterPlannedPurchaseReleases(releases, undefined), releases);
});

QUnit.test("procura em contrato, fornecedor, CNPJ, município, UF e armazém", function (assert) {
	assert.deepEqual(keys("763"), ["k2"], "contrato");
	assert.deepEqual(keys("boa vista"), ["k3"], "fornecedor");
	assert.deepEqual(keys("60.498"), ["k2"], "CNPJ");
	assert.deepEqual(keys("sorriso"), ["k3"], "município");
	assert.deepEqual(keys("mt"), ["k3"], "UF");
	assert.deepEqual(keys("silo norte"), ["k2", "k3"], "armazém pelo nome");
	assert.deepEqual(keys("arm01"), ["k1"], "armazém pelo código");
});

QUnit.test("procura no nome fantasia do armazém e na região logística", function (assert) {
	assert.deepEqual(keys("cooperativa"), ["k1"], "nome fantasia do armazém");
	assert.deepEqual(keys("guaruja"), ["k1"], "nome da região");
	assert.deepEqual(keys("009"), ["k1"], "código da região");
});

QUnit.test("ignora acento e caixa, e exige todas as palavras", function (assert) {
	assert.deepEqual(keys("joao"), ["k1"], "sem acento acha o nome acentuado");
	assert.deepEqual(keys("ARMAZEM central"), ["k1"]);
	assert.deepEqual(keys("cargill 763"), ["k2"], "palavras em colunas diferentes");
	assert.deepEqual(keys("cargill 522"), [], "uma palavra que não bate elimina a linha");
});

QUnit.test("lista ausente vira lista vazia", function (assert) {
	assert.deepEqual(filterPlannedPurchaseReleases(null, "x"), []);
	assert.deepEqual(filterPlannedPurchaseReleases(undefined, ""), []);
});

QUnit.test("plannedReleaseKey lê a chave da liberação conforme o tipo", function (assert) {
	assert.strictEqual(plannedReleaseKey("Purchase", { ShipmentReleaseKey: "p1" }), "p1");
	assert.strictEqual(plannedReleaseKey("Sales", { SalesShipmentReleaseKey: "s1" }), "s1");
	assert.strictEqual(plannedReleaseKey("Sales", { ShipmentReleaseKey: "p1" }), "", "chave do outro tipo não serve");
	assert.strictEqual(plannedReleaseKey("Purchase", undefined), "", "sem linha selecionada");
});

QUnit.test("parsePlannedQuantity: vazio é opcional, positivo vale, o resto é inválido", function (assert) {
	assert.deepEqual(parsePlannedQuantity(""), { valid: true, value: null });
	assert.deepEqual(parsePlannedQuantity("   "), { valid: true, value: null });
	assert.deepEqual(parsePlannedQuantity(undefined), { valid: true, value: null });
	assert.deepEqual(parsePlannedQuantity("10"), { valid: true, value: 10 });
	assert.deepEqual(parsePlannedQuantity("1500.5"), { valid: true, value: 1500.5 });
	assert.deepEqual(parsePlannedQuantity("0"), { valid: false, value: null });
	assert.deepEqual(parsePlannedQuantity("-1"), { valid: false, value: null });
	assert.deepEqual(parsePlannedQuantity("abc"), { valid: false, value: null });
});

QUnit.test("findRowIndex acha a linha pela ordem EXIBIDA, não pela ordem dos dados", function (assert) {
	const [a, b, c] = releases;
	// A tabela está ordenada ao contrário dos dados: exibe [c, b, a].
	const displayed = [c, b, a];
	const rowAt = (index: number) => displayed[index];

	assert.strictEqual(findRowIndex(displayed.length, rowAt, a), 2, "a é a última linha exibida, embora seja a primeira dos dados");
	assert.strictEqual(findRowIndex(displayed.length, rowAt, c), 0);
	assert.strictEqual(findRowIndex(2, rowAt, a), -1, "fora das linhas exibidas");
	assert.strictEqual(findRowIndex(displayed.length, rowAt, undefined), -1, "sem linha selecionada");
	assert.strictEqual(findRowIndex(0, rowAt, a), -1, "lista vazia");
});
