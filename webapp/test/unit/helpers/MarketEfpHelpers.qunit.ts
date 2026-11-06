import {
  EfpForm, bagsToKg, buildEfpPayload, efpInputSignature, invalidatesPreview, contractRouteName, defaultFuturesSide, efpActions, efpStatusState, efpStatusTextKey,
  exceedsAvailable, formatBagPrice, formatBags, formatFixationPerBag, formatPerKg, fxMode, kgToBags, normalizeCurrency, tonsMismatch
} from "siagrob1/helpers/MarketEfpHelpers";

QUnit.module("MarketEfpHelpers - conversões e formatação");

QUnit.test("saca de 60 kg nos dois sentidos", function (assert) {
  assert.strictEqual(bagsToKg(1000), 60000);
  assert.strictEqual(bagsToKg(0.1 + 0.2), 18, "ponto flutuante não vaza para o corpo");
  assert.strictEqual(kgToBags("60000.000"), 1000);
  assert.strictEqual(kgToBags(null), null);
});

QUnit.test("grade: sacas 2 casas, preço por saca = preço por kg × 60, traço quando ausente", function (assert) {
  assert.strictEqual(formatBags(60000), "1.000,00");
  assert.strictEqual(formatBags("90"), "1,50");
  assert.strictEqual(formatFixationPerBag(1.875), "112,50");
  assert.strictEqual(formatFixationPerBag("1.87500000"), "112,50");
  assert.strictEqual(formatPerKg(1.875), "1,8750");
  assert.strictEqual(formatPerKg(0.12345678), "0,12345678");
  for (const empty of [null, undefined, ""]) {
    assert.strictEqual(formatBags(empty), "–");
    assert.strictEqual(formatFixationPerBag(empty), "–");
    assert.strictEqual(formatPerKg(empty), "–");
    assert.strictEqual(formatBagPrice(empty, "BRL"), "–");
  }
  assert.strictEqual(formatBagPrice(112.5, "BRL"), "R$ 112,50");
  assert.strictEqual(formatBagPrice(20, "usd"), "US$ 20,00");
  assert.strictEqual(formatBagPrice(20, "xx"), "20,00");
});

QUnit.test("moeda do contrato aceita ISO e símbolo", function (assert) {
  assert.strictEqual(normalizeCurrency("BRL"), "brl");
  assert.strictEqual(normalizeCurrency("R$"), "brl");
  assert.strictEqual(normalizeCurrency(" usd "), "usd");
  assert.strictEqual(normalizeCurrency("US$"), "usd");
  assert.strictEqual(normalizeCurrency("EUR"), "");
  assert.strictEqual(normalizeCurrency(undefined), "");
});

QUnit.test("situação do EFP: Processando = Warning, Ativo = Success, Estornado = None", function (assert) {
  assert.strictEqual(efpStatusState("Processing"), "Warning");
  assert.strictEqual(efpStatusState("active"), "Success");
  assert.strictEqual(efpStatusState("Canceled"), "None");
  assert.strictEqual(efpStatusTextKey("Processing"), "marketEfpStatus_processing");
  assert.strictEqual(efpStatusTextKey("x"), "marketEfpStatus_unknown");
});

QUnit.module("MarketEfpHelpers - regras");

QUnit.test("lado padrão da bolsa: compra de contrato vende, venda de contrato compra", function (assert) {
  assert.strictEqual(defaultFuturesSide("purchase"), "sell");
  assert.strictEqual(defaultFuturesSide("Purchase"), "sell");
  assert.strictEqual(defaultFuturesSide("sales"), "buy");
  assert.strictEqual(defaultFuturesSide("Sales"), "buy");
});

QUnit.test("câmbio: exigido (US$ × R$), desligado (mesma moeda), recusado (R$ × US$)", function (assert) {
  assert.strictEqual(fxMode("UsCentsPerBushel", "BRL"), "required");
  assert.strictEqual(fxMode("UsdPerTon", "brl"), "required");
  assert.strictEqual(fxMode("UsCentsPerBushel", "USD"), "none");
  assert.strictEqual(fxMode("BrlPerBag", "BRL"), "none");
  assert.strictEqual(fxMode("BrlPerBag", "USD"), "refused");
  assert.strictEqual(fxMode("", "BRL"), "none", "sem instrumento ainda não há regra");
  assert.strictEqual(fxMode("UsdPerTon", ""), "none", "sem contrato ainda não há regra");
});

