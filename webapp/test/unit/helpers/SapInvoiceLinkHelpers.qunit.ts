import {
  defaultLinkPeriod, filterReleasesByCustomer, formatDateText, formatLocalDate, isStaleRequest, normalizeLinkableInvoices,
  preselectedReleaseIndex,
} from "siagrob1/helpers/SapInvoiceLinkHelpers";

QUnit.module("SapInvoiceLinkHelpers - vínculo de NF do SAP (GAC-1226)");

QUnit.test("formatLocalDate usa as partes locais, com zero à esquerda", function (assert) {
  // 23:30 local: toISOString() poderia já estar no dia seguinte (UTC).
  assert.strictEqual(formatLocalDate(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  assert.strictEqual(formatLocalDate(new Date(2026, 10, 16, 0, 5)), "2026-11-16");
});

QUnit.test("defaultLinkPeriod vai de hoje - 15 dias até hoje, atravessando mês e ano", function (assert) {
  assert.deepEqual(defaultLinkPeriod(new Date(2026, 10, 16, 22, 0)), { DateFrom: "2026-11-01", DateTo: "2026-11-16" });
  assert.deepEqual(defaultLinkPeriod(new Date(2026, 0, 10)), { DateFrom: "2025-12-26", DateTo: "2026-01-10" });
});

QUnit.test("formatDateText não passa por Date", function (assert) {
  assert.strictEqual(formatDateText("2026-11-10"), "10/11/2026");
  assert.strictEqual(formatDateText("2026-11-10T00:00:00Z"), "10/11/2026");
  assert.strictEqual(formatDateText(undefined), "");
});

QUnit.test("normalizeLinkableInvoices aceita PascalCase e camelCase", function (assert) {
  const pascal = normalizeLinkableInvoices([{
    DocEntry: 7, DocNum: 70, DocDate: "2026-11-10", CardCode: "C1", CardName: "Cli", TaxDocumentNumber: "000000123",
    TaxDocumentSeries: "001", Quantity: 1500.5, UnitPrice: 2, LineTotal: 3001, CarrierMismatch: true,
  }]);
  const camel = normalizeLinkableInvoices({ value: [{ docEntry: 7, cardCode: "C1", carrierMismatch: true, quantity: "1500.5" }] });

  assert.strictEqual(pascal[0].DocEntry, 7);
  assert.strictEqual(pascal[0].DocDateText, "10/11/2026");
  assert.strictEqual(pascal[0].CarrierMismatch, true);
  assert.strictEqual(camel[0].DocEntry, 7);
  assert.strictEqual(camel[0].CardCode, "C1");
  assert.strictEqual(camel[0].Quantity, 1500.5);
  assert.strictEqual(camel[0].CarrierMismatch, true);
});

QUnit.test("normalizeLinkableInvoices: resposta ausente vira lista vazia e mismatch não booleano é falso", function (assert) {
  assert.deepEqual(normalizeLinkableInvoices(undefined), []);
  assert.strictEqual(normalizeLinkableInvoices([{ DocEntry: 1, CarrierMismatch: "true" }])[0].CarrierMismatch, false);
});

QUnit.test("filterReleasesByCustomer e pré-seleção", function (assert) {
  const releases = [{ CardCode: "C1", k: 1 }, { CardCode: "C2", k: 2 }, { CardCode: "C1", k: 3 }];

  assert.strictEqual(filterReleasesByCustomer(releases, "C1").length, 2);
  assert.deepEqual(filterReleasesByCustomer(releases, "C9"), []);
  assert.deepEqual(filterReleasesByCustomer(releases, ""), []);

  assert.strictEqual(preselectedReleaseIndex(filterReleasesByCustomer(releases, "C2")), 0);
  assert.strictEqual(preselectedReleaseIndex(filterReleasesByCustomer(releases, "C1")), -1);
  assert.strictEqual(preselectedReleaseIndex([]), -1);
});

QUnit.test("isStaleRequest: só é velha quando o token mudou", function (assert) {
  assert.strictEqual(isStaleRequest(3, 3), false);
  assert.strictEqual(isStaleRequest(3, 4), true);
});
