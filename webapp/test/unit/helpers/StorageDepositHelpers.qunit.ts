import { canIssueRemittance, reconciliationDifference, isRemittancePriceValid, StorageRemittanceSummary } from "siagrob1/helpers/StorageDepositHelpers";

const empty: StorageRemittanceSummary = {
  RemittanceKey: null, RemittanceNumber: null, RemittanceStatus: null, RemittanceNfeStatus: null,
  RemittedQuantity: 0, ReturnedQuantity: 0, PendingReturnQuantity: 0, ShippedWithoutReturnQuantity: 0,
  Returns: [], Transactions: [],
};

QUnit.module("StorageDepositHelpers");

QUnit.test("canIssueRemittance: liberação viva sem remessa ativa em STANDALONE", (assert) => {
  assert.strictEqual(canIssueRemittance("Actived", empty, true), true);
  assert.strictEqual(canIssueRemittance("Pending", empty, true), true);
  assert.strictEqual(canIssueRemittance("Cancelled", empty, true), false, "cancelada");
  assert.strictEqual(canIssueRemittance("Actived", { ...empty, RemittanceKey: "k" }, true), false, "já tem remessa");
  assert.strictEqual(canIssueRemittance("Actived", empty, false), false, "SAPB1");
  assert.strictEqual(canIssueRemittance("Actived", undefined, true), false, "resumo não carregado");
});

QUnit.test("reconciliationDifference: nota menos soma dos romaneios", (assert) => {
  assert.deepEqual(reconciliationDifference(30000, [15000, 14500]), { selected: 29500, difference: 500 });
  assert.deepEqual(reconciliationDifference(30000, []), { selected: 0, difference: 30000 });
});

QUnit.test("isRemittancePriceValid: número maior que zero", (assert) => {
  assert.strictEqual(isRemittancePriceValid(2.5), true);
  assert.strictEqual(isRemittancePriceValid("2,5"), true);
  assert.strictEqual(isRemittancePriceValid(0), false);
  assert.strictEqual(isRemittancePriceValid(""), false);
  assert.strictEqual(isRemittancePriceValid("abc"), false);
});
