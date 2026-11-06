import {
  accountLabel, accountOptions, equivalentHint, formatCurrency, formatTons, buildFuturesTradesFilter, buildStatementsFilter, buildTradePayload, currencySymbol,
  defaultRealizedPeriod, defaultTradesFilter, formatIsoDate, formatMoney, formatPnl, formatPrice, formatSigned,
  formatSignedLots, formatSignedTons, formatTonsOrUsd, formatTradeTons, lotEquivalent, parseLots, pnlState,
  reasonTextKey, sideTextKey, toCamel, tonsPerLot, totalsByCurrency, totalView, tradeActions, TradeForm
} from "siagrob1/helpers/MarketHedgeHelpers";

QUnit.module("MarketHedgeHelpers - toneladas por lote");

QUnit.test("exemplos do plano: soja CBOT, milho B3, dólar futuro", function (assert) {
  assert.strictEqual(tonsPerLot("UsCentsPerBushel", 5000, 0.36745).toFixed(4), "136.0729");
  assert.strictEqual(Math.round(tonsPerLot("BrlPerBag", 450, 16.666667)), 27);
  assert.strictEqual(tonsPerLot("UsdPerTon", 100, 1), 100);
  assert.strictEqual(tonsPerLot("BrlPerUsd", 50000, 1), null, "dólar futuro não tem tonelada");
  assert.strictEqual(tonsPerLot("UsCentsPerBushel", "5000.000", "0.367450").toFixed(4), "136.0729", "decimal em texto");
  assert.strictEqual(tonsPerLot("BrlPerBag", 450, 0), null, "fator zero não divide");
});

QUnit.test("toneladas da operação levam o sinal do lado", function (assert) {
  assert.strictEqual(formatTradeTons(10, "Buy", "BrlPerBag", 450, 16.666667), "+270,000");
  assert.strictEqual(formatTradeTons(10, "Sell", "BrlPerBag", 450, 16.666667), "-270,000");
  assert.strictEqual(formatTradeTons(2, "Sell", "BrlPerUsd", 50000, 1), "–");
  assert.strictEqual(formatTradeTons(null, "Buy", "UsdPerTon", 100, 1), "–");
});

QUnit.test("equivalente de N lotes: toneladas ou US$", function (assert) {
  assert.deepEqual(lotEquivalent({ tonsPerLot: 27, usdPerLot: null }, 5), { kind: "tons", value: 135 });
  assert.deepEqual(lotEquivalent({ tonsPerLot: null, usdPerLot: 50000 }, 2), { kind: "usd", value: 100000 });
  assert.strictEqual(lotEquivalent({ tonsPerLot: 27 }, 0), null);
  assert.strictEqual(lotEquivalent(null, 3), null);
  assert.strictEqual(lotEquivalent({}, 3), null);
});

QUnit.test("lotes: só inteiro positivo", function (assert) {
  assert.strictEqual(parseLots("10"), 10);
  assert.strictEqual(parseLots(" 7 "), 7);
  assert.strictEqual(parseLots("2,5"), null);
  assert.strictEqual(parseLots("0"), null);
  assert.strictEqual(parseLots("-3"), null);
  assert.strictEqual(parseLots(""), null);
});

QUnit.module("MarketHedgeHelpers - formatação e sinal");

QUnit.test("sinal explícito só para positivos", function (assert) {
  assert.strictEqual(formatSigned(6250), "+6.250,00");
  assert.strictEqual(formatSigned(-100.5), "-100,50");
  assert.strictEqual(formatSigned(0), "0,00");
  assert.strictEqual(formatSigned(null), "–");
  assert.strictEqual(formatSignedLots(10), "+10");
  assert.strictEqual(formatSignedLots(-5), "-5");
  assert.strictEqual(formatSignedTons("136.0729"), "+136,073");
});

