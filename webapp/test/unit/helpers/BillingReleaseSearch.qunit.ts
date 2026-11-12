import { filterBillingReleases } from "siagrob1/helpers/BillingReleaseSearch";

const releases = [
	{
		SalesContractCode: "00000522", Complement: "", CardCode: "C004702",
		CardName: "COMERCIO DE CEREAIS YOKOTOBI LTDA", CardFName: "YOKOTOBI PILAR",
		DeliveryLocationCode: "C004702", DeliveryLocationName: "COMERCIO DE CEREAIS", BranchShortName: "Filial Pilar",
	},
	{
		SalesContractCode: "00000763", Complement: "2073605335", CardCode: "C004587",
		CardName: "CARGILL AGRICOLA S.A", CardFName: "CARGILL AGRICOLA",
		DeliveryLocationCode: "C024741", DeliveryLocationName: "TEG - TERMINAL EXPORTAÇÃO", BranchShortName: "Filial Pilar",
	},
	{
		SalesContractCode: "00000748", Complement: "P40766", CardCode: "C024487",
		CardName: "BTG PACTUAL COMMODITIES SERTRADING", CardFName: "BTG SAO PAULO",
		DeliveryLocationCode: "C024879", DeliveryLocationName: "BTG PACTUAL COMM", BranchShortName: null,
	},
];

const codes = (query: string) => filterBillingReleases(releases, query).map((r) => r.SalesContractCode);

QUnit.module("BillingReleaseSearch - busca de liberações no faturamento (GAC-1217)");

QUnit.test("busca vazia devolve todas as liberações", function (assert) {
	assert.strictEqual(filterBillingReleases(releases, ""), releases);
	assert.strictEqual(filterBillingReleases(releases, "   "), releases);
	assert.strictEqual(filterBillingReleases(releases, undefined), releases);
});

QUnit.test("acha por contrato, complemento, cliente, nome fantasia e armazém", function (assert) {
	assert.deepEqual(codes("763"), ["00000763"], "trecho do número do contrato");
	assert.deepEqual(codes("P40766"), ["00000748"], "complemento");
	assert.deepEqual(codes("C004587"), ["00000763"], "código do cliente");
	assert.deepEqual(codes("sao paulo"), ["00000748"], "nome fantasia");
	assert.deepEqual(codes("C024741"), ["00000763"], "código do armazém");
});

QUnit.test("ignora maiúsculas e acentos", function (assert) {
	assert.deepEqual(codes("cargill"), ["00000763"]);
	assert.deepEqual(codes("exportacao"), ["00000763"], "sem acento acha o texto acentuado");
	assert.deepEqual(codes("EXPORTAÇÃO"), ["00000763"], "com acento também");
});

QUnit.test("várias palavras: todas precisam aparecer, em qualquer coluna", function (assert) {
	assert.deepEqual(codes("btg 748"), ["00000748"]);
	assert.deepEqual(codes("btg 763"), [], "palavras de linhas diferentes não casam");
});

QUnit.test("campo nulo e lista inválida não quebram", function (assert) {
	assert.deepEqual(codes("pilar"), ["00000522", "00000763"]);
	assert.deepEqual(filterBillingReleases(null, "x"), []);
});
