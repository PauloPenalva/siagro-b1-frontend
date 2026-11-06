import {
  buildContractMarketDataPayload, contractMarketDataInitial, contractMarketDataToForm, formatFixedDecimal, instrumentOptionsFor, roundToDecimals
} from "siagrob1/helpers/ContractMarketDataHelpers";

QUnit.module("ContractMarketDataHelpers - casas fixas");

QUnit.test("pt-BR, sem milhar, casas fixas; vazio fica vazio", function (assert) {
  assert.strictEqual(formatFixedDecimal(1190, 2), "1190,00");
  assert.strictEqual(formatFixedDecimal("27", 2), "27,00");
  assert.strictEqual(formatFixedDecimal(5.4, 4), "5,4000");
  assert.strictEqual(formatFixedDecimal(-3.5, 2), "-3,50");
  for (const empty of [null, undefined, ""]) assert.strictEqual(formatFixedDecimal(empty, 2), "");
  assert.strictEqual(formatFixedDecimal("abc", 2), "");
});

QUnit.module("ContractMarketDataHelpers - formulário e corpo do PUT");

QUnit.test("contrato → formulário: US$ por kg vira por saca", function (assert) {
  assert.deepEqual(contractMarketDataToForm({
    MarketInstrumentCode: "SJC", MarketExchangePrice: 1190, MarketPremium: -0.5, MarketUsdPrice: "0.41666667", MarketFxRate: 5.4,
  }), { instrumentCode: "SJC", exchangePrice: "1190,00", premium: "-0,50", usdPerBag: "25,0000", fxRate: "5,4000" });
  assert.deepEqual(contractMarketDataToForm({}), { instrumentCode: "", exchangePrice: "", premium: "", usdPerBag: "", fxRate: "" });
});

QUnit.test("corpo: por saca ÷ 60 com 8 casas; vazio = nulo", function (assert) {
  assert.deepEqual(buildContractMarketDataPayload({
    instrumentCode: "SJC", exchangePrice: "1.190,00", premium: "-0,5", usdPerBag: "25", fxRate: "5,4",
  }).payload, { instrumentCode: "SJC", exchangePrice: 1190, premium: -0.5, usdPricePerKg: 0.41666667, fxRate: 5.4 });
  assert.deepEqual(buildContractMarketDataPayload({ instrumentCode: "", exchangePrice: "", premium: "", usdPerBag: "", fxRate: "" }).payload,
    { instrumentCode: null, exchangePrice: null, premium: null, usdPricePerKg: null, fxRate: null });
});

QUnit.test("recusa número inválido, ambíguo ou não positivo (menos o prêmio)", function (assert) {
  const base = { instrumentCode: "", exchangePrice: "", premium: "", usdPerBag: "", fxRate: "" };
  assert.deepEqual(buildContractMarketDataPayload({ ...base, exchangePrice: "abc" }), { field: "exchangePrice", error: "invalid" });
  assert.deepEqual(buildContractMarketDataPayload({ ...base, fxRate: "1.500" }), { field: "fxRate", error: "ambiguous" });
  assert.deepEqual(buildContractMarketDataPayload({ ...base, usdPerBag: "0" }), { field: "usdPerBag", error: "notPositive" });
  assert.strictEqual(buildContractMarketDataPayload({ ...base, premium: "-2" }).payload.premium, -2);
});

QUnit.module("ContractMarketDataHelpers - campos não tocados vão com o valor original");

QUnit.test("troca só o instrumento: os números seguem exatos como vieram do contrato", function (assert) {
  const contract = { MarketInstrumentCode: "SJC", MarketExchangePrice: 1190.125, MarketPremium: -0.123456, MarketUsdPrice: 0.44983333, MarketFxRate: 5.123456 };
  const initial = contractMarketDataInitial(contract);
  const form = { ...contractMarketDataToForm(contract), instrumentCode: "CBOT" };
  assert.deepEqual(buildContractMarketDataPayload(form, initial).payload,
    { instrumentCode: "CBOT", exchangePrice: 1190.125, premium: -0.123456, usdPricePerKg: 0.44983333, fxRate: 5.123456 });
});

QUnit.test("campo editado vai com o valor digitado; texto igual ao inicial não é revalidado", function (assert) {
  const contract: Record<string, unknown> = { MarketInstrumentCode: null, MarketExchangePrice: "1190.125", MarketPremium: null, MarketUsdPrice: null, MarketFxRate: 5.4 };
  const initial = contractMarketDataInitial(contract);
  const form = { ...contractMarketDataToForm(contract), exchangePrice: "1200" };
  assert.deepEqual(buildContractMarketDataPayload(form, initial).payload,
    { instrumentCode: null, exchangePrice: 1200, premium: null, usdPricePerKg: null, fxRate: 5.4 });
  const cleared = { ...contractMarketDataToForm(contract), fxRate: "" };
  assert.strictEqual(buildContractMarketDataPayload(cleared, initial).payload.fxRate, null);
  assert.strictEqual(buildContractMarketDataPayload(cleared, initial).payload.exchangePrice, 1190.125);
});

QUnit.module("ContractMarketDataHelpers - arredondamento e lista de instrumentos");

QUnit.test("arredonda para as casas mostradas; vazio continua nulo", function (assert) {
  assert.strictEqual(roundToDecimals(1190.125, 2), 1190.13);
  assert.strictEqual(roundToDecimals(-0.125, 2), -0.13);
  assert.strictEqual(roundToDecimals(5.123456, 4), 5.1235);
  assert.strictEqual(roundToDecimals(null, 2), null);
});

QUnit.test("lista do contrato = ativos + o código atual, sem acumular entre contratos", function (assert) {
  const active = [{ Code: "", Label: "" }, { Code: "SJC", Label: "SJC - Soja" }];
  assert.deepEqual(instrumentOptionsFor(active, "OLD"), [...active, { Code: "OLD", Label: "OLD" }]);
  assert.deepEqual(instrumentOptionsFor(active, "SJC"), active);
  assert.deepEqual(instrumentOptionsFor(active, null), active);
  assert.strictEqual(active.length, 2);
});
