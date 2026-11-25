import {
  canLink, formatMoney, normalizeLinkPreview, releasesForLoad, normalizeLinkedDocuments,
  defaultLinkPeriod, formatDateText, formatLocalDate, isStaleRequest, normalizeLinkableInvoices,
  preselectedReleaseIndex, withReleaseDisplay, canUnlinkSapInvoices, linkTypeText, divergenceStatusText,
  divergenceConfirmationText,
} from "siagrob1/helpers/SapInvoiceLinkHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";

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
    TaxDocumentSeries: "001", Quantity: 1500.5, UnitPrice: 2, LineTotal: 3001,
  }]);
  const camel = normalizeLinkableInvoices({ value: [{ docEntry: 7, cardCode: "C1", quantity: "1500.5" }] });

  assert.strictEqual(pascal[0].DocEntry, 7);
  assert.strictEqual(pascal[0].DocDateText, "10/11/2026");
  assert.strictEqual(camel[0].DocEntry, 7);
  assert.strictEqual(camel[0].CardCode, "C1");
  assert.strictEqual(camel[0].Quantity, 1500.5);
});

QUnit.test("normalizeLinkableInvoices: resposta ausente vira lista vazia", function (assert) {
  assert.deepEqual(normalizeLinkableInvoices(undefined), []);
});