QUnit.test("valores vazios mostram traço, nunca NaN nem 0", function (assert) {
  assert.strictEqual(formatMoney(undefined), "–");
  assert.strictEqual(formatMoney(""), "–");
  assert.strictEqual(formatMoney("abc"), "–");
  assert.strictEqual(formatPrice(null), "–");
  assert.strictEqual(formatIsoDate(null), "–");
  assert.strictEqual(formatPnl(null, "brl"), "–");
  assert.strictEqual(formatTonsOrUsd(null, null), "–");
});

QUnit.test("preço como cotado e dinheiro com 2 casas", function (assert) {
  assert.strictEqual(formatMoney(1250), "1.250,00");
  assert.strictEqual(formatMoney("1250.5"), "1.250,50");
  assert.strictEqual(formatPrice(1180), "1.180,00");
  assert.strictEqual(formatPrice(5.45), "5,45");
  assert.strictEqual(formatPrice(5.4525), "5,4525");
});

QUnit.test("resultado com moeda, cor e posição em t ou US$", function (assert) {
  assert.strictEqual(formatPnl(6250, "usd"), "US$ +6.250,00");
  assert.strictEqual(formatPnl(-3375, "Brl"), "R$ -3.375,00");
  assert.strictEqual(currencySymbol("Usd"), "US$");
  assert.strictEqual(currencySymbol("xxx"), "");
  assert.strictEqual(pnlState(10), "Success");
  assert.strictEqual(pnlState(-0.01), "Error");
  assert.strictEqual(pnlState(0.004), "None", "abaixo de meio centavo é zero");
  assert.strictEqual(pnlState(null), "None");
  assert.strictEqual(formatTonsOrUsd(-270, null), "-270,000 t");
  assert.strictEqual(formatTonsOrUsd(null, 100000), "US$ +100.000,00");
  assert.strictEqual(formatIsoDate("2026-12-14T00:00:00Z"), "14/12/2026");
});

QUnit.test("valor com moeda e toneladas sem sinal", function (assert) {
  assert.strictEqual(formatCurrency(1250, "Brl"), "R$ 1.250,00");
  assert.strictEqual(formatCurrency("0.5", "usd"), "US$ 0,50");
  assert.strictEqual(formatCurrency(null, "usd"), "–");
  assert.strictEqual(formatTons(136.0729), "136,073");
  assert.strictEqual(formatTons(undefined), "–");
});

QUnit.test("enums aceitam OData e REST", function (assert) {
  assert.strictEqual(toCamel("Buy"), "buy");
  assert.strictEqual(sideTextKey("Sell"), "marketHedgeSide_sell");
  assert.strictEqual(sideTextKey("x"), "marketHedgeSide_unknown");
  assert.strictEqual(reasonTextKey("Rollover"), "marketFuturesReason_rollover");
  assert.strictEqual(accountLabel("XP", "123"), "XP – 123");
  assert.strictEqual(accountLabel("XP", ""), "XP");
});

QUnit.module("MarketHedgeHelpers - contas e filtros");

QUnit.test("contas: só corretoras, e só ativas quando pedido", function (assert) {
  const counterparties = [
    { Name: "XP", Type: "Broker" as const, Active: true, Accounts: [{ Id: 1, Code: "A1", Active: true }, { Id: 2, Code: "A2", Active: false }] },
    { Name: "Banco", Type: "Bank" as const, Active: true, Accounts: [{ Id: 3, Code: "B1", Active: true }] },
    { Name: "Velha", Type: "Broker" as const, Active: false, Accounts: [{ Id: 4, Code: "C1", Active: true }] },
  ];
  assert.deepEqual(accountOptions(counterparties, "Broker", true), [{ id: "1", label: "XP – A1" }]);
  assert.strictEqual(accountOptions(counterparties, "Broker", false).length, 3, "histórico lista inativas");
  assert.strictEqual(accountOptions(null, "Broker", true).length, 0);
});

