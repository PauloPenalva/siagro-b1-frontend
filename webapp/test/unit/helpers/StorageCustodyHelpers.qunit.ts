import { canGenerateCustody, custodyStepState, custodyUsageFilter, isCustodyPriceValid, isPurchaseRole, StorageCustodySummary } from "siagrob1/helpers/StorageCustodyHelpers";

const summary = (next: string, applies = true): StorageCustodySummary => ({
  TransactionKey: "k", Applies: applies, NextRole: next, Steps: [],
});

QUnit.module("StorageCustodyHelpers");

QUnit.test("isPurchaseRole: entradas vão para o Documento de Entrada", (assert) => {
  assert.strictEqual(isPurchaseRole("ProcessingEntry"), true);
  assert.strictEqual(isPurchaseRole("StorageEntry"), true);
  assert.strictEqual(isPurchaseRole("ProcessingSymbolicReturn"), false);
  assert.strictEqual(isPurchaseRole("StorageReturn"), false);
  assert.strictEqual(isPurchaseRole("StorageSymbolicReturn"), false);
});

QUnit.test("custodyUsageFilter: natureza do papel e da direção", (assert) => {
  assert.strictEqual(custodyUsageFilter("ProcessingEntry"), "StorageCustodyRole eq 'ProcessingEntry' and Direction eq 'Incoming'");
  assert.strictEqual(custodyUsageFilter("StorageReturn"), "StorageCustodyRole eq 'StorageReturn' and Direction eq 'Outgoing'");
});

QUnit.test("canGenerateCustody: há etapa pendente em STANDALONE", (assert) => {
  assert.strictEqual(canGenerateCustody(summary("StorageEntry"), true), true);
  assert.strictEqual(canGenerateCustody(summary("None"), true), false, "cadeia completa");
  assert.strictEqual(canGenerateCustody(summary("StorageEntry", false), true), false, "fora do escopo");
  assert.strictEqual(canGenerateCustody(summary("StorageEntry"), false), false, "SAPB1");
  assert.strictEqual(canGenerateCustody(undefined, true), false, "não carregado");
});

QUnit.test("isCustodyPriceValid: número maior que zero", (assert) => {
  assert.strictEqual(isCustodyPriceValid(2.5), true);
  assert.strictEqual(isCustodyPriceValid("2,5"), true);
  assert.strictEqual(isCustodyPriceValid(0), false);
  assert.strictEqual(isCustodyPriceValid(""), false);
});

QUnit.test("custodyStepState: pendente em vermelho, gerada em amarelo, autorizada/escriturada em verde", (assert) => {
  assert.strictEqual(custodyStepState("Missing"), "Error");
  assert.strictEqual(custodyStepState("Generated"), "Warning");
  assert.strictEqual(custodyStepState("Authorized"), "Success");
  assert.strictEqual(custodyStepState("Recorded"), "Success");
});
