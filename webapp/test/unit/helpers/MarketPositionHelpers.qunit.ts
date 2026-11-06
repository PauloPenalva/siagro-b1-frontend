import {
  alertText, buildCard, buildFxLockPayload, currencyLabel, formatCount, formatFxRate, formatSignedAmount, canDrillDown, contractDetailRoute, diffRows, directionTextKey, drillDownQuery, flattenCommodityRows,
  flattenUsdRows, formatAmount, formatPercent, formatTons, fxLockSide, limitStateTextKey, limitStateValue, maturityLabel, signState,
  withPositionFlashes
} from "siagrob1/helpers/MarketPositionHelpers";
import { MarketPositionBucket, MarketPositionCommodity } from "siagrob1/types/MarketPosition";

const bucket = (year: number, month: number, extra: Partial<MarketPositionBucket> = {}): MarketPositionBucket =>
  ({ year, month, netTons: 10, lastPrice: 1000, futuresUnrealized: 5, physicalExchangeMtm: 1, limitState: "none", ...extra } as MarketPositionBucket);

const soy: MarketPositionCommodity = {
  code: "SOJA", name: "Soja",
  buckets: [bucket(2026, 7), bucket(null, null, { netTons: -3 })],
  total: bucket(null, null, { netTons: 7 }),
};

QUnit.module("MarketPositionHelpers - formatação");

QUnit.test("toneladas com sinal e 3 casas; valores com 2; nulo vira traço", function (assert) {
  assert.strictEqual(formatTons(1234.5), "+1.234,500");
  assert.strictEqual(formatTons(-2), "-2,000");
  assert.strictEqual(formatTons(0), "0,000");
  assert.strictEqual(formatTons(null), "–");
  assert.strictEqual(formatAmount(-1234.567), "-1.234,57");
  assert.strictEqual(formatPercent(50), "50,00%");
  assert.strictEqual(formatPercent(null), "–");
  assert.strictEqual(signState(-1), "Error");
  assert.strictEqual(signState(1), "None");
});

QUnit.test("vencimento e sem vencimento", function (assert) {
  assert.strictEqual(maturityLabel(2026, 7, "Sem vencimento"), "07/2026");
  assert.strictEqual(maturityLabel(null, null, "Sem vencimento"), "Sem vencimento");
});

QUnit.test("estado do limite e sentido do líquido", function (assert) {
  assert.strictEqual(limitStateValue("ok"), "Success");
  assert.strictEqual(limitStateValue("longExceeded"), "Error");
  assert.strictEqual(limitStateValue("shortExceeded"), "Error");
  assert.strictEqual(limitStateValue("none"), "None");
  assert.strictEqual(limitStateTextKey("shortExceeded"), "marketPositionLimitShort");
  assert.strictEqual(limitStateTextKey("none"), "marketPositionLimitNone");
  assert.strictEqual(directionTextKey(5), "marketPositionLong");
  assert.strictEqual(directionTextKey(-5), "marketPositionShort");
  assert.strictEqual(directionTextKey(0), "marketPositionFlat");
});

QUnit.module("MarketPositionHelpers - agrupamento e piscada");

QUnit.test("achata baldes seguidos do total por commodity", function (assert) {
  const rows = flattenCommodityRows([soy]);
  assert.deepEqual(rows.map((r) => r.rowKey), ["SOJA|2026|7", "SOJA|-|-", "SOJA|total"]);
  assert.strictEqual(rows[1].noMaturity, true, "balde sem vencimento marcado");
  assert.strictEqual(rows[2].isTotal, true);
  assert.notOk(canDrillDown(rows[1]), "sem vencimento não tem contratos");
  assert.ok(canDrillDown(rows[0]));
  assert.ok(canDrillDown(rows[2]));
  assert.deepEqual(drillDownQuery(rows[0]), { commodity: "SOJA", year: 2026, month: 7 });
  assert.deepEqual(drillDownQuery(rows[2]), { commodity: "SOJA" }, "total omite ano e mês");
  const usd = flattenUsdRows({ buckets: [{ year: 2026, month: 8 } as never], total: {} as never, spotFx: 5, openCommodityValueUsd: 1 });
  assert.deepEqual(usd.map((r) => r.rowKey), ["usd|2026|8", "usd|total"]);
});

QUnit.test("pisca cotação e marcações pela chave da linha", function (assert) {
  const base = withPositionFlashes(null, flattenCommodityRows([soy]), 1, 0);
  assert.strictEqual(base[0].flash.lastPrice, "", "primeiro quadro não pisca");
  const changed = { ...soy, buckets: [bucket(2026, 7, { lastPrice: 990, futuresUnrealized: 7 }), soy.buckets[1]] };
  const next = withPositionFlashes(base, flattenCommodityRows([changed]), 2, 10);
  assert.strictEqual(next[0].flash.lastPrice, "down-b-2");
  assert.strictEqual(next[0].flash.futuresUnrealized, "up-b-2");
  assert.strictEqual(next[0].flash.physicalExchangeMtm, "");
});

QUnit.test("diferença no lugar só quando as linhas são as mesmas", function (assert) {
  const a = [{ rowKey: "x", v: 1 }, { rowKey: "y", v: 2 }];
  assert.deepEqual(diffRows(a, [{ rowKey: "x", v: 1 }, { rowKey: "y", v: 3 }]), [{ index: 1, field: "v", value: 3 }]);
  assert.strictEqual(diffRows(a, [{ rowKey: "y", v: 2 }, { rowKey: "x", v: 1 }]), null);
  assert.strictEqual(diffRows(null, a), null);
});