QUnit.test("filtro de operações: período, conta, instrumento, não conferidas", function (assert) {
  assert.strictEqual(buildFuturesTradesFilter({}), undefined);
  assert.strictEqual(
    buildFuturesTradesFilter({ From: "2026-10-07", To: "2026-11-06", AccountId: "4", InstrumentCode: "ZS X26", OnlyUnconfirmed: true }),
    "TradeDate ge 2026-10-07 and TradeDate le 2026-11-06 and AccountId eq 4 and InstrumentCode eq 'ZS X26' and Confirmed eq false");
  assert.strictEqual(buildFuturesTradesFilter({ InstrumentCode: "O'X" }), "InstrumentCode eq 'O''X'");
  assert.strictEqual(buildFuturesTradesFilter({ AccountId: "abc" }), undefined, "conta inválida não vira literal");
});

QUnit.test("filtro de ajustes usa Date; padrões de período", function (assert) {
  assert.strictEqual(buildStatementsFilter({ From: "2026-11-01", AccountId: "2" }), "Date ge 2026-11-01 and AccountId eq 2");
  assert.strictEqual(defaultTradesFilter(new Date(2026, 10, 6)).From, "2026-10-07", "30 dias antes de 06/11");
  assert.deepEqual(defaultRealizedPeriod(new Date(2026, 10, 6)), { from: "2026-11-01", to: "2026-11-06" });
});

QUnit.module("MarketHedgeHelpers - ações e formulário");

QUnit.test("EFP e conferida bloqueiam editar e excluir", function (assert) {
  const free = tradeActions({ Confirmed: false, EfpId: null }, true);
  assert.deepEqual(free, { canEdit: true, canDelete: true, canConfirm: true, canUnconfirm: false, blockedKey: "" });
  const efp = tradeActions({ Confirmed: false, EfpId: 9 }, true);
  assert.strictEqual(efp.canEdit, false);
  assert.strictEqual(efp.canDelete, false);
  assert.strictEqual(efp.blockedKey, "marketFuturesBlockedEfp");
  const confirmed = tradeActions({ Confirmed: true }, true);
  assert.strictEqual(confirmed.canEdit, false);
  assert.strictEqual(confirmed.canUnconfirm, true);
  assert.strictEqual(confirmed.canConfirm, false);
  assert.strictEqual(confirmed.blockedKey, "marketFuturesBlockedConfirmed");
  assert.strictEqual(tradeActions({ Confirmed: false }, false).canConfirm, false, "sem permissão nada habilita");
  assert.strictEqual(tradeActions(undefined, true).canEdit, false, "sem seleção");
});

function form(over: Partial<TradeForm> = {}): TradeForm {
  return {
    tradedAt: new Date("2026-11-06T15:30:00.000Z"), accountId: "4", instrumentCode: "ZS X26", side: "buy", lots: "10",
    price: "1180,5", fees: "", feesCurrency: "usd", reason: "normal", brokerReference: " ", purchaseContractKey: "",
    salesContractKey: "", notes: "", ...over,
  };
}

QUnit.test("corpo do POST: UTC, números estritos, campos vazios nulos", function (assert) {
  const { payload, errors } = buildTradePayload(form());
  assert.deepEqual(errors, {});
  assert.strictEqual(payload.tradedAt, "2026-11-06T15:30:00.000Z");
  assert.strictEqual(payload.accountId, 4);
  assert.strictEqual(payload.lots, 10);
  assert.strictEqual(payload.price, 1180.5);
  assert.strictEqual(payload.fees, 0, "taxas vazias = 0");
  assert.strictEqual(payload.brokerReference, null);
  assert.strictEqual(payload.purchaseContractKey, null);
});

QUnit.test("formulário recusa o ambíguo, lotes quebrados e preço zero", function (assert) {
  assert.strictEqual(buildTradePayload(form({ price: "1.500" })).errors.price, "marketNumberAmbiguous");
  assert.strictEqual(buildTradePayload(form({ price: "abc" })).errors.price, "marketInvalidNumber");
  assert.strictEqual(buildTradePayload(form({ price: "0" })).errors.price, "marketFuturesPriceInvalid");
  assert.strictEqual(buildTradePayload(form({ lots: "2,5" })).errors.lots, "marketFuturesLotsInvalid");
  assert.strictEqual(buildTradePayload(form({ fees: "-1" })).errors.fees, "marketFuturesFeesInvalid");
  assert.strictEqual(buildTradePayload(form({ tradedAt: null })).errors.tradedAt, "marketFuturesTradedAtRequired");
  assert.strictEqual(buildTradePayload(form({ accountId: "" })).errors.accountId, "marketRequiredField");
  assert.strictEqual(buildTradePayload(form({ lots: "x" })).payload, undefined);
});

