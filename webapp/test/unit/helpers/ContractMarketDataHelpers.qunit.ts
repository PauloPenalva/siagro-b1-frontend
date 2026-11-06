import {
  buildContractMarketDataPayload, contractMarketDataToForm, formatFixedDecimal
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
