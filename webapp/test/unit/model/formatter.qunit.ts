import formatter from "siagrob1/model/formatter";

QUnit.module("formatter - formatCodeAndName (coluna \"(código) nome\")");

QUnit.test("código e nome viram \"(código) nome\"", function (assert) {
	assert.strictEqual(formatter.formatCodeAndName("CO", "Centro-Oeste"), "(CO) Centro-Oeste");
});

QUnit.test("sem código a célula fica vazia, e não \"() \"", function (assert) {
	assert.strictEqual(formatter.formatCodeAndName(null, null), "");
	assert.strictEqual(formatter.formatCodeAndName(undefined, undefined), "");
	assert.strictEqual(formatter.formatCodeAndName("", ""), "");
});

QUnit.test("código sem nome mostra só o código", function (assert) {
	assert.strictEqual(formatter.formatCodeAndName("CO", null), "(CO)");
});

QUnit.module("formatter - rateio do ticket e devolução parcial (GAC-1171)");

QUnit.test("formatDischargeShare mostra o documento e a parcela em pt-BR", function (assert) {
	assert.strictEqual(formatter.formatDischargeShare("000100", "20000.000"), "000100 (20.000,000)");
	assert.strictEqual(formatter.formatDischargeShare("", 15000), "(sem número) (15.000,000)");
});

QUnit.test("isPartiallyReturned só marca a nota Confirmada com devolução", function (assert) {
	assert.strictEqual(formatter.isPartiallyReturned("Confirmed", "5000.000"), true);
	assert.strictEqual(formatter.isPartiallyReturned("Confirmed", "0.000"), false);
	assert.strictEqual(formatter.isPartiallyReturned("Returned", "40000.000"), false);
	assert.strictEqual(formatter.isPartiallyReturned("Confirmed", null), false);
});

QUnit.test("formatPartialReturn mostra quanto voltou", function (assert) {
	assert.strictEqual(formatter.formatPartialReturn("5000.000"), "Devolução parcial: 5.000,000");
});

QUnit.module("formatter - tipo da natureza de operação (NF-e STANDALONE)");

QUnit.test("formatUsageDirection traduz o enum e deixa vazio o nulo do SAPB1", function (assert) {
	assert.strictEqual(formatter.formatUsageDirection("Outgoing"), "Saída");
	assert.strictEqual(formatter.formatUsageDirection("Incoming"), "Entrada");
	assert.strictEqual(formatter.formatUsageDirection(null), "");
});

QUnit.module("formatter - situação da NF-e (STANDALONE)");

QUnit.test("situação vira texto em português", function (assert) {
	assert.strictEqual(formatter.formatNfeStatus("None"), "");
	assert.strictEqual(formatter.formatNfeStatus("Processing"), "Em processamento");
	assert.strictEqual(formatter.formatNfeStatus("Authorized"), "Autorizada");
	assert.strictEqual(formatter.formatNfeStatus("Rejected"), "Rejeitada");
	assert.strictEqual(formatter.formatNfeStatus("Denied"), "Denegada");
});

QUnit.test("cor da situação", function (assert) {
	assert.strictEqual(formatter.stateNfeStatus("Authorized"), "Success");
	assert.strictEqual(formatter.stateNfeStatus("Rejected"), "Error");
	assert.strictEqual(formatter.stateNfeStatus("Denied"), "Error");
	assert.strictEqual(formatter.stateNfeStatus("Processing"), "Warning");
	assert.strictEqual(formatter.stateNfeStatus("None"), "None");
});

QUnit.module("formatter - formatDateTime");

QUnit.test("data com offset vira dd/MM/yyyy HH:mm, nunca Invalid Date", function (assert) {
	const text = formatter.formatDateTime("2026-10-03T00:10:45-03:00");
	assert.notOk(text.includes("Invalid"));
	assert.ok(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(text), text);
	assert.strictEqual(formatter.formatDateTime(null), "");
});

