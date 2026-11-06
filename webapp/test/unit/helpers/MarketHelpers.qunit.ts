import {
  changePercentState, connectionView, deviationPercent, extractGroups, formatChangePercent, formatLast, formatQuoteTime,
  formatQuoteValue, groupFromKey, groupKey, isManualQuote, manualTooltip, normalizeQuotes, notFoundTextKey,
  NO_GROUP_KEY, parseDecimalInput, parseServerInstant, withFlashes, clearFlashes, flashAttr, FLASH_DURATION_MS
} from "siagrob1/helpers/MarketHelpers";
import { MarketQuote } from "siagrob1/types/MarketQuote";

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

QUnit.test("instante do servidor sem fuso é UTC", function (assert) {
  const utc = Date.UTC(2026, 10, 5, 23, 15, 0);
  assert.strictEqual(parseServerInstant("2026-11-05T23:15:00Z").getTime(), utc);
  assert.strictEqual(parseServerInstant("2026-11-05T23:15:00").getTime(), utc);
  assert.strictEqual(parseServerInstant("2026-11-05T20:15:00-03:00").getTime(), utc);
  assert.strictEqual(parseServerInstant(null), null);
});

QUnit.test("aba sem grupo usa chave sentinela, não vazia", function (assert) {
  assert.strictEqual(groupKey(""), NO_GROUP_KEY);
  assert.strictEqual(groupKey(null), NO_GROUP_KEY);
  assert.strictEqual(groupKey("Soja CBOT"), "Soja CBOT");
  assert.strictEqual(groupFromKey(NO_GROUP_KEY), "");
  assert.strictEqual(groupFromKey("Soja CBOT"), "Soja CBOT");
});

QUnit.test("404 só é módulo desligado com o cabeçalho", function (assert) {
  assert.strictEqual(notFoundTextKey(true), "marketModuleDisabled");
  assert.strictEqual(notFoundTextKey(false), "marketServiceNotFound");
});

QUnit.test("tooltip da origem mostra quem lançou", function (assert) {
  assert.strictEqual(manualTooltip("Manual", "Lançada manualmente por {0}", "ana"), "Lançada manualmente por ana");
  assert.strictEqual(manualTooltip("Manual", "Lançada manualmente por {0}", null), "Manual");
});

QUnit.test("desvio do último preço em porcentagem", function (assert) {
  assert.ok(Math.abs(deviationPercent(1.188, 1188) - 99.9) < 1e-9);
  assert.ok(Math.abs(deviationPercent(110, 100) - 10) < 1e-9);
  assert.strictEqual(deviationPercent(10, null), null);
  assert.strictEqual(deviationPercent(10, 0), null);
});

QUnit.module("MarketHelpers - célula piscando na alta e na baixa");

const q = (code: string, last: number, extra: Partial<MarketQuote> = {}): MarketQuote => ({
  code, description: code, groupName: "", sortOrder: 0, last, bid: null, changePercent: null, high: null, low: null,
  open: null, isSettlement: false, quotedAt: null, source: "cma", manualOverride: false, ...extra,
});

QUnit.test("primeiro quadro é linha de base: nada pisca", function (assert) {
  const rows = withFlashes(null, [q("A", 10)], 1, 0);
  assert.deepEqual(rows[0].flash, { last: "", bid: "", high: "", low: "", open: "" });
});

QUnit.test("alta pisca up, baixa pisca down, só no campo que mudou", function (assert) {
  const rows = withFlashes([q("A", 10, { bid: 5 }), q("B", 10)], [q("A", 11, { bid: 5 }), q("B", 9)], 1, 0);
  assert.ok(rows[0].flash.last.startsWith("up"));
  assert.strictEqual(rows[0].flash.bid, "");
  assert.strictEqual(rows[0].flash.high, "");
  assert.ok(rows[1].flash.last.startsWith("down"));
});

QUnit.test("sem mudança, nulo para número, número para nulo e instrumento novo não piscam", function (assert) {
  const rows = withFlashes([q("A", 10), q("B", null), q("C", 7)], [q("A", 10), q("B", 3), q("C", null), q("D", 1)], 1, 0);
  for (const row of rows) assert.strictEqual(row.flash.last, "", row.code);
});

QUnit.test("duas altas seguidas geram descritores diferentes (a animação reinicia)", function (assert) {
  const first = withFlashes([q("A", 10)], [q("A", 11)], 1, 0);
  const second = withFlashes(first, [q("A", 12)], 2, 10);
  assert.ok(second[0].flash.last.startsWith("up"));
  assert.notStrictEqual(first[0].flash.last, second[0].flash.last);
});

QUnit.test("compara pelo código, não pela posição", function (assert) {
  const rows = withFlashes([q("A", 10), q("B", 20)], [q("B", 20), q("A", 9)], 1, 0);
  assert.strictEqual(rows[0].flash.last, "");
  assert.ok(rows[1].flash.last.startsWith("down"));
});

QUnit.test("clearFlashes zera tudo sem perder os dados", function (assert) {
  const rows = clearFlashes(withFlashes([q("A", 10)], [q("A", 11)], 1, 0));
  assert.strictEqual(rows[0].flash.last, "");
  assert.strictEqual(rows[0].last, 11);
});

QUnit.test("piscada segue idêntica dentro da janela e cai depois dela", function (assert) {
  const first = withFlashes([q("A", 10, { bid: 1 })], [q("A", 11, { bid: 1 })], 1, 1000);
  const within = withFlashes(first, [q("A", 11, { bid: 1 })], 2, 1000 + FLASH_DURATION_MS - 1);
  assert.strictEqual(within[0].flash.last, first[0].flash.last);
  assert.strictEqual(within[0].flash.bid, "");
  const after = withFlashes(within, [q("A", 11, { bid: 1 })], 3, 1000 + FLASH_DURATION_MS);
  assert.strictEqual(after[0].flash.last, "");
});

QUnit.test("novo movimento dentro da janela troca o descritor", function (assert) {
  const first = withFlashes([q("A", 10)], [q("A", 11)], 1, 0);
  const second = withFlashes(first, [q("A", 10)], 2, 100);
  assert.ok(second[0].flash.last.startsWith("down"));
  assert.notStrictEqual(second[0].flash.last, first[0].flash.last);
});

QUnit.test("atributo da piscada é sempre string", function (assert) {
  assert.strictEqual(flashAttr(undefined), "");
  assert.strictEqual(flashAttr(null), "");
  assert.strictEqual(flashAttr("up-a-1"), "up-a-1");
});

QUnit.test("depois de clearFlashes nada é carregado adiante, mesmo dentro da janela", function (assert) {
  const prev = withFlashes([q("A", 10)], [q("A", 11)], 1, 0);
  const rows = withFlashes(clearFlashes(prev), [q("A", 11)], 2, 100);
  assert.deepEqual(rows[0].flash, { last: "", bid: "", high: "", low: "", open: "" });
});
