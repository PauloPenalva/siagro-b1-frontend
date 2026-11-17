import {
  canLink, commonCustomer, exceedsAvailable, hasMixedCustomers, matchesAvailable, normalizeLinkedDocuments, releasesForInvoices,
  selectionSummaryText, sumQuantity,
  defaultLinkPeriod, filterReleasesByCustomer, formatDateText, formatLocalDate, isStaleRequest, normalizeLinkableInvoices,
  preselectedReleaseIndex, shouldKeepRelease, withReleaseDisplay,
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

QUnit.test("normalizeLinkableInvoices monta textos e chave de ordenação da data", function (assert) {
  const [row] = normalizeLinkableInvoices([{ DocDate: "2026-11-10T00:00:00Z", CardCode: "C1", CardName: "Cli", TaxDocumentNumber: "12", TaxDocumentSeries: "1" }]);
  assert.strictEqual(row.DocDateSort, "2026-11-10");
  assert.strictEqual(row.InvoiceText, "12 / 1");
  assert.strictEqual(row.CustomerText, "(C1) Cli");
});

QUnit.test("sumQuantity, cliente comum e clientes misturados", function (assert) {
  const same = [{ Quantity: 30000.25, CardCode: "C1" }, { Quantity: 1000.5, CardCode: "C1" }];
  const mixed = [{ Quantity: 1, CardCode: "C1" }, { Quantity: 2, CardCode: "C2" }];
  assert.strictEqual(sumQuantity(same), 31000.75);
  assert.strictEqual(sumQuantity([]), 0);
  assert.strictEqual(commonCustomer(same), "C1");
  assert.strictEqual(commonCustomer(mixed), "");
  assert.strictEqual(commonCustomer([]), "");
  assert.strictEqual(hasMixedCustomers(mixed), true);
  assert.strictEqual(hasMixedCustomers(same), false);
});

QUnit.test("matchesAvailable usa tolerância de 0,001", function (assert) {
  assert.strictEqual(matchesAvailable(1000.001, 1000), true);
  assert.strictEqual(matchesAvailable(999.999, 1000), true);
  assert.strictEqual(matchesAvailable(1000.002, 1000), false);
  // Soma de ponto flutuante (0,1 + 0,2) não pode reprovar.
  assert.strictEqual(matchesAvailable(sumQuantity([{ Quantity: 0.1 }, { Quantity: 0.2 }]), 0.3), true);
});

QUnit.test("canLink exige NF, mesmo cliente, soma igual ao saldo e liberação", function (assert) {
  const ok = [{ Quantity: 600, CardCode: "C1" }, { Quantity: 400, CardCode: "C1" }];
  assert.strictEqual(canLink(ok, 1000, true), true);
  assert.strictEqual(canLink(ok, 1000, false), false);
  assert.strictEqual(canLink(ok, 1200, true), false);
  assert.strictEqual(canLink([], 0, true), false);
  assert.strictEqual(canLink([{ Quantity: 600, CardCode: "C1" }, { Quantity: 400, CardCode: "C2" }], 1000, true), false);
});

QUnit.test("canLink: soma menor ou maior que o saldo não habilita", function (assert) {
  assert.strictEqual(canLink([{ Quantity: 600, CardCode: "C1" }], 1000, true), false);
  assert.strictEqual(canLink([{ Quantity: 1200, CardCode: "C1" }], 1000, true), false);
  assert.strictEqual(canLink([{ Quantity: 1000.001, CardCode: "C1" }], 1000, true), true);
});

QUnit.test("exceedsAvailable respeita a tolerância", function (assert) {
  assert.strictEqual(exceedsAvailable(1000.001, 1000), false);
  assert.strictEqual(exceedsAvailable(1000.002, 1000), true);
  assert.strictEqual(exceedsAvailable(500, 1000), false);
});

QUnit.test("releasesForInvoices filtra pelo cliente comum", function (assert) {
  const releases = [{ CardCode: "C1" }, { CardCode: "C2" }];
  assert.strictEqual(releasesForInvoices(releases, [{ CardCode: "C2" }, { CardCode: "C2" }]).length, 1);
  assert.deepEqual(releasesForInvoices(releases, [{ CardCode: "C1" }, { CardCode: "C2" }]), []);
  assert.deepEqual(releasesForInvoices(releases, []), []);
});

QUnit.test("selectionSummaryText em pt-BR com 3 casas", function (assert) {
  assert.strictEqual(selectionSummaryText(31000.75, 32000), "Selecionado: 31.000,750 kg de 32.000,000 kg");
});

QUnit.test("normalizeLinkedDocuments aceita camelCase e PascalCase", function (assert) {
  assert.deepEqual(normalizeLinkedDocuments({ documents: [{ key: "a", invoiceNumber: "1" }, { key: "b", invoiceNumber: "2" }] }),
    [{ key: "a", invoiceNumber: "1" }, { key: "b", invoiceNumber: "2" }]);
  assert.deepEqual(normalizeLinkedDocuments({ Documents: [{ Key: "a", InvoiceNumber: "1" }] }), [{ key: "a", invoiceNumber: "1" }]);
  assert.deepEqual(normalizeLinkedDocuments(undefined), []);
});

QUnit.test("shouldKeepRelease: mantém só quando o cliente comum não mudou e a seleção não está vazia nem mista", function (assert) {
  const c1 = { CardCode: "C1" };
  assert.strictEqual(shouldKeepRelease("C1", [c1, c1]), true, "mesmo cliente");
  assert.strictEqual(shouldKeepRelease("C1", [{ CardCode: "C2" }]), false, "cliente trocado");
  assert.strictEqual(shouldKeepRelease("C1", []), false, "seleção vazia");
  assert.strictEqual(shouldKeepRelease("C1", [c1, { CardCode: "C2" }]), false, "seleção mista");
  assert.strictEqual(shouldKeepRelease("", [c1]), false, "nada filtrado antes");
});

QUnit.test("withReleaseDisplay: texto do cliente e preço exibido (comercial, senão o preço)", function (assert) {
  const withCommercial = withReleaseDisplay({ CardCode: "C1", CardName: "ACME", CommercialPrice: 120, Price: "2" });
  assert.strictEqual(withCommercial.CustomerText, "(C1) ACME");
  assert.strictEqual(withCommercial.DisplayPrice, 120);
  assert.strictEqual(withReleaseDisplay({ Price: "2.5" }).DisplayPrice, 2.5);
  assert.strictEqual(withReleaseDisplay({}).DisplayPrice, undefined);
});
