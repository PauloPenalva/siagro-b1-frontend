import { mapPaymentReleaseExportRow, PAYMENT_RELEASE_EXPORT_DEPARTMENTS } from "siagrob1/helpers/PaymentReleaseExportHelpers";

QUnit.module("PaymentReleaseExportHelpers - linha do Excel");

QUnit.test("cabeçalhos dos departamentos na ordem da lista", function (assert) {
	assert.deepEqual(PAYMENT_RELEASE_EXPORT_DEPARTMENTS.map(d => d[2]), [
		"Lib. Estoque", "Lib. Jurídico", "Lib. Fiscal", "Lib. Royalties",
		"Lib. Financeiro", "Lib. Loja", "Lib. Diretoria",
	]);
});

QUnit.test("Sim/Não por departamento e travessão na Loja fora de barter", function (assert) {
	const row = mapPaymentReleaseExportRow({
		Code: "C1",
		IsBarter: false,
		PaymentReleases: [
			{ Department: "Stock", Released: true },
			{ Department: "Legal", Released: false },
			{ Department: "Store", Released: true },
		],
	});

	assert.strictEqual(row.Code, "C1", "mantém colunas do contrato");
	assert.strictEqual(row.PaymentReleases, undefined, "não vaza a coleção");
	assert.strictEqual(row.ReleaseStock, "Sim");
	assert.strictEqual(row.ReleaseLegal, "Não");
	assert.strictEqual(row.ReleaseFiscal, "Não", "sem linha vale Não");
	assert.strictEqual(row.ReleaseStore, "—");
});

QUnit.test("Loja em barter usa o valor liberado", function (assert) {
	const row = mapPaymentReleaseExportRow({
		IsBarter: true,
		PaymentReleases: [{ Department: "Store", Released: true }],
	});

	assert.strictEqual(row.ReleaseStore, "Sim");
	assert.strictEqual(mapPaymentReleaseExportRow({ IsBarter: true }).ReleaseStore, "Não");
});
