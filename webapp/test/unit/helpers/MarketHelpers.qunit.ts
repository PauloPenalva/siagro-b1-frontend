import {
  changePercentState, connectionView, extractGroups, formatChangePercent, formatLast, formatQuoteTime,
  formatQuoteValue, isManualQuote, normalizeQuotes, parseDecimalInput
} from "siagrob1/helpers/MarketHelpers";

QUnit.module("MarketHelpers - terminal de cotações");

QUnit.test("valor nulo vira travessão, nunca 0 ou null", function (assert) {
  assert.strictEqual(formatQuoteValue(null), "–");
  assert.strictEqual(formatQuoteValue(undefined), "–");
  assert.strictEqual(formatQuoteValue(0), "0,00");
  assert.strictEqual(formatQuoteValue(1234.5), "1.234,50");
  assert.strictEqual(formatChangePercent(null), "–");
  assert.strictEqual(formatQuoteTime(null), "–");
});

QUnit.test("último ganha sufixo S quando é ajuste", function (assert) {
  assert.strictEqual(formatLast(10.5, true), "10,50 S");
  assert.strictEqual(formatLast(10.5, false), "10,50");
  assert.strictEqual(formatLast(null, true), "–");
});

QUnit.test("estado da variação: verde, vermelho ou neutro", function (assert) {
  assert.strictEqual(changePercentState(1.2), "Success");
  assert.strictEqual(changePercentState(-0.3), "Error");
  assert.strictEqual(changePercentState(0), "None");
  assert.strictEqual(changePercentState(null), "None");
  assert.strictEqual(formatChangePercent(1.234), "+1,23%");
});

QUnit.test("origem manual aceita string em qualquer caixa, número 1 ou override", function (assert) {
  assert.strictEqual(isManualQuote("manual", false), true);
  assert.strictEqual(isManualQuote("Manual", false), true);
  assert.strictEqual(isManualQuote(1, false), true);
  assert.strictEqual(isManualQuote("cma", true), true);
  assert.strictEqual(isManualQuote("cma", false), false);
  assert.strictEqual(isManualQuote(null, false), false);
});

QUnit.test("grupos distintos na ordem de chegada", function (assert) {
  assert.deepEqual(extractGroups([{ groupName: "CBOT" }, { groupName: "B3" }, { groupName: "CBOT" }]), ["CBOT", "B3"]);
  assert.deepEqual(extractGroups(null), []);
});

QUnit.test("status da conexão: queda do navegador vence o status do servidor", function (assert) {
  assert.deepEqual(connectionView("connected", false), { textKey: "marketStatusConnected", state: "Success" });
  assert.deepEqual(connectionView("Connecting", false), { textKey: "marketStatusConnecting", state: "Warning" });
  assert.deepEqual(connectionView("error", false), { textKey: "marketStatusError", state: "Error" });
  assert.deepEqual(connectionView("Disabled", false), { textKey: "marketStatusDisabled", state: "Information" });
  assert.deepEqual(connectionView("connected", true), { textKey: "marketStatusNoServer", state: "Error" });
});

QUnit.test("parseDecimalInput: vírgula é pt-BR, um ponto sozinho é decimal", function (assert) {
  assert.strictEqual(parseDecimalInput("4.25"), 4.25);
  assert.strictEqual(parseDecimalInput("1188.25"), 1188.25);
  assert.strictEqual(parseDecimalInput("1.188,25"), 1188.25);
  assert.strictEqual(parseDecimalInput("1188,25"), 1188.25);
  assert.strictEqual(parseDecimalInput("-1,16"), -1.16);
  assert.strictEqual(parseDecimalInput("10"), 10);
  assert.strictEqual(parseDecimalInput(""), null);
  assert.strictEqual(Number.isNaN(parseDecimalInput("1.188.250")), true);
  assert.strictEqual(Number.isNaN(parseDecimalInput("abc")), true);
});

QUnit.test("grupo nulo ou em branco vira a aba sem grupo", function (assert) {
  const rows = normalizeQuotes([{ groupName: null }, { groupName: "  " }, { groupName: "B3" }]);
  assert.deepEqual(rows.map((r) => r.groupName), ["", "", "B3"]);
  assert.deepEqual(extractGroups([{ groupName: null }, { groupName: "B3" }]), ["", "B3"]);
});
