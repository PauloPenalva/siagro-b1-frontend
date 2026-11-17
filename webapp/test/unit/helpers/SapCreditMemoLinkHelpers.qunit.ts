import {
  canLinkCreditMemo, defaultReturnLinkPeriod, isAwaitingSapReturnInvoice, isSapReturnInvoiceLinked, normalizeLinkableCreditMemos,
  returnDocumentSummary, sapDocNumText,
} from "siagrob1/helpers/SapCreditMemoLinkHelpers";

QUnit.module("SapCreditMemoLinkHelpers - vínculo da NF de devolução do SAP (GAC-1226)");

const AWAITING = { InvoiceType: "Return", InvoiceStatus: "Confirmed", SapCreditMemoDocEntry: null as number, TaxDocumentNumber: null as string };

QUnit.test("normalizeLinkableCreditMemos aceita array, envelope { value } e as duas capitalizações", function (assert) {
  const pascal = normalizeLinkableCreditMemos([{
    DocEntry: 7, DocNum: 2007, DocDate: "2026-11-12T00:00:00Z", CardCode: "C1", CardName: "Cli", TaxDocumentNumber: "000004512",
    TaxDocumentSeries: "001", Quantity: 30000, UnitPrice: 2.5, LineTotal: 75000, Cfop: "1201", UsageCode: 71,
    UsageName: "DEVOLUCAO", MatchesOrigin: true, QuantityMatches: true,
  }]);
  const camel = normalizeLinkableCreditMemos({ value: [{ docEntry: 8, quantity: "29500", quantityMatches: false, usageCode: 71 }] });

  assert.strictEqual(pascal[0].DocEntry, 7);
  assert.strictEqual(pascal[0].DocDateText, "12/11/2026");
  assert.strictEqual(pascal[0].DocDateSort, "2026-11-12");
  assert.strictEqual(pascal[0].InvoiceText, "000004512 / 001");
  assert.strictEqual(pascal[0].CustomerText, "(C1) Cli");
  assert.strictEqual(pascal[0].UsageText, "(71) DEVOLUCAO");
  assert.strictEqual(pascal[0].MatchesOrigin, true);
  assert.strictEqual(pascal[0].QuantityMatches, true);
  assert.strictEqual(camel[0].DocEntry, 8);
  assert.strictEqual(camel[0].Quantity, 29500);
  assert.strictEqual(camel[0].QuantityMatches, false);
  assert.strictEqual(camel[0].MatchesOrigin, false);
  assert.strictEqual(camel[0].UsageText, "71");
  assert.deepEqual(normalizeLinkableCreditMemos(undefined), []);
  assert.deepEqual(normalizeLinkableCreditMemos({}), []);
});

QUnit.test("isAwaitingSapReturnInvoice: devolução confirmada sem nota, só em modo SAP", function (assert) {
  assert.strictEqual(isAwaitingSapReturnInvoice(AWAITING, true), true);
  assert.strictEqual(isAwaitingSapReturnInvoice({ ...AWAITING, TaxDocumentNumber: "" }, true), true, "número vazio também aguarda");
  assert.strictEqual(isAwaitingSapReturnInvoice(AWAITING, false), false, "STANDALONE nunca aguarda");
  assert.strictEqual(isAwaitingSapReturnInvoice({ ...AWAITING, InvoiceType: "Normal" }, true), false);
  assert.strictEqual(isAwaitingSapReturnInvoice({ ...AWAITING, InvoiceStatus: "Pending" }, true), false);
  assert.strictEqual(isAwaitingSapReturnInvoice({ ...AWAITING, InvoiceStatus: "Cancelled" }, true), false);
  assert.strictEqual(isAwaitingSapReturnInvoice({ ...AWAITING, SapCreditMemoDocEntry: 9 }, true), false, "já vinculada");
  assert.strictEqual(isAwaitingSapReturnInvoice({ ...AWAITING, TaxDocumentNumber: "123" }, true), false, "número digitado");
  assert.strictEqual(isAwaitingSapReturnInvoice({ ...AWAITING, WithoutTaxDocument: true }, true), false, "operação sem nota");
  assert.strictEqual(isAwaitingSapReturnInvoice(undefined, true), false);
});

QUnit.test("isSapReturnInvoiceLinked: só a devolução confirmada com Credit Memo, em modo SAP", function (assert) {
  const linked = { ...AWAITING, SapCreditMemoDocEntry: 9, TaxDocumentNumber: "000004512" };

  assert.strictEqual(isSapReturnInvoiceLinked(linked, true), true);
  assert.strictEqual(isSapReturnInvoiceLinked(linked, false), false);
  assert.strictEqual(isSapReturnInvoiceLinked(AWAITING, true), false);
  assert.strictEqual(isSapReturnInvoiceLinked({ ...linked, InvoiceStatus: "Cancelled" }, true), false);
  // DocEntry 0 não existe no SAP, mas 0 não pode ser lido como "sem vínculo".
  assert.strictEqual(isSapReturnInvoiceLinked({ ...linked, SapCreditMemoDocEntry: 0 }, true), true);
});

QUnit.test("canLinkCreditMemo exige nota escolhida de quantidade igual", function (assert) {
  const [match, differ] = normalizeLinkableCreditMemos([{ DocEntry: 1, QuantityMatches: true }, { DocEntry: 2, QuantityMatches: false }]);

  assert.strictEqual(canLinkCreditMemo(match), true);
  assert.strictEqual(canLinkCreditMemo(differ), false);
  assert.strictEqual(canLinkCreditMemo(null), false);
  assert.strictEqual(canLinkCreditMemo(undefined), false);
});

QUnit.test("defaultReturnLinkPeriod vai da emissão da devolução até hoje", function (assert) {
  const today = new Date(2026, 10, 17, 22, 30);

  assert.deepEqual(defaultReturnLinkPeriod("2026-11-05", today), { DateFrom: "2026-11-05", DateTo: "2026-11-17" });
  assert.deepEqual(defaultReturnLinkPeriod("2026-11-05T00:00:00Z", today), { DateFrom: "2026-11-05", DateTo: "2026-11-17" });
  assert.deepEqual(defaultReturnLinkPeriod(new Date(2026, 10, 5, 23, 59), today), { DateFrom: "2026-11-05", DateTo: "2026-11-17" });
  assert.deepEqual(defaultReturnLinkPeriod(null, today), { DateFrom: "2026-10-18", DateTo: "2026-11-17" }, "sem data: 30 dias");
  assert.deepEqual(defaultReturnLinkPeriod("lixo", today), { DateFrom: "2026-10-18", DateTo: "2026-11-17" });
  assert.deepEqual(defaultReturnLinkPeriod("2026-12-01", today), { DateFrom: "2026-10-18", DateTo: "2026-11-17" }, "data futura: 30 dias");
});

QUnit.test("sapDocNumText mostra a invoice de venda ou o Credit Memo da devolução", function (assert) {
  assert.strictEqual(sapDocNumText(1500, null), "1500");
  assert.strictEqual(sapDocNumText(null, 2001), "2001");
  assert.strictEqual(sapDocNumText(undefined, undefined), "");
  assert.strictEqual(sapDocNumText(null, null), "");
});

QUnit.test("returnDocumentSummary monta o cabeçalho do diálogo", function (assert) {
  assert.strictEqual(returnDocumentSummary({ InvoiceNumber: "DV000031", Quantity: 30000 }), "Devolução DV000031 — 30.000,000 kg");
  assert.strictEqual(returnDocumentSummary({}), "Devolução  — 0,000 kg");
});
