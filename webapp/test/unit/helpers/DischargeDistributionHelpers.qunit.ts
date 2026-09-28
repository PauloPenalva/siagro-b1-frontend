import {
	buildDistributionLines,
	describeDistribution,
	distributeProportionally,
	LoadInvoice,
	noEligibleLinesMessage,
	redistributeShares,
	round3,
	savedSharesNotice,
	summarizeDistribution
} from "siagrob1/helpers/DischargeDistributionHelpers";

QUnit.module("DischargeDistributionHelpers - rateio do ticket de descarga (GAC-1171)");

QUnit.test("round3 lê Edm.Decimal em string e zera o que não é número", function (assert) {
	assert.strictEqual(round3("20000.000"), 20000);
	assert.strictEqual(round3(333.33349), 333.333);
	assert.strictEqual(round3(undefined), 0);
	assert.strictEqual(round3("abc"), 0);
});

QUnit.test("rateia proporcional à base e fecha com o total", function (assert) {
	assert.deepEqual(distributeProportionally(35000, [20000, 15000]), [20000, 15000]);
	assert.deepEqual(distributeProportionally(39500, [20000, 20000]), [19750, 19750]);
});

QUnit.test("o resíduo do arredondamento vai para a última linha com base", function (assert) {
	assert.deepEqual(distributeProportionally(1000, [1, 1, 1]), [333.333, 333.333, 333.334]);
	assert.deepEqual(distributeProportionally(39500, [20000, 0, 20000]), [19750, 0, 19750]);
});

QUnit.test("uma linha só recebe o total; sem total ou sem base, nada é rateado", function (assert) {
	assert.deepEqual(distributeProportionally(39500, [20000]), [39500]);
	assert.deepEqual(distributeProportionally(0, [20000, 15000]), [0, 0]);
	assert.deepEqual(distributeProportionally(1000, [0, 0]), [0, 0]);
});

QUnit.test("summarizeDistribution fecha dentro de 0,001 e informa o que falta ou sobra", function (assert) {
	assert.deepEqual(summarizeDistribution(35000, [20000, 15000]), { distributed: 35000, remaining: 0, closed: true });
	assert.deepEqual(summarizeDistribution(35000.0004, [20000, 15000]).closed, true);
	assert.deepEqual(summarizeDistribution(35000, [20000, 10000]), { distributed: 30000, remaining: 5000, closed: false });
	assert.deepEqual(summarizeDistribution(35000, [20000, 16000]).remaining, -1000);
});

QUnit.test("describeDistribution monta o texto da faixa em pt-BR", function (assert) {
	assert.strictEqual(describeDistribution(35000, [20000, 15000]).text, "Rateado 35.000,000 de 35.000,000.");
	assert.strictEqual(
		describeDistribution(35000, [20000, 10000]).text,
		"Rateado 30.000,000 de 35.000,000. Falta distribuir 5.000,000.");
	assert.strictEqual(
		describeDistribution(35000, [20000, 16000]).text,
		"Rateado 36.000,000 de 35.000,000. Excede em 1.000,000.");
});

const invoices: LoadInvoice[] = [
	{
		Key: "inv-1", InvoiceNumber: "000100", InvoiceType: "Normal", InvoiceStatus: "Confirmed",
		Items: [{
			Key: "item-1", ItemCode: "SOJA", ItemName: "SOJA EM GRAOS", Quantity: "20000.000",
			ReturnedQuantity: "5000.000", TicketDeliveredQuantity: "9000.000", SalesContract: { Code: "CV-1" }
		}]
	},
	{
		Key: "inv-2", InvoiceNumber: "", InvoiceType: "Normal", InvoiceStatus: "Confirmed",
		Items: [{ Key: "item-2", ItemCode: "SOJA", ItemName: "SOJA EM GRAOS", Quantity: "20000.000", ReturnedQuantity: "0.000" }]
	},
	{ Key: "inv-3", InvoiceNumber: "000102", InvoiceType: "Normal", InvoiceStatus: "Pending", Items: [{ Key: "item-3", Quantity: "1" }] },
	{ Key: "inv-4", InvoiceNumber: "000103", InvoiceType: "Normal", InvoiceStatus: "Cancelled", Items: [{ Key: "item-4", Quantity: "1" }] },
	{ Key: "inv-5", InvoiceNumber: "000104", InvoiceType: "Return", InvoiceStatus: "Confirmed", Items: [{ Key: "item-5", Quantity: "1" }] },
	{
		Key: "inv-6", InvoiceNumber: "000105", InvoiceType: "Normal", InvoiceStatus: "Confirmed",
		Items: [{ Key: "item-6", Quantity: "8000.000", ReturnedQuantity: "8000.000" }]
	}
];

QUnit.test("buildDistributionLines oferece só Normal + Confirmada com faturado que não voltou", function (assert) {
	const lines = buildDistributionLines(invoices);

	assert.deepEqual(lines.map(line => line.salesInvoiceItemKey), ["item-1", "item-2"]);
	assert.strictEqual(lines[0].invoiceNumber, "000100");
	assert.strictEqual(lines[1].invoiceNumber, "(sem número)");
	assert.strictEqual(lines[0].contractCode, "CV-1");
	assert.strictEqual(lines[0].itemText, "(SOJA) SOJA EM GRAOS");
	assert.strictEqual(lines[0].quantity, 20000);
	assert.strictEqual(lines[0].returnedQuantity, 5000);
	assert.strictEqual(lines[0].remainingQuantity, 15000);
	assert.strictEqual(lines[0].otherTickets, 9000);
	assert.strictEqual(lines[0].share, 0);
});

