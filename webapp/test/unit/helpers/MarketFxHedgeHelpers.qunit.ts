import {
  buildFxHedgePayload, buildFxHedgesFilter, defaultFxFilter, formatDayMonth, formatFxResult, formatRate, formatUsd,
  fxHedgeActions, fxKindTextKey, fxSettlementResult, fxStatusState, fxStatusTextKey, fxTotals, FxHedgeForm,
  formatRateInput, parseSettlementRate, suggestedRateSourceKey
} from "siagrob1/helpers/MarketFxHedgeHelpers";

QUnit.module("MarketFxHedgeHelpers - resultado da liquidação");

QUnit.test("venda de US$: (contratada − liquidação) × US$, 2 casas", function (assert) {
  assert.strictEqual(fxSettlementResult("sell", 5.45, 5.40, 100000), 5000);
  assert.strictEqual(fxSettlementResult("Sell", "5.4500", "5.5000", "100000.00"), -5000, "texto do OData e enum PascalCase");
  assert.strictEqual(fxSettlementResult("sell", 5.4321, 5.4, 1000), 32.1, "arredondado a 2 casas");
});

QUnit.test("compra de US$: o inverso da venda", function (assert) {
  assert.strictEqual(fxSettlementResult("buy", 5.45, 5.40, 100000), -5000);
  assert.strictEqual(fxSettlementResult("buy", 5.40, 5.45, 100000), 5000);
});

QUnit.test("meio centavo arredonda para longe do zero, também nos negativos", function (assert) {
  assert.strictEqual(fxSettlementResult("sell", 5.4, 5.395, 1), 0.01);
  assert.strictEqual(fxSettlementResult("sell", 5.395, 5.4, 1), -0.01);
});

QUnit.test("sem dado válido não há resultado (nunca NaN)", function (assert) {
  assert.strictEqual(fxSettlementResult("sell", 5.4, null, 1000), null);
  assert.strictEqual(fxSettlementResult("sell", "", 5.4, 1000), null);
  assert.strictEqual(fxSettlementResult("sell", 5.4, 5.3, undefined), null);
});

QUnit.module("MarketFxHedgeHelpers - formatação e enums");

QUnit.test("casas fixas: taxa 4, US$ 2, resultado com sinal; ausente vira traço", function (assert) {
  assert.strictEqual(formatRate(5.45), "5,4500");
  assert.strictEqual(formatRate("5.123456"), "5,1235");
  assert.strictEqual(formatUsd(100000), "US$ 100.000,00");
  assert.strictEqual(formatFxResult(5000), "R$ +5.000,00");
  assert.strictEqual(formatFxResult(-12.5), "R$ -12,50");
  for (const empty of [null, undefined, ""]) {
    assert.strictEqual(formatRate(empty), "–");
    assert.strictEqual(formatUsd(empty), "–");
    assert.strictEqual(formatFxResult(empty), "–");
  }
});

QUnit.test("enums do OData (PascalCase) e do REST (camelCase) caem na mesma chave", function (assert) {
  assert.strictEqual(fxKindTextKey("Ndf"), "marketFxKind_ndf");
  assert.strictEqual(fxKindTextKey("forward"), "marketFxKind_forward");
  assert.strictEqual(fxKindTextKey("x"), "marketFxKind_unknown");
  assert.strictEqual(fxStatusTextKey("Settled"), "marketFxStatus_settled");
  assert.strictEqual(fxStatusTextKey(undefined), "marketFxStatus_unknown");
  assert.strictEqual(fxStatusState("Open"), "Warning");
  assert.strictEqual(fxStatusState("settled"), "Success");
  assert.strictEqual(fxStatusState("Canceled"), "None");
});

QUnit.test("origem da taxa sugerida e dia/mês", function (assert) {
  assert.strictEqual(suggestedRateSourceKey("dailyClose"), "marketFxSuggestedDailyClose");
  assert.strictEqual(suggestedRateSourceKey("lastQuote"), "marketFxSuggestedLastQuote");
  assert.strictEqual(suggestedRateSourceKey(null), "marketFxSuggestedNone");
  assert.strictEqual(formatDayMonth("2026-11-05"), "05/11");
  assert.strictEqual(formatDayMonth(null), "–");
});

QUnit.module("MarketFxHedgeHelpers - ações");

