import { computeFlashes, clearRowFlashes, FLASH_DURATION_MS } from "siagrob1/helpers/MarketHelpers";
import {
  buildTicketPayload, canBuy, formatDeliveryRange, formatFx, formatIsoDate, formatMoney, loadPriceGridPreference,
  priceDeviationPercent, priceStatusState, priceStatusTextKey, sacksToTons, savePriceGridPreference, stepUnitKey,
  withPriceGridFlashes
} from "siagrob1/helpers/MarketPriceGridHelpers";
import { MarketPriceGridRow, MarketTicketForm } from "siagrob1/types/MarketPriceGrid";

type Row = { id: number; a: number; b: number; label: string };

QUnit.module("MarketHelpers - piscada genérica");

QUnit.test("compara pela chave configurada, só nos campos pedidos", function (assert) {
  const base = computeFlashes<Row, "a" | "b", number>(null, [{ id: 1, a: 1, b: 1, label: "x" }], (r) => r.id, ["a", "b"], 1, 0);
  assert.deepEqual(base[0].flash, { a: "", b: "" }, "linha de base não pisca");
  const next = computeFlashes<Row, "a" | "b", number>(base, [{ id: 1, a: 2, b: 0, label: "y" }], (r) => r.id, ["a", "b"], 2, 100);
  assert.strictEqual(next[0].flash.a, "up-b-2");
  assert.strictEqual(next[0].flash.b, "down-b-2");
  const kept = computeFlashes<Row, "a" | "b", number>(next, [{ id: 1, a: 2, b: 0, label: "y" }], (r) => r.id, ["a", "b"], 3, 100 + FLASH_DURATION_MS - 1);
  assert.strictEqual(kept[0].flash.a, "up-b-2", "descritor sobrevive ao próximo quadro durante 1 s");
  const gone = computeFlashes<Row, "a" | "b", number>(kept, [{ id: 1, a: 2, b: 0, label: "y" }], (r) => r.id, ["a", "b"], 4, 100 + FLASH_DURATION_MS);
  assert.strictEqual(gone[0].flash.a, "");
  assert.deepEqual(clearRowFlashes(next, ["a", "b"])[0].flash, { a: "", b: "" });
});

QUnit.module("MarketPriceGridHelpers - grade Ordem de Compra");

const row = (lineId: number, price: number, extra: Partial<MarketPriceGridRow> = {}): MarketPriceGridRow =>
  ({ lineId, price, portPrice: 150, exchangeQuote: 1188.25, netFx: 5.7267, status: "ok", ...extra } as MarketPriceGridRow);

QUnit.test("piscada por lineId nos quatro campos de preço", function (assert) {
  const base = withPriceGridFlashes(null, [row(1, 137.67), row(2, 112.15)], 1, 0);
  const next = withPriceGridFlashes(base, [row(2, 112.15), row(1, 136.5, { netFx: 5.8 })], 2, 10);
  const one = next.find((r) => r.lineId === 1);
  assert.strictEqual(one.flash.price, "down-b-2");
  assert.strictEqual(one.flash.netFx, "up-b-2");
  assert.strictEqual(one.flash.portPrice, "");
  assert.strictEqual(next.find((r) => r.lineId === 2).flash.price, "", "linha que mudou de posição não pisca");
});

QUnit.test("formatação pt-BR; sem preço vira travessão", function (assert) {
  assert.strictEqual(formatMoney(137.67), "137,67");
  assert.strictEqual(formatMoney(null), "–");
  assert.strictEqual(formatFx(5.7267), "5,7267");
  assert.strictEqual(formatIsoDate("2027-04-15"), "15/04/2027");
});

QUnit.test("entrega: mês cheio em MM/yyyy, datas quebradas curtas", function (assert) {
  assert.strictEqual(formatDeliveryRange("2027-03-01", "2027-04-30"), "03/2027–04/2027");
  assert.strictEqual(formatDeliveryRange("2027-02-01", "2027-02-28"), "02/2027");
  assert.strictEqual(formatDeliveryRange("2027-03-15", "2027-04-20"), "15/03/27–20/04/27");
  assert.strictEqual(formatDeliveryRange(null, "2027-04-20"), "–");
});

QUnit.test("situação e unidades", function (assert) {
  assert.strictEqual(priceStatusTextKey("missingFreight"), "marketPriceStatusMissingFreight");
  assert.strictEqual(priceStatusState("ok"), "None");
  assert.strictEqual(priceStatusState("missingQuote"), "Warning");
  assert.strictEqual(priceStatusState("invalidSetup"), "Error");
  assert.strictEqual(stepUnitKey("BRL/sc"), "marketStepUnitBrlPerBag");
  assert.strictEqual(stepUnitKey("xyz"), null);
  assert.strictEqual(canBuy(row(1, 10)), true);
  assert.strictEqual(canBuy(row(1, null, { status: "missingFx" })), false);
});

QUnit.test("desvio e toneladas", function (assert) {
  assert.strictEqual(priceDeviationPercent(110, 100).toFixed(2), "10.00");
  assert.strictEqual(priceDeviationPercent(110, null), null);
  assert.strictEqual(sacksToTons(1000), 60);
});

const form = (over: Partial<MarketTicketForm> = {}): MarketTicketForm => ({
  cardCode: "F001", cardName: "", sacks: "1000", negotiatedPrice: "137,67", warehouseCode: "A1", warehouseName: "",
  agentCode: "7", agentName: "", branchCode: "1", branchName: "", logisticRegionCode: "R1", logisticRegionName: "", notes: " ",
  ...over,
});

QUnit.test("boleta: volume em kg = sacas x 60, agente inteiro", function (assert) {
  const { payload } = buildTicketPayload(form(), 5, "5107925");
  assert.deepEqual(payload, {
    priceTableLineId: 5, municipalityCode: "5107925", cardCode: "F001", volumeKg: 60000, negotiatedPrice: 137.67,
    warehouseCode: "A1", agentCode: 7, branchCode: "1", logisticRegionCode: "R1", notes: null,
  });
});

QUnit.test("boleta: obrigatórios, ambíguo e não positivo", function (assert) {
  const result = buildTicketPayload(form({ cardCode: "", sacks: "1.500", negotiatedPrice: "0" }), 5, "X");
  assert.strictEqual(result.payload, undefined);
  assert.strictEqual(result.errors.cardCode, "required");
  assert.strictEqual(result.errors.sacks, "ambiguous");
  assert.strictEqual(result.errors.negotiatedPrice, "positive");
});

QUnit.test("preferência: lembra por usuário e sobrevive a storage quebrado", function (assert) {
  const data: Record<string, string> = {};
  const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } } as Storage;
  savePriceGridPreference(storage, "Ana", { harvest: "2627", city: "5107925" });
  assert.deepEqual(loadPriceGridPreference(storage, "ana"), { harvest: "2627", city: "5107925" });
  assert.deepEqual(loadPriceGridPreference(storage, "bob"), {});
  const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } } as unknown as Storage;
  savePriceGridPreference(broken, "ana", {});
  assert.deepEqual(loadPriceGridPreference(broken, "ana"), {});
  assert.deepEqual(loadPriceGridPreference(null, "ana"), {});
});