QUnit.test("só um vínculo de contrato segue no corpo", function (assert) {
  const both = buildTradePayload(form({ purchaseContractKey: "aaa", salesContractKey: "bbb" })).payload;
  assert.strictEqual(both.purchaseContractKey, "aaa");
  assert.strictEqual(both.salesContractKey, null);
  assert.strictEqual(buildTradePayload(form({ salesContractKey: "bbb" })).payload.salesContractKey, "bbb");
});

QUnit.module("MarketHedgeHelpers - totais");

QUnit.test("total por moeda em centavos, R$ antes de US$", function (assert) {
  const rows = [
    { currency: "usd", pnl: 6250.1 }, { currency: "brl", pnl: 0.1 }, { currency: "brl", pnl: 0.2 },
    { currency: "usd", pnl: -250.1 }, { currency: "brl", pnl: null },
  ];
  assert.deepEqual(totalsByCurrency(rows, "pnl"), [{ currency: "brl", total: 0.3 }, { currency: "usd", total: 6000 }]);
  assert.deepEqual(totalsByCurrency([], "pnl"), []);
  assert.deepEqual(totalView({ currency: "usd", total: -10 }), { text: "US$ -10,00", state: "Error" });
});

QUnit.module("MarketHedgeHelpers - texto de apoio dos lotes");

QUnit.test("equivalente dos lotes digitados e dica de 1 lote", function (assert) {
  const soy = { tonsPerLot: 136.0729, usdPerLot: null as number };
  assert.deepEqual(equivalentHint(soy, "10"), { key: "marketFuturesEquivalentTons", amount: "1.360,729" }, "10 lotes de soja");
  assert.deepEqual(equivalentHint(soy, "1"), { key: "marketFuturesEquivalentTons", amount: "136,073" });
  assert.deepEqual(equivalentHint(soy, ""), { key: "marketFuturesEquivalentTonsPerLot", amount: "136,073" }, "vazio: 1 lote");
  assert.deepEqual(equivalentHint(soy, "2,5"), { key: "marketFuturesEquivalentTonsPerLot", amount: "136,073" }, "inválido: 1 lote");
  assert.deepEqual(equivalentHint(soy, undefined), { key: "marketFuturesEquivalentTonsPerLot", amount: "136,073" });
  const usd = { tonsPerLot: null as number, usdPerLot: 50000 };
  assert.deepEqual(equivalentHint(usd, "2"), { key: "marketFuturesEquivalentUsd", amount: "100.000,00" }, "dólar futuro");
  assert.deepEqual(equivalentHint(usd, "x"), { key: "marketFuturesEquivalentUsdPerLot", amount: "50.000,00" });
  assert.strictEqual(equivalentHint(null, "10"), null);
  assert.strictEqual(equivalentHint({}, "10"), null);
});

QUnit.test("a venda não muda a grandeza do equivalente (o sinal fica na grade)", function (assert) {
  // O texto de apoio não leva o lado: compra e venda de 10 lotes mostram o mesmo valor.
  assert.deepEqual(equivalentHint({ tonsPerLot: 27 }, "10"), { key: "marketFuturesEquivalentTons", amount: "270,000" });
});

QUnit.test("valor que arredonda para zero não leva sinal", function (assert) {
  assert.strictEqual(formatSigned(-0.004), "0,00");
  assert.strictEqual(formatSigned(0.004), "0,00");
  assert.strictEqual(formatSigned(0.005), "+0,01");
  assert.strictEqual(formatSigned(-0.0004, 3), "0,000");
  assert.strictEqual(formatSignedTons(-0.0001), "0,000");
});