QUnit.test("editar/excluir só em aberto e não conferido; liquidar/cancelar em aberto; reabrir em liquidado", function (assert) {
  const open = fxHedgeActions({ Status: "Open", Confirmed: false }, true);
  assert.deepEqual(
    [open.canEdit, open.canDelete, open.canSettle, open.canCancel, open.canReopen, open.canConfirm, open.canUnconfirm, open.blockedKey],
    [true, true, true, true, false, true, false, ""]
  );
  const confirmed = fxHedgeActions({ Status: "Open", Confirmed: true }, true);
  assert.deepEqual([confirmed.canEdit, confirmed.canDelete, confirmed.canSettle, confirmed.canUnconfirm], [false, false, true, true]);
  assert.strictEqual(confirmed.blockedKey, "marketFxBlockedConfirmed");
  const settled = fxHedgeActions({ Status: "Settled", Confirmed: false }, true);
  assert.deepEqual([settled.canEdit, settled.canSettle, settled.canCancel, settled.canReopen], [false, false, false, true]);
  assert.strictEqual(settled.blockedKey, "marketFxBlockedNotOpen");
  const canceled = fxHedgeActions({ Status: "Canceled" }, true);
  assert.deepEqual([canceled.canEdit, canceled.canSettle, canceled.canReopen], [false, false, true], "cancelado também reabre");
  assert.strictEqual(fxHedgeActions({ Status: "Open" }, true).canReopen, false, "aberto não reabre");
});

QUnit.test("sem permissão ou sem linha nada é habilitado", function (assert) {
  for (const actions of [fxHedgeActions({ Status: "Open" }, false), fxHedgeActions(undefined, true)]) {
    assert.deepEqual(
      [actions.canEdit, actions.canDelete, actions.canSettle, actions.canReopen, actions.canCancel, actions.canConfirm, actions.canUnconfirm],
      [false, false, false, false, false, false, false]
    );
  }
});

QUnit.module("MarketFxHedgeHelpers - filtro e totais");

QUnit.test("filtro padrão: abertos ou liquidados nos últimos 30 dias, enum no $filter cru", function (assert) {
  const now = new Date(2026, 10, 6, 12, 0, 0);
  const since = new Date(2026, 9, 7).toISOString();
  assert.strictEqual(
    buildFxHedgesFilter(defaultFxFilter(), now),
    `(Status eq 'Open' or (Status eq 'Settled' and SettledAt ge ${since}))`
  );
});

QUnit.test("situação explícita, conta e período de liquidação (Edm.Date sem aspas)", function (assert) {
  const now = new Date(2026, 10, 6);
  assert.strictEqual(
    buildFxHedgesFilter({ Status: "Settled", AccountId: "4", SettleFrom: "2026-11-01", SettleTo: "2026-11-30" }, now),
    "Status eq 'Settled' and AccountId eq 4 and SettlementDate ge 2026-11-01 and SettlementDate le 2026-11-30"
  );
  assert.strictEqual(buildFxHedgesFilter({ Status: "all" }, now), undefined, "sem critério o parâmetro some");
  assert.strictEqual(buildFxHedgesFilter({ Status: "all", AccountId: "x" }, now), undefined, "conta inválida é ignorada");
});

QUnit.test("totais: US$ em aberto por lado e resultado realizado, em centavos", function (assert) {
  const totals = fxTotals([
    { Status: "Open", Side: "Buy", AmountUsd: "100000.10" },
    { Status: "Open", Side: "Sell", AmountUsd: 50000 },
    { Status: "Open", Side: "Sell", AmountUsd: "0.20" },
    { Status: "Settled", Side: "Sell", AmountUsd: 70000, RealizedPnlBrl: "5000.10" },
    { Status: "Settled", Side: "Buy", AmountUsd: 1, RealizedPnlBrl: -0.2 },
    { Status: "Canceled", Side: "Buy", AmountUsd: 999, RealizedPnlBrl: 999 },
    { Status: "Settled", RealizedPnlBrl: null },
  ]);
  assert.deepEqual(totals, { openBoughtUsd: 100000.1, openSoldUsd: 50000.2, realizedBrl: 4999.9 });
  assert.deepEqual(fxTotals([]), { openBoughtUsd: 0, openSoldUsd: 0, realizedBrl: 0 });
});

QUnit.module("MarketFxHedgeHelpers - formulário");

