import { summarizeContractFunrural } from "siagrob1/helpers/PurchaseContractFunruralHelpers";

QUnit.module("PurchaseContractFunruralHelpers - quadro de Funrural do contrato");

QUnit.test("três parcelas viram três linhas, com total e líquido", function (assert) {
	const result = summarizeContractFunrural({
		AvaiableVolume: 0, FunruralBase: 10000, FunruralInssRate: 1.32, FunruralRatRate: 0.11, FunruralSenarRate: 0.2,
		FunruralInssValue: 132, FunruralRatValue: 11, FunruralSenarValue: 20, TotalFunrural: 163, NetToProducer: 9837,
	});

	assert.deepEqual(result.rows.map((r) => r.Tax), ["Funrural - INSS", "Funrural - RAT", "Funrural - SENAR"]);
	assert.deepEqual(result.rows[0], { Tax: "Funrural - INSS", Base: 10000, Rate: 1.32, Value: 132 });
	assert.strictEqual(result.total, 163);
	assert.strictEqual(result.net, 9837);
});

QUnit.test("parcela de valor zero é omitida, como no quadro da Entrada", function (assert) {
	const result = summarizeContractFunrural({
		AvaiableVolume: 0, FunruralBase: 10000, FunruralInssRate: 0, FunruralRatRate: 0, FunruralSenarRate: 0.2,
		FunruralInssValue: 0, FunruralRatValue: 0, FunruralSenarValue: 20, TotalFunrural: 20, NetToProducer: 9980,
	});

	assert.deepEqual(result.rows.map((r) => r.Tax), ["Funrural - SENAR"]);
});

QUnit.test("sem natureza ou sem fixação: nenhuma linha, líquido igual à base", function (assert) {
	const result = summarizeContractFunrural({ AvaiableVolume: 0, FunruralBase: 500, NetToProducer: 500 });

	assert.deepEqual(result.rows, []);
	assert.strictEqual(result.total, 0);
	assert.strictEqual(result.net, 500);
});