QUnit.module("MarketPositionHelpers - cartões e câmbio");

QUnit.test("cartão com hedge, limite e sentido", function (assert) {
  const text = (key: string): string => key;
  const card = buildCard({ title: "Soja", net: -120.5, covered: 60, hedgePercent: 49.79, limitState: "shortExceeded", unit: "tons", mtmText: "m" }, text);
  assert.strictEqual(card.exposedText, "-120,500 t");
  assert.strictEqual(card.exposedState, "Error");
  assert.strictEqual(card.directionText, "marketPositionShort");
  assert.strictEqual(card.coveredText, "60,000 t");
  assert.strictEqual(card.hedgeVisible, true);
  assert.strictEqual(card.limitState, "Error");
  const usd = buildCard({ title: "Dólar", net: 1000, covered: null, hedgePercent: null, limitState: "none", unit: "usd", mtmText: "" }, text);
  assert.strictEqual(usd.exposedText, "US$ +1.000,00");
  assert.strictEqual(usd.hedgeVisible, false, "sem percentual esconde a barra");
  assert.strictEqual(usd.coveredText, "–");
});

QUnit.test("corpo do fx-lock e rotas por lado", function (assert) {
  assert.deepEqual(buildFxLockPayload(false, "abc").payload, { locked: false, fxRate: null });
  assert.deepEqual(buildFxLockPayload(true, "").payload, { locked: true, fxRate: null });
  assert.deepEqual(buildFxLockPayload(true, "5,4321").payload, { locked: true, fxRate: 5.4321 });
  assert.strictEqual(buildFxLockPayload(true, "x").error, "invalid");
  assert.strictEqual(buildFxLockPayload(true, "-1").error, "invalid");
  assert.strictEqual(fxLockSide("purchase"), "purchase");
  assert.strictEqual(fxLockSide("sales"), "sales");
  assert.strictEqual(contractDetailRoute("Purchase"), "purchaseContractsDetail");
  assert.strictEqual(contractDetailRoute("sales"), "salesContractsDetail");
});

QUnit.module("MarketPositionHelpers - rodada de correção 1");

QUnit.test("contratos sem referência: inteiro sem sinal, zero vira traço", function (assert) {
  assert.strictEqual(formatCount(3), "3");
  assert.strictEqual(formatCount(1200), "1.200");
  assert.strictEqual(formatCount(0), "–");
  assert.strictEqual(formatCount(null), "–");
});

QUnit.test("texto do alerta com unidade e sentido, em módulo", function (assert) {
  const text = (key: string, args?: unknown[]): string =>
    key === "marketPositionAlert" ? `${args[0] as string}: posição ${args[1] as string} de ${args[2] as string} acima do limite de ${args[3] as string}`
      : key === "marketPositionAlertShort" ? "vendida" : "comprada";
  assert.strictEqual(alertText({ scope: "commodity", description: "Soja — 07/2027", value: 1234.5, limitValue: 1000, state: "longExceeded" }, text),
    "Soja — 07/2027: posição comprada de 1.234,500 t acima do limite de 1.000,000 t");
  assert.strictEqual(alertText({ scope: "commodity", description: "Soja — total", value: -1500, limitValue: 1000, state: "shortExceeded" }, text),
    "Soja — total: posição vendida de 1.500,000 t acima do limite de 1.000,000 t");
  assert.strictEqual(alertText({ scope: "usd", description: "Dólar — total", value: 1234500, limitValue: 1000000, state: "longExceeded" }, text),
    "Dólar — total: posição comprada de US$ 1.234.500,00 acima do limite de US$ 1.000.000,00");
  assert.strictEqual(alertText({ scope: "usd", description: "Dólar — total", value: -2000000.5, limitValue: 1000000, state: "shortExceeded" }, text),
    "Dólar — total: posição vendida de US$ 2.000.000,50 acima do limite de US$ 1.000.000,00");
});

QUnit.test("valor com sinal, taxa de câmbio e moeda", function (assert) {
  assert.strictEqual(formatSignedAmount(1000), "+1.000,00");
  assert.strictEqual(formatSignedAmount(-2.5), "-2,50");
  assert.strictEqual(formatSignedAmount(0), "0,00");
  assert.strictEqual(formatSignedAmount(null), "–");
  assert.strictEqual(formatFxRate(5.4), "5,4000");
  assert.strictEqual(formatFxRate(null), "–");
  assert.strictEqual(currencyLabel("usd"), "US$");
  assert.strictEqual(currencyLabel("brl"), "R$");
  assert.strictEqual(currencyLabel(null), "");
});

QUnit.test("total do dólar vira a última linha, sem ano e mês", function (assert) {
  const rows = flattenUsdRows({
    buckets: [{ year: 2026, month: 8, netUsd: 10 } as never, { year: 2026, month: 9, netUsd: -4 } as never],
    total: { year: 2026, month: 9, netUsd: 6 } as never, spotFx: 5, openCommodityValueUsd: 1,
  });
  const total = rows[rows.length - 1];
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(total.isTotal, true);
  assert.strictEqual(total.netUsd, 6);
  assert.strictEqual(total.year, null);
  assert.strictEqual(total.month, null);
  assert.strictEqual(flattenUsdRows({ buckets: [], total: null, spotFx: null, openCommodityValueUsd: null }).length, 0, "sem total não cria linha");
});
