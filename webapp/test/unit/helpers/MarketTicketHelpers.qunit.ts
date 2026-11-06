import {
  buildTicketsFilter, cityLabel, deviationState, formatDeviation, formatLocalDateTime, formatSacks, formatTons,
  kgToSacks, normalizeTicketStatus, parseTicketSteps, ticketStatusIcon, ticketStatusState, ticketStatusTextKey,
  ticketTotalValue, toPascalKeys
} from "siagrob1/helpers/MarketTicketHelpers";

QUnit.module("MarketTicketHelpers - situação");

QUnit.test("aceita PascalCase (OData) e camelCase (REST)", function (assert) {
  assert.strictEqual(normalizeTicketStatus("PendingBoard"), "pendingBoard");
  assert.strictEqual(normalizeTicketStatus("approved"), "approved");
  assert.strictEqual(ticketStatusTextKey("PendingBoard"), "marketTicketStatus_pendingBoard");
  assert.strictEqual(ticketStatusTextKey("Whatever"), "marketTicketStatus_unknown");
});

QUnit.test("cor e ícone por situação", function (assert) {
  assert.strictEqual(ticketStatusState("Pending"), "Warning");
  assert.strictEqual(ticketStatusState("PendingBoard"), "Warning");
  assert.strictEqual(ticketStatusState("Approved"), "Success");
  assert.strictEqual(ticketStatusState("Rejected"), "Error");
  assert.strictEqual(ticketStatusState("Canceled"), "None");
  assert.notStrictEqual(ticketStatusIcon("Pending"), ticketStatusIcon("PendingBoard"), "ícones distintos");
});

QUnit.module("MarketTicketHelpers - valores");

QUnit.test("quilos viram sacas e toneladas; decimal em texto também", function (assert) {
  assert.strictEqual(kgToSacks(60000), 1000);
  assert.strictEqual(kgToSacks("30000.000"), 500);
  assert.strictEqual(kgToSacks(null), null);
  assert.strictEqual(formatSacks(null), "–");
  assert.strictEqual(formatSacks(60000), "1.000");
  assert.strictEqual(formatTons(60000), "60");
});

QUnit.test("valor total = sacas x preço negociado, em centavos", function (assert) {
  assert.strictEqual(ticketTotalValue(60000, 137.67), 137670);
  assert.strictEqual(ticketTotalValue(1000, 100.005), 100.01, "arredonda ao centavo");
  assert.strictEqual(ticketTotalValue(null, 10), null);
});

QUnit.test("desvio: sinal, 2 casas e cor", function (assert) {
  assert.strictEqual(formatDeviation(1.5), "+1,50%");
  assert.strictEqual(formatDeviation(-0.256), "-0,26%");
  assert.strictEqual(formatDeviation(0), "0,00%");
  assert.strictEqual(formatDeviation(undefined), "–");
  assert.strictEqual(deviationState(-2), "Success");
  assert.strictEqual(deviationState(2), "Error");
  assert.strictEqual(deviationState(0), "None");
});

QUnit.test("cidade com UF", function (assert) {
  assert.strictEqual(cityLabel("Sorriso", "MT"), "Sorriso - MT");
  assert.strictEqual(cityLabel("Sorriso", undefined), "Sorriso");
  assert.strictEqual(cityLabel(undefined, "MT"), "–");
});

QUnit.module("MarketTicketHelpers - instantes e passos");

QUnit.test("instante UTC é exibido na hora local (com ou sem Z)", function (assert) {
  const date = new Date("2026-11-06T15:30:00Z");
  const p = (n: number) => String(n).padStart(2, "0");
  const expected = `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
  assert.strictEqual(formatLocalDateTime("2026-11-06T15:30:00Z"), expected);
  assert.strictEqual(formatLocalDateTime("2026-11-06T15:30:00"), expected, "sem fuso = UTC");
  assert.strictEqual(formatLocalDateTime(null), "–");
  assert.strictEqual(formatLocalDateTime("lixo"), "–");
});

QUnit.test("StepsJson inválido ou ausente vira lista vazia", function (assert) {
  assert.deepEqual(parseTicketSteps('[{"key":"price","value":137.67,"unit":"BRL/sc"}]'), [{ key: "price", value: 137.67, unit: "BRL/sc" }]);
  assert.deepEqual(parseTicketSteps(null), []);
  assert.deepEqual(parseTicketSteps("{"), []);
  assert.deepEqual(parseTicketSteps('{"a":1}'), []);
});

QUnit.module("MarketTicketHelpers - filtro da lista");

QUnit.test("sem filtro não há $filter", function (assert) {
  assert.strictEqual(buildTicketsFilter({}), undefined);
  assert.strictEqual(buildTicketsFilter({ Statuses: [] }), undefined);
});

QUnit.test("situação, safra e parceiro viram $filter cru com aspas escapadas", function (assert) {
  assert.strictEqual(
    buildTicketsFilter({ Statuses: ["Pending", "PendingBoard"], HarvestSeasonCode: "25/26", CardCode: "F'1" }),
    "(Status eq 'Pending' or Status eq 'PendingBoard') and HarvestSeasonCode eq '25/26' and CardCode eq 'F''1'");
});

QUnit.test("período: dia local, 'até' inclui o último dia", function (assert) {
  const result = buildTicketsFilter({ DateFrom: "2026-11-06", DateTo: "2026-11-06" });
  const from = new Date(2026, 10, 6).toISOString(), to = new Date(2026, 10, 7).toISOString();
  assert.strictEqual(result, `CreatedAt ge ${from} and CreatedAt lt ${to}`);
});

QUnit.module("MarketTicketHelpers - chaves do OData");

QUnit.test("normaliza para PascalCase, inclusive aninhado, e ignora anotações", function (assert) {
  assert.deepEqual(
    toPascalKeys({ "@odata.context": "x", id: 1, status: "pending", municipality: { name: "Sorriso" }, Already: 2 }),
    { Id: 1, Status: "pending", Municipality: { Name: "Sorriso" }, Already: 2 });
  assert.strictEqual(toPascalKeys(null), null);
});