QUnit.test("volume acima do saldo a fixar (kg), com tolerância mínima", function (assert) {
  assert.strictEqual(exceedsAvailable(1000, 60000), false);
  assert.strictEqual(exceedsAvailable(1000.01, 60000), true);
  assert.strictEqual(exceedsAvailable(1000, "60000.000"), false, "decimal em texto");
  assert.strictEqual(exceedsAvailable(1000, null), false, "sem saldo conhecido não bloqueia");
});

QUnit.test("divergência de toneladas só avisa acima de 5 %", function (assert) {
  assert.strictEqual(tonsMismatch(54, 54), false);
  assert.strictEqual(tonsMismatch(56.7, 54), false, "exatamente 5 % não avisa");
  assert.strictEqual(tonsMismatch(57, 54), true);
  assert.strictEqual(tonsMismatch(-50, 54), true, "o sinal da bolsa não conta");
  assert.strictEqual(tonsMismatch(54, 0), false);
  assert.strictEqual(tonsMismatch(null, 54), false);
});

QUnit.test("ações: retomar só Processando, estornar Ativo ou Processando, sempre atrás da permissão", function (assert) {
  assert.deepEqual(efpActions({ Status: "Processing", ContractKey: "k" }, true), { canResume: true, canCancel: true, hasContract: true });
  assert.deepEqual(efpActions({ Status: "Active", ContractKey: "k" }, true), { canResume: false, canCancel: true, hasContract: true });
  assert.deepEqual(efpActions({ Status: "Canceled", ContractKey: "k" }, true), { canResume: false, canCancel: false, hasContract: true });
  assert.deepEqual(efpActions({ Status: "Processing", ContractKey: "k" }, false), { canResume: false, canCancel: false, hasContract: true });
  assert.deepEqual(efpActions(undefined, true), { canResume: false, canCancel: false, hasContract: false });
});

QUnit.test("rota do detalhe do contrato conforme o lado", function (assert) {
  assert.strictEqual(contractRouteName("Purchase"), "purchaseContractsDetail");
  assert.strictEqual(contractRouteName("sales"), "salesContractsDetail");
});

QUnit.module("MarketEfpHelpers - formulário");

const form = (over: Partial<EfpForm> = {}): EfpForm => ({
  date: "2026-11-06", contractSide: "purchase", contractKey: "abc", accountId: "3", instrumentCode: "ZS", side: "sell", lots: "10",
  price: "1180,5", premium: "", fxRate: "5,40", bags: "1.000,5", financialDueDate: "2026-12-15", notes: " ", ...over,
});
const usdOnBrl = { quoteUnit: "UsCentsPerBushel", contractCurrency: "BRL", availableToPriceKg: 100000 };

QUnit.test("formulário válido: kg = sacas × 60, prêmio vazio = 0, câmbio segue quando exigido", function (assert) {
  const { payload, errors } = buildEfpPayload(form(), usdOnBrl);
  assert.deepEqual(errors, {});
  assert.strictEqual(payload.volumeKg, 60030);
  assert.strictEqual(payload.premium, 0);
  assert.strictEqual(payload.fxRate, 5.4);
  assert.strictEqual(payload.price, 1180.5);
  assert.strictEqual(payload.lots, 10);
  assert.strictEqual(payload.accountId, 3);
  assert.strictEqual(payload.contractKey, "abc");
  assert.strictEqual(payload.notes, null);
  assert.strictEqual(payload.date, "2026-11-06");
});

QUnit.test("câmbio vai nulo quando a regra o desliga, mesmo que o campo tenha sobrado texto", function (assert) {
  const usdOnUsd = { quoteUnit: "UsCentsPerBushel", contractCurrency: "USD", availableToPriceKg: 100000 };
  assert.strictEqual(buildEfpPayload(form({ fxRate: "5,40" }), usdOnUsd).payload.fxRate, null);
  const brlOnBrl = { quoteUnit: "BrlPerBag", contractCurrency: "BRL", availableToPriceKg: 100000 };
  assert.strictEqual(buildEfpPayload(form({ fxRate: "" }), brlOnBrl).payload.fxRate, null);
});

QUnit.test("câmbio obrigatório quando instrumento em US$ e contrato em R$", function (assert) {
  assert.strictEqual(buildEfpPayload(form({ fxRate: "" }), usdOnBrl).errors.fxRate, "marketEfpFxRequired");
  assert.strictEqual(buildEfpPayload(form({ fxRate: "5.400" }), usdOnBrl).errors.fxRate, "marketNumberAmbiguous");
});