QUnit.test("na edição, o rateio gravado preenche o Peso Rateado e sai do Já descarregado", function (assert) {
	const lines = buildDistributionLines(invoices, new Map([["item-1", 9000]]));

	assert.strictEqual(lines[0].share, 9000);
	assert.strictEqual(lines[0].otherTickets, 0);
});

QUnit.test("linha elegível não é travada", function (assert) {
	assert.ok(buildDistributionLines(invoices).every(line => line.locked === false));
});

// Revisão final: o ticket rateou 19.750 na 000101, e depois a confirmação dela foi ESTORNADA.
const withPending: LoadInvoice[] = [
	{
		Key: "inv-a", InvoiceNumber: "000100", InvoiceType: "Normal", InvoiceStatus: "Confirmed",
		Items: [{ Key: "item-a", Quantity: "20000.000", TicketDeliveredQuantity: "19750.000" }]
	},
	{
		Key: "inv-b", InvoiceNumber: "000101", InvoiceType: "Normal", InvoiceStatus: "Pending",
		Items: [{ Key: "item-b", Quantity: "20000.000", TicketDeliveredQuantity: "19750.000" }]
	},
	{
		Key: "inv-c", InvoiceNumber: "000102", InvoiceType: "Normal", InvoiceStatus: "Cancelled",
		Items: [{ Key: "item-c", Quantity: "5000.000", TicketDeliveredQuantity: "5000.000" }]
	}
];
const savedShares = new Map([["item-a", 19750], ["item-b", 19750], ["item-c", 5000]]);

QUnit.test("na edição, a parcela gravada em nota que voltou a Pendente volta travada", function (assert) {
	const lines = buildDistributionLines(withPending, savedShares);

	assert.deepEqual(lines.map(line => line.salesInvoiceItemKey), ["item-a", "item-b"]);
	assert.strictEqual(lines[1].locked, true);
	assert.strictEqual(lines[1].share, 19750);
	assert.strictEqual(lines[1].otherTickets, 0);
	assert.strictEqual(lines[0].locked, false);
});

QUnit.test("nota Pendente sem parcela gravada continua fora do rateio", function (assert) {
	const lines = buildDistributionLines(withPending, new Map([["item-a", 19750]]));

	assert.deepEqual(lines.map(line => line.salesInvoiceItemKey), ["item-a"]);
});

QUnit.test("redistributeShares preserva a parcela travada e rateia só o resto", function (assert) {
	const lines = buildDistributionLines(withPending, savedShares);

	assert.deepEqual(redistributeShares(39600, lines), [19850, 19750]);
	assert.deepEqual(redistributeShares(10000, lines), [0, 19750]);
});

QUnit.test("savedSharesNotice explica a parcela travada e a que saiu do rateio", function (assert) {
	const lines = buildDistributionLines(withPending, savedShares);

	assert.strictEqual(
		savedSharesNotice(withPending, savedShares, lines),
		"Mantida como gravada, porque o documento voltou a Pendente: 000101 (19.750,000). Confirme o "
		+ "documento de novo para mudar essa parcela. Saiu do rateio, porque o documento não recebe mais "
		+ "descarga: 000102 (5.000,000).");
	assert.strictEqual(savedSharesNotice(invoices, new Map(), buildDistributionLines(invoices)), "");
});

QUnit.test("noEligibleLinesMessage diz por que o diálogo não abre", function (assert) {
	assert.ok(noEligibleLinesMessage([]).startsWith("Esta carga ainda não tem documento de saída."));
	assert.strictEqual(
		noEligibleLinesMessage([{ Key: "a", InvoiceType: "Normal", InvoiceStatus: "Cancelled" }]),
		"Todos os documentos de saída desta carga estão cancelados.");
	assert.ok(noEligibleLinesMessage([{ Key: "a", InvoiceType: "Normal", InvoiceStatus: "Pending" }])
		.startsWith("Nenhum documento de saída desta carga está confirmado."));
	assert.ok(noEligibleLinesMessage([{ Key: "a", InvoiceType: "Normal", InvoiceStatus: "Confirmed" }])
		.startsWith("Os documentos de saída confirmados desta carga foram devolvidos por inteiro."));
});

QUnit.test("carga devolvida por inteiro não manda confirmar documento (achado no navegador)", function (assert) {
	const returned = "Os documentos de saída confirmados desta carga foram devolvidos por inteiro.";

	assert.ok(noEligibleLinesMessage([{ Key: "a", InvoiceType: "Normal", InvoiceStatus: "Returned" }])
		.startsWith(returned));
	assert.ok(noEligibleLinesMessage([
		{ Key: "a", InvoiceType: "Normal", InvoiceStatus: "Returned" },
		{ Key: "b", InvoiceType: "Normal", InvoiceStatus: "Cancelled" }
	]).startsWith(returned));
	assert.ok(noEligibleLinesMessage([
		{ Key: "a", InvoiceType: "Normal", InvoiceStatus: "Returned" },
		{ Key: "b", InvoiceType: "Normal", InvoiceStatus: "Pending" }
	]).startsWith("Nenhum documento de saída desta carga está confirmado."));
});
