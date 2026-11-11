import {
	defaultLotFilter,
	filterLotTransactions,
	lotTransactionTypes,
	lotTotals,
	pivotLotTransactions,
	LotTransaction,
} from "siagrob1/helpers/StorageAddressDetailHelpers";

const transaction = (overrides: Partial<LotTransaction>): LotTransaction => ({
	Key: "k",
	TransactionType: "Receipt",
	TransactionStatus: "Confirmed",
	NetWeight: 0,
	QualityInspections: [],
	...overrides,
});

QUnit.module("StorageAddressDetailHelpers - pivotLotTransactions (classificação em colunas)");

QUnit.test("cada atributo de classificação vira uma coluna, em ordem de código", function (assert) {
	const { attribs } = pivotLotTransactions([
		transaction({
			QualityInspections: [
				{ QualityAttribCode: "UMI", Value: 14.5, QualityAttrib: { Code: "UMI", Name: "Umidade" } },
				{ QualityAttribCode: "IMP", Value: 1, QualityAttrib: { Code: "IMP", Name: "Impureza" } },
			],
		}),
		transaction({
			QualityInspections: [
				{ QualityAttribCode: "AVA", Value: 2, QualityAttrib: { Code: "AVA", Name: "Avariados" } },
				{ QualityAttribCode: "UMI", Value: 13, QualityAttrib: { Code: "UMI", Name: "Umidade" } },
			],
		}),
	]);

	assert.deepEqual(attribs, [
		{ code: "AVA", name: "Avariados", property: "Quality0" },
		{ code: "IMP", name: "Impureza", property: "Quality1" },
		{ code: "UMI", name: "Umidade", property: "Quality2" },
	]);
});

QUnit.test("o percentual de cada romaneio cai na coluna do seu atributo", function (assert) {
	const { rows } = pivotLotTransactions([
		transaction({
			Key: "a",
			QualityInspections: [
				{ QualityAttribCode: "UMI", Value: 14.5, QualityAttrib: { Code: "UMI", Name: "Umidade" } },
				{ QualityAttribCode: "IMP", Value: 1, QualityAttrib: { Code: "IMP", Name: "Impureza" } },
			],
		}),
		transaction({
			Key: "b",
			QualityInspections: [
				{ QualityAttribCode: "UMI", Value: 13, QualityAttrib: { Code: "UMI", Name: "Umidade" } },
			],
		}),
	]);

	// IMP = Quality0, UMI = Quality1
	assert.strictEqual(rows[0].Quality0, 1);
	assert.strictEqual(rows[0].Quality1, 14.5);
	assert.strictEqual(rows[1].Quality0, undefined, "romaneio sem o atributo fica com a célula vazia");
	assert.strictEqual(rows[1].Quality1, 13);
	assert.strictEqual(rows[1].Key, "b", "os campos do romaneio são preservados");
});

QUnit.test("pesos e percentuais que o OData entrega como texto viram número", function (assert) {
	// Edm.Decimal chega como "50000.000": em texto a coluna ordenaria "9" depois de "10".
	const { rows } = pivotLotTransactions([
		transaction({
			GrossWeight: "50000.000", DryingDiscount: "120.500", CleaningDiscount: "0.000",
			OthersDicount: "10.000", NetWeight: "49869.500" as unknown as number,
			QualityInspections: [
				{ QualityAttribCode: "UMI", Value: "14.5" as unknown as number },
			],
		}),
	]);

	assert.strictEqual(rows[0].GrossWeight, 50000);
	assert.strictEqual(rows[0].DryingDiscount, 120.5);
	assert.strictEqual(rows[0].CleaningDiscount, 0);
	assert.strictEqual(rows[0].OthersDicount, 10);
	assert.strictEqual(rows[0].NetWeight, 49869.5);
	assert.strictEqual(rows[0].Quality0, 14.5);
});

QUnit.test("atributo sem cadastro expandido usa o próprio código como título", function (assert) {
	const { attribs } = pivotLotTransactions([
		transaction({ QualityInspections: [{ QualityAttribCode: "ARD", Value: 3 }] }),
	]);

	assert.deepEqual(attribs, [{ code: "ARD", name: "ARD", property: "Quality0" }]);
});

QUnit.test("romaneio sem classificação e lista vazia não quebram", function (assert) {
	assert.deepEqual(pivotLotTransactions([]), { rows: [], attribs: [] });

	const { rows, attribs } = pivotLotTransactions([
		transaction({ Key: "a", QualityInspections: undefined }),
	]);
	assert.strictEqual(rows.length, 1);
	assert.deepEqual(attribs, []);
});

QUnit.module("StorageAddressDetailHelpers - filterLotTransactions (filtros da tabela)");