const form = (over: Partial<FxHedgeForm> = {}): FxHedgeForm => ({
  tradedAt: new Date("2026-11-06T15:30:00.000Z"), accountId: "3", kind: "ndf", side: "sell", amountUsd: "100.000,00",
  contractedRate: "5,4500", settlementDate: "2026-12-15", bankReference: "  ", purchaseContractKey: "", salesContractKey: "", notes: "", ...over,
});

QUnit.test("formulário válido monta o corpo (UTC com Z, vazios viram null)", function (assert) {
  const { payload, errors } = buildFxHedgePayload(form());
  assert.deepEqual(errors, {});
  assert.strictEqual(payload.tradedAt, "2026-11-06T15:30:00.000Z");
  assert.strictEqual(payload.accountId, 3);
  assert.strictEqual(payload.amountUsd, 100000);
  assert.strictEqual(payload.contractedRate, 5.45);
  assert.strictEqual(payload.settlementDate, "2026-12-15");
  assert.strictEqual(payload.bankReference, null);
  assert.strictEqual(payload.purchaseContractKey, null);
});

QUnit.test("recusa ambíguo, zero e campos vazios", function (assert) {
  assert.strictEqual(buildFxHedgePayload(form({ amountUsd: "1.500" })).errors.amountUsd, "marketNumberAmbiguous");
  assert.strictEqual(buildFxHedgePayload(form({ contractedRate: "abc" })).errors.contractedRate, "marketInvalidNumber");
  assert.strictEqual(buildFxHedgePayload(form({ amountUsd: "0" })).errors.amountUsd, "marketFxAmountInvalid");
  assert.strictEqual(buildFxHedgePayload(form({ contractedRate: "" })).errors.contractedRate, "marketFxRateInvalid");
  assert.strictEqual(buildFxHedgePayload(form({ settlementDate: "" })).errors.settlementDate, "marketFxSettlementDateRequired");
  assert.strictEqual(buildFxHedgePayload(form({ accountId: "" })).errors.accountId, "marketRequiredField");
  assert.strictEqual(buildFxHedgePayload(form({ tradedAt: null })).errors.tradedAt, "marketFuturesTradedAtRequired");
  assert.strictEqual(buildFxHedgePayload(form({ amountUsd: "x" })).payload, undefined);
});

QUnit.test("só um vínculo de contrato segue no corpo", function (assert) {
  const both = buildFxHedgePayload(form({ purchaseContractKey: "aaa", salesContractKey: "bbb" })).payload;
  assert.strictEqual(both.purchaseContractKey, "aaa");
  assert.strictEqual(both.salesContractKey, null);
  assert.strictEqual(buildFxHedgePayload(form({ salesContractKey: "bbb" })).payload.salesContractKey, "bbb");
});

QUnit.test("taxa de liquidação digitada: vazio é nulo sem erro, ambíguo e zero recusam", function (assert) {
  assert.deepEqual(parseSettlementRate("5,4321"), { value: 5.4321 });
  assert.deepEqual(parseSettlementRate(""), { value: null });
  assert.strictEqual(parseSettlementRate("5.432").errorKey, "marketNumberAmbiguous");
  assert.strictEqual(parseSettlementRate("zero").errorKey, "marketInvalidNumber");
  assert.strictEqual(parseSettlementRate("0").errorKey, "marketFxRateInvalid");
});

QUnit.test("datas malformadas e situação desconhecida não entram no $filter", function (assert) {
  const now = new Date(2026, 10, 6);
  assert.strictEqual(buildFxHedgesFilter({ Status: "all", SettleFrom: "2026-11-01' or 1 eq 1", SettleTo: "06/11/2026" }, now), undefined);
  assert.strictEqual(buildFxHedgesFilter({ Status: "all", SettleFrom: "2026-11-01" }, now), "SettlementDate ge 2026-11-01");
  assert.strictEqual(buildFxHedgesFilter({ Status: "x' or 1 eq 1" as never }, now), undefined);
});

QUnit.test("taxa sugerida no campo: 4 casas pt-BR, relida por parseSettlementRate; ambíguo continua recusado", function (assert) {
  assert.strictEqual(formatRateInput(5.4), "5,4000");
  assert.strictEqual(formatRateInput("5.45678"), "5,4568");
  assert.strictEqual(formatRateInput(null), "");
  assert.deepEqual(parseSettlementRate(formatRateInput(5.4)), { value: 5.4 });
  assert.strictEqual(parseSettlementRate("5.400").errorKey, "marketNumberAmbiguous");
});