QUnit.test("instrumento em R$ com contrato em US$ é recusado", function (assert) {
  const refused = { quoteUnit: "BrlPerBag", contractCurrency: "USD", availableToPriceKg: 100000 };
  const result = buildEfpPayload(form(), refused);
  assert.strictEqual(result.errors.instrumentCode, "marketEfpFxRefused");
  assert.strictEqual(result.payload, undefined);
});

QUnit.test("recusa volume ambíguo, zero, acima do saldo e campos vazios", function (assert) {
  assert.strictEqual(buildEfpPayload(form({ bags: "1.500" }), usdOnBrl).errors.bags, "marketNumberAmbiguous");
  assert.strictEqual(buildEfpPayload(form({ bags: "0" }), usdOnBrl).errors.bags, "marketEfpBagsInvalid");
  assert.strictEqual(buildEfpPayload(form({ bags: "" }), usdOnBrl).errors.bags, "marketEfpBagsInvalid");
  assert.strictEqual(buildEfpPayload(form({ bags: "2000" }), usdOnBrl).errors.bags, "marketEfpBagsExceed", "120000 kg > 100000 kg");
  assert.strictEqual(buildEfpPayload(form({ contractKey: "" }), usdOnBrl).errors.contractKey, "marketEfpContractRequired");
  assert.strictEqual(buildEfpPayload(form({ financialDueDate: "" }), usdOnBrl).errors.financialDueDate, "marketEfpDueDateRequired");
  assert.strictEqual(buildEfpPayload(form({ lots: "2,5" }), usdOnBrl).errors.lots, "marketFuturesLotsInvalid");
  assert.strictEqual(buildEfpPayload(form({ price: "0" }), usdOnBrl).errors.price, "marketFuturesPriceInvalid");
  assert.strictEqual(buildEfpPayload(form({ premium: "abc" }), usdOnBrl).errors.premium, "marketInvalidNumber");
  assert.strictEqual(buildEfpPayload(form({ accountId: "" }), usdOnBrl).errors.accountId, "marketRequiredField");
  assert.strictEqual(buildEfpPayload(form({ instrumentCode: "" }), usdOnBrl).errors.instrumentCode, "marketRequiredField");
});

QUnit.test("prêmio negativo é aceito", function (assert) {
  assert.strictEqual(buildEfpPayload(form({ premium: "-0,75" }), usdOnBrl).payload.premium, -0.75);
});

QUnit.module("MarketEfpHelpers - resultado calculado");

QUnit.test("todo campo de entrada invalida o resultado; campos de tela não", function (assert) {
  for (const field of ["date", "contractSide", "contractKey", "accountId", "instrumentCode", "side", "lots", "price", "premium", "fxRate", "bags", "financialDueDate", "notes"]) {
    assert.strictEqual(invalidatesPreview(`/${field}`), true, field);
    assert.strictEqual(invalidatesPreview(field), true, `${field} sem barra`);
  }
  for (const field of ["previewVisible", "previewPerBag", "mismatch", "bagsInfo", "lotsInfo", "fxEnabled", "fxRefused", "availableText", "accounts"]) {
    assert.strictEqual(invalidatesPreview(`/${field}`), false, field);
  }
  assert.strictEqual(invalidatesPreview(undefined), false);
});

QUnit.test("assinatura muda com qualquer entrada e ignora o que é só da tela", function (assert) {
  const base = form();
  const sign = efpInputSignature(base);
  assert.strictEqual(efpInputSignature({ ...base }), sign);
  assert.strictEqual(efpInputSignature({ ...base, previewVisible: true } as Partial<EfpForm>), sign);
  for (const change of [{ price: "1181" }, { premium: "1" }, { lots: "11" }, { fxRate: "5,5" }, { side: "buy" }, { accountId: "9" },
    { financialDueDate: "2027-01-01" }, { date: "2026-11-07" }, { contractSide: "sales" }, { bags: "10" }]) {
    assert.notStrictEqual(efpInputSignature({ ...base, ...change }), sign, JSON.stringify(change));
  }
});

QUnit.test("moeda do contrato em minúsculas (convenção do REST) é reconhecida", function (assert) {
  assert.strictEqual(normalizeCurrency("brl"), "brl");
  assert.strictEqual(fxMode("UsCentsPerBushel", "brl"), "required");
  assert.strictEqual(fxMode("BrlPerBag", "usd"), "refused");
});
