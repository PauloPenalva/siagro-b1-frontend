import { accountingClassText } from "siagrob1/helpers/AccountingMasterDataHelpers";

QUnit.module("AccountingMasterDataHelpers - cadastros contábeis");

QUnit.test("accountingClassText traduz a classe", function (assert) {
	assert.strictEqual(accountingClassText("Synthetic"), "Sintético");
	assert.strictEqual(accountingClassText("Analytic"), "Analítico");
	assert.strictEqual(accountingClassText(null), "", "nulo não quebra");
	assert.strictEqual(accountingClassText("Outro"), "");
});
