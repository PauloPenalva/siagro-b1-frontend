import {
  ExposureLimitForm, buildExposureLimitPayload, commodityItemsProblem, commodityMonthsProblem, defaultCommodityMonth,
  limitPeriodText, missingDeliveryMonths, usdPerBagToKg, usdPerKgToBag
} from "siagrob1/helpers/MarketSetupHelpers";

QUnit.module("MarketSetupHelpers - preço em US$ por saca");

QUnit.test("por kg no banco, por saca de 60 kg na tela", function (assert) {
  assert.strictEqual(usdPerKgToBag(0.5), 30);
  assert.strictEqual(usdPerKgToBag("0.41666667"), 25, "string do OData vira número; 6 casas na volta");
  assert.strictEqual(usdPerBagToKg(30), 0.5);
  assert.strictEqual(usdPerBagToKg(25), 0.41666667, "8 casas");
  for (const empty of [null, undefined, ""]) assert.strictEqual(usdPerKgToBag(empty), null);
  assert.strictEqual(usdPerBagToKg(null), null);
});

QUnit.module("MarketSetupHelpers - mapa dos 12 meses");

QUnit.test("meses faltantes e linha padrão", function (assert) {
  assert.deepEqual(missingDeliveryMonths([]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(missingDeliveryMonths([{ DeliveryMonth: 1 }, { DeliveryMonth: 12 }]), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(defaultCommodityMonth(6), { DeliveryMonth: 6, FuturesMonth: 6, YearOffset: 0 });
});

QUnit.test("mapa completo e válido passa; incompleto ou fora da faixa recusa", function (assert) {
  const full = Array.from({ length: 12 }, (_, i) => defaultCommodityMonth(i + 1));
  assert.strictEqual(commodityMonthsProblem(full), null);
  assert.strictEqual(commodityMonthsProblem(full.slice(1)), "marketCommodityMonthsIncomplete");
  const dup = full.map((row) => ({ ...row }));
  dup[1].DeliveryMonth = 1;
  assert.strictEqual(commodityMonthsProblem(dup), "marketCommodityMonthsIncomplete", "mês repetido deixa outro faltando");
  const badOffset = full.map((row) => ({ ...row }));
  badOffset[11].YearOffset = 2;
  assert.strictEqual(commodityMonthsProblem(badOffset), "marketCommodityMonthsInvalid");
  const badMonth = full.map((row) => ({ ...row }));
  badMonth[5].FuturesMonth = 13;
  assert.strictEqual(commodityMonthsProblem(badMonth), "marketCommodityMonthsInvalid");
  const december = full.map((row) => ({ ...row }));
  december[11] = { DeliveryMonth: 12, FuturesMonth: 1, YearOffset: 1 };
  assert.strictEqual(commodityMonthsProblem(december), null, "dezembro vencendo em janeiro do ano seguinte");
});

QUnit.test("produtos: obrigatório e sem repetição", function (assert) {
  assert.strictEqual(commodityItemsProblem([]), null);
  assert.strictEqual(commodityItemsProblem([{ ItemCode: "SOJA" }, { ItemCode: "MILHO" }]), null);
  assert.strictEqual(commodityItemsProblem([{ ItemCode: " " }]), "marketCommodityItemRequired");
  assert.strictEqual(commodityItemsProblem([{ ItemCode: "SOJA" }, { ItemCode: "SOJA" }]), "marketCommodityItemDuplicated");
});

QUnit.module("MarketSetupHelpers - limites de exposição");

function form(overrides: Partial<ExposureLimitForm>): ExposureLimitForm {
  return {
    scope: "Commodity", commodityCode: "SOJA", total: true, year: 2027, month: "7",
    maxLong: "", maxShort: "", active: true, ...overrides,
  };
}

QUnit.test("período: Total ou MM/yyyy", function (assert) {
  assert.strictEqual(limitPeriodText(null, null, "Total"), "Total");
  assert.strictEqual(limitPeriodText(2027, 7, "Total"), "07/2027");
  assert.strictEqual(limitPeriodText(2027, null, "Total"), "Total");
});

QUnit.test("commodity total com máximo comprado", function (assert) {
  const result = buildExposureLimitPayload(form({ maxLong: "1500,5" }));
  assert.deepEqual(result.payload, {
    Scope: "Commodity", CommodityCode: "SOJA", Year: null, Month: null, MaxLong: 1500.5, MaxShort: null, Active: true,
  });
});

QUnit.test("dólar por mês: commodity some, ano e mês vão juntos", function (assert) {
  const result = buildExposureLimitPayload(form({ scope: "Usd", total: false, maxShort: "2000000", active: false }));
  assert.deepEqual(result.payload, {
    Scope: "Usd", CommodityCode: null, Year: 2027, Month: 7, MaxLong: null, MaxShort: 2000000, Active: false,
  });
});

QUnit.test("recusas", function (assert) {
  assert.strictEqual(buildExposureLimitPayload(form({ commodityCode: "", maxLong: "1" })).error, "marketLimitCommodityRequired");
  assert.strictEqual(buildExposureLimitPayload(form({})).error, "marketLimitMaxRequired");
  assert.strictEqual(buildExposureLimitPayload(form({ total: false, month: "", maxLong: "1" })).error, "marketLimitPeriodRequired");
  const zero = buildExposureLimitPayload(form({ maxShort: "0" }));
  assert.strictEqual(zero.error, "marketLimitMustBePositive");
  assert.strictEqual(zero.field, "maxShort");
  assert.strictEqual(buildExposureLimitPayload(form({ maxLong: "-5" })).error, "marketLimitMustBePositive");
  const ambiguous = buildExposureLimitPayload(form({ maxLong: "1.500" }));
  assert.strictEqual(ambiguous.error, "marketNumberAmbiguous");
  assert.strictEqual(ambiguous.field, "maxLong");
  assert.strictEqual(buildExposureLimitPayload(form({ maxLong: "abc" })).error, "marketInvalidNumber");
  assert.strictEqual(buildExposureLimitPayload(form({ scope: "", maxLong: "1" })).error, "marketLimitScopeRequired");
});