QUnit.module("formatter - títulos firmes de compra (spec 2026-10-13)");

QUnit.test("natureza Devolução, origem da conciliação e campo Composição do log", function (assert) {
	assert.strictEqual(formatter.formatFinancialNature("PurchaseReturn"), "Devolução");
	assert.strictEqual(formatter.formatFinancialOrigin("PurchaseFiscalReconciliation"), "Conciliação fiscal de compras");
	assert.strictEqual(formatter.formatFinancialOrigin("SalesContractWashout"), "Washout de contrato de venda");
	assert.strictEqual(formatter.formatFinancialChangeLogField("Composition"), "Composição");
});

QUnit.test("origem da baixa traduzida", function (assert) {
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("Manual"), "Manual");
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("Reversal"), "Estorno");
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("InvoiceOffset"), "Abatimento");
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("Netting"), "Encontro de contas");
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("Dation"), "Dação");
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("AdvanceRefund"), "Devolução de adiantamento");
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("AdvanceApplication"), "Amortização de adiantamento");
});

QUnit.test("Cancelar título some no firme da conciliação e no provisório composto", function (assert) {
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "Firm", "PurchaseFiscalReconciliation", "0"), false);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "PurchaseReturn", "PurchaseFiscalReconciliation", "0"), false);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "Provisional", "PurchaseContractPriceFixation", "500.00"), false);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "Provisional", "PurchaseContractPriceFixation", "0"), true);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "Firm", "PurchaseInvoice", "0"), false);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "Firm", "PurchaseContractWashout", "0"), true);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0"), true);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "Firm", "SalesInvoice", "0"), false);
	assert.strictEqual(formatter.formatFinancialDocumentCancelable("Open", "0", "SalesReturn", "SalesInvoice", "0"), false);
	assert.strictEqual(formatter.isSalesFirmReceivable("Firm", "SalesInvoice"), true);
	assert.strictEqual(formatter.isSalesFirmReceivable("Firm", "PurchaseInvoice"), false);
	assert.strictEqual(formatter.formatFinancialNature("SalesReturn"), "Devolução de venda");
});

QUnit.test("formatDecimal2 aceita string do Edm.Decimal e não lança em vazio", function (assert) {
	assert.strictEqual(formatter.formatDecimal2("19728.33"), "19.728,33");
	assert.strictEqual(formatter.formatDecimal2(-2959.25), "-2.959,25");
	assert.strictEqual(formatter.formatDecimal2("abc"), "");
});

QUnit.test("tipo Complemento de valor do documento de entrada (spec D11)", function (assert) {
	assert.strictEqual(formatter.formatPurchaseInvoiceType("ValueComplement"), "Complemento de valor");
	assert.strictEqual(formatter.formatPurchaseInvoiceType("IcmsComplement"), "Complemento de ICMS");
	assert.strictEqual(formatter.formatPurchaseInvoiceType("Return"), "Devolução");
});

QUnit.module("formatter - compensação de adiantamento (spec 2026-10-14)");

QUnit.test("origem Transferência de adiantamento e campos do log", function (assert) {
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("AdvanceTransfer"), "Transferência de adiantamento");
	assert.strictEqual(formatter.formatFinancialSettlementOrigin("AdvanceApplication"), "Amortização de adiantamento");
	assert.strictEqual(formatter.formatFinancialChangeLogField("AdvanceApplication"), "Compensação de adiantamento");
	assert.strictEqual(formatter.formatFinancialChangeLogField("AdvanceTransfer"), "Transferência de adiantamento");
});

QUnit.module("formatter - formatSalesInvoiceType");

QUnit.test("traduz os tipos do documento de saída", function (assert) {
	assert.strictEqual(formatter.formatSalesInvoiceType("Normal"), "Normal");
	assert.strictEqual(formatter.formatSalesInvoiceType("Return"), "Retorno");
	assert.strictEqual(formatter.formatSalesInvoiceType("IcmsComplement"), "Complemento de ICMS");
});