QUnit.test("preselectedReleaseIndex só escolhe quando há exatamente uma liberação", function (assert) {
  assert.strictEqual(preselectedReleaseIndex([{ k: 1 }]), 0);
  assert.strictEqual(preselectedReleaseIndex([{ k: 1 }, { k: 2 }]), -1);
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

QUnit.test("normalizeLinkedDocuments aceita camelCase e PascalCase", function (assert) {
  assert.deepEqual(normalizeLinkedDocuments({ documents: [{ key: "a", invoiceNumber: "1" }, { key: "b", invoiceNumber: "2" }] }),
    [{ key: "a", invoiceNumber: "1" }, { key: "b", invoiceNumber: "2" }]);
  assert.deepEqual(normalizeLinkedDocuments({ Documents: [{ Key: "a", InvoiceNumber: "1" }] }), [{ key: "a", invoiceNumber: "1" }]);
  assert.deepEqual(normalizeLinkedDocuments(undefined), []);
});

QUnit.test("withReleaseDisplay: texto do cliente e preço exibido (comercial, senão o preço)", function (assert) {
  const withCommercial = withReleaseDisplay({ CardCode: "C1", CardName: "ACME", CommercialPrice: 120, Price: "2" });
  assert.strictEqual(withCommercial.CustomerText, "(C1) ACME");
  assert.strictEqual(withCommercial.DisplayPrice, 120);
  assert.strictEqual(withReleaseDisplay({ Price: "2.5" }).DisplayPrice, 2.5);
  assert.strictEqual(withReleaseDisplay({}).DisplayPrice, undefined);
});

QUnit.test("releasesForLoad mostra só as do cliente da carga por padrão", function (assert) {
  const releases = [{ CardCode: "C1", k: 1 }, { CardCode: "C2", k: 2 }, { CardCode: "C3", k: 3 }];
  assert.deepEqual(releasesForLoad(releases, "C2", false), [{ CardCode: "C2", k: 2, OtherCustomer: false }]);
  assert.strictEqual(releasesForLoad(releases, " C2 ", false).length, 1, "o código da carga é aparado");
});

QUnit.test("releasesForLoad com showOthers traz todas, as do cliente primeiro, marcadas", function (assert) {
  const releases = [{ CardCode: "C1" }, { CardCode: "C2" }, { CardCode: "C1" }];
  assert.deepEqual(releasesForLoad(releases, "C2", true), [
    { CardCode: "C2", OtherCustomer: false }, { CardCode: "C1", OtherCustomer: true }, { CardCode: "C1", OtherCustomer: true },
  ]);
});

QUnit.test("releasesForLoad sem cliente na carga devolve vazio", function (assert) {
  assert.deepEqual(releasesForLoad([{ CardCode: "C1" }], "", true), []);
  assert.deepEqual(releasesForLoad([{ CardCode: "C1" }], undefined, false), []);
});

QUnit.test("canLink exige NF e liberação e não olha o saldo", function (assert) {
  assert.strictEqual(canLink([{ Quantity: 600 }, { Quantity: 100 }], true), true, "soma diferente do saldo");
  assert.strictEqual(canLink([{ Quantity: 600 }], false), false);
  assert.strictEqual(canLink([], true), false);
});

QUnit.test("normalizeLinkPreview converte Edm.Decimal em número e mantém nulos", function (assert) {
  const preview = normalizeLinkPreview({
    LinkType: 2, Message: "Deseja finalizar o faturamento?", EffectiveQuantity: "30000.000", InvoiceQuantity: "29000.5",
    QuantityDifference: "-999.5", EffectiveValue: null, InvoiceValue: "59600.00", ValueDifference: null,
  });
  assert.strictEqual(preview.LinkType, 2);
  assert.strictEqual(preview.Message, "Deseja finalizar o faturamento?");
  assert.strictEqual(preview.EffectiveQuantity, 30000);
  assert.strictEqual(preview.QuantityDifference, -999.5);
  assert.strictEqual(preview.EffectiveValue, null);
  assert.strictEqual(preview.InvoiceValue, 59600);
  assert.strictEqual(preview.ValueDifference, null);
  assert.strictEqual(normalizeLinkPreview({ linkType: 0, invoiceQuantity: 5 }).InvoiceQuantity, 5, "camelCase");
});

QUnit.test("normalizeLinkPreview recusa resposta sem LinkType", function (assert) {
  assert.strictEqual(normalizeLinkPreview({ Message: "x" }), undefined);
  assert.strictEqual(normalizeLinkPreview(undefined), undefined);
  assert.strictEqual(normalizeLinkPreview({ LinkType: "" }), undefined, "LinkType vazio");
  assert.strictEqual(normalizeLinkPreview({ LinkType: "abc" }), undefined, "LinkType não numérico");
});

QUnit.test("formatMoney formata em pt-BR e mostra travessão no nulo", function (assert) {
  assert.strictEqual(formatMoney(59600), "R$ 59.600,00");
  assert.strictEqual(formatMoney(-1234.5), "R$ -1.234,50");
  assert.strictEqual(formatMoney(null), "—");
  assert.strictEqual(formatMoney(NaN), "—");
});

QUnit.test("canUnlinkSapInvoices só em SAP e com carga faturada", function (assert) {
  assert.strictEqual(canUnlinkSapInvoices("Invoiced", true), true);
  assert.strictEqual(canUnlinkSapInvoices("PartiallyInvoiced", true), true);
  assert.strictEqual(canUnlinkSapInvoices("Discharged", true), false);
  assert.strictEqual(canUnlinkSapInvoices("Invoiced", false), false);
});

QUnit.test("linkTypeText aceita número e nome do enum", function (assert) {
  assert.strictEqual(linkTypeText(0), "Normal");
  assert.strictEqual(linkTypeText(1), "Valor divergente");
  assert.strictEqual(linkTypeText(2), "Quantidade e valor divergentes");
  assert.strictEqual(linkTypeText("Normal"), "Normal");
  assert.strictEqual(linkTypeText("ValueDivergent"), "Valor divergente");
  assert.strictEqual(linkTypeText("QuantityAndValueDivergent"), "Quantidade e valor divergentes");
});

QUnit.test("divergenceStatusText traduz as duas situações", function (assert) {
  assert.strictEqual(divergenceStatusText("Open"), "Aberta");
  assert.strictEqual(divergenceStatusText("Voided"), "Anulada");
});

QUnit.test("divergenceConfirmationText usa a mensagem do servidor e cai no texto fixo do tipo", function (assert) {
  assert.strictEqual(divergenceConfirmationText({ LinkType: 1, Message: "Texto do servidor" }), "Texto do servidor");
  assert.strictEqual(divergenceConfirmationText({ LinkType: 1, Message: null }),
    "Valor(es) da(s) NF(s) diferente(s) do contrato, deseja finalizar o faturamento?");
  assert.strictEqual(divergenceConfirmationText({ LinkType: 2, Message: "  " }),
    "Valor(es) e qtde(s) da(s) NF(s) diferente(s) do contrato, deseja finalizar o faturamento?");
});

QUnit.test("rota da prévia leva todas as NFs separadas por vírgula, entre aspas", function (assert) {
  assert.strictEqual(
    ServerRoutes.shipmentLoadsSapLinkPreview("k1", "r1", [9172, 9171]),
    "/odata/ShipmentLoadsGetSapLinkPreview(Key=k1,SalesShipmentReleaseKey=r1,SapDocEntries='9172,9171')");
});