const filterSample = () => [
	transaction({ Key: "a", TransactionStatus: "Confirmed", TransactionType: "Receipt", Code: "00001581", TruckCode: "ABC1D23" }),
	transaction({ Key: "b", TransactionStatus: "Cancelled", TransactionType: "Receipt", Code: "00001582" }),
	transaction({ Key: "c", TransactionStatus: "Pending", TransactionType: "Shipment", Code: "00001590", InvoiceNumber: "7788" }),
	transaction({ Key: "d", TransactionStatus: "Returned", TransactionType: "SalesShipment", Code: "00001601" }),
];

QUnit.test("o filtro padrão esconde só os cancelados", function (assert) {
	const rows = filterLotTransactions(filterSample(), defaultLotFilter());

	assert.deepEqual(rows.map((row) => row.Key), ["a", "c", "d"]);
});

QUnit.test("sem status marcado mostra tudo, inclusive cancelado", function (assert) {
	const rows = filterLotTransactions(filterSample(), { statuses: [], types: [], search: "" });

	assert.strictEqual(rows.length, 4);
});

QUnit.test("status, tipo e busca se combinam", function (assert) {
	const keys = (filter: Parameters<typeof filterLotTransactions>[1]) =>
		filterLotTransactions(filterSample(), filter).map((row) => row.Key);

	assert.deepEqual(keys({ statuses: ["Cancelled"], types: [], search: "" }), ["b"]);
	assert.deepEqual(keys({ statuses: [], types: ["Receipt"], search: "" }), ["a", "b"]);
	assert.deepEqual(keys({ statuses: ["Confirmed"], types: ["Shipment"], search: "" }), []);
	assert.deepEqual(keys({ statuses: [], types: [], search: " abc1d " }), ["a"], "placa, sem diferenciar maiúsculas");
	assert.deepEqual(keys({ statuses: [], types: [], search: "7788" }), ["c"], "documento");
	assert.deepEqual(keys({ statuses: [], types: [], search: "0000159" }), ["c"], "código do romaneio");
});

QUnit.test("lista os tipos presentes sem repetir", function (assert) {
	assert.deepEqual(lotTransactionTypes(filterSample()), ["Receipt", "Shipment", "SalesShipment"]);
	assert.deepEqual(lotTransactionTypes([]), []);
});

QUnit.module("StorageAddressDetailHelpers - lotTotals (rodapé do lote)");

QUnit.test("soma entradas, saídas e quebra técnica pelo peso líquido", function (assert) {
	const totals = lotTotals([
		transaction({ TransactionType: "Receipt", NetWeight: 1000 }),
		transaction({ TransactionType: "Receipt", NetWeight: 500.5 }),
		transaction({ TransactionType: "Shipment", NetWeight: 300 }),
		transaction({ TransactionType: "TechnicalLoss", NetWeight: 10.25 }),
	]);

	assert.deepEqual(totals, { receipts: 1500.5, shipments: 300, technicalLoss: 10.25, balance: 1190.25 });
});

QUnit.test("só romaneio confirmado ou faturado entra no saldo", function (assert) {
	const totals = lotTotals([
		transaction({ TransactionStatus: "Confirmed", NetWeight: 100 }),
		transaction({ TransactionStatus: "Invoiced", NetWeight: 50 }),
		transaction({ TransactionStatus: "Pending", NetWeight: 999 }),
		transaction({ TransactionStatus: "Cancelled", NetWeight: 999 }),
		transaction({ TransactionStatus: "Returned", NetWeight: 999 }),
	]);

	assert.strictEqual(totals.receipts, 150);
	assert.strictEqual(totals.balance, 150);
});

QUnit.test("segue a mesma regra de tipos do saldo do lote no servidor", function (assert) {
	// StorageAddress.TotalReceipt / TotalShipment no backend.
	const totals = lotTotals([
		transaction({ TransactionType: "ShipmentReleased", NetWeight: 10 }),
		transaction({ TransactionType: "SalesShipmentReturn", NetWeight: 20 }),
		transaction({ TransactionType: "SalesShipment", NetWeight: 5 }),
		transaction({ TransactionType: "WarehouseLoss", NetWeight: 999 }),
		transaction({ TransactionType: "Purchase", NetWeight: 999 }),
	]);

	assert.deepEqual(totals, { receipts: 30, shipments: 5, technicalLoss: 0, balance: 25 });
});

QUnit.test("somas de três casas não acumulam erro de ponto flutuante", function (assert) {
	const totals = lotTotals([
		transaction({ NetWeight: 0.1 }),
		transaction({ NetWeight: 0.2 }),
	]);

	assert.strictEqual(totals.receipts, 0.3);
});
