import {
	MDFE_BATCH_MAX,
	buildMdfeSettingsSavePayload,
	cancellationJustificationError,
	closeBatchItemsFrom,
	closeBatchSelectionError,
	cpfError,
	mdfeEventOutcome,
	notClosedRowFrom,
	sefazStatusFrom,
	buildTransportManifestSavePayload,
	buildTransportManifestsFilter,
	cargoTypeText,
	ciotError,
	endorsementText,
	filterEligibleCtes,
	formatAccessKey,
	groupCtesByUnloadingCity,
	manifestLinkText,
	mdfeActions,
	mdfeStatusState,
	mdfeStatusText,
	notEndorsedMessage,
	transportManifestFormFrom,
	weightUnitText,
} from "siagrob1/helpers/MdfeHelpers";
import type { TransportManifestForm } from "siagrob1/helpers/MdfeHelpers";

QUnit.module("MdfeHelpers - textos");

QUnit.test("situação do MDF-e: texto de todos os valores do enum", function (assert) {
	assert.strictEqual(mdfeStatusText("Draft"), "Rascunho");
	assert.strictEqual(mdfeStatusText("Confirmed"), "Confirmado");
	assert.strictEqual(mdfeStatusText("Processing"), "Em processamento");
	assert.strictEqual(mdfeStatusText("Authorized"), "Autorizado — não encerrado");
	assert.strictEqual(mdfeStatusText("Rejected"), "Rejeitado");
	assert.strictEqual(mdfeStatusText("Denied"), "Denegado");
	assert.strictEqual(mdfeStatusText("Cancelled"), "Cancelado");
	assert.strictEqual(mdfeStatusText("Voided"), "Inutilizado");
	assert.strictEqual(mdfeStatusText("Closed"), "Encerrado");
	assert.strictEqual(mdfeStatusText(undefined), "");
});

QUnit.test("situação do MDF-e: encerrado é Success e autorizado não encerrado é Warning", function (assert) {
	assert.strictEqual(mdfeStatusState("Closed"), "Success");
	assert.strictEqual(mdfeStatusState("Authorized"), "Warning");
	assert.strictEqual(mdfeStatusState("Rejected"), "Error");
	assert.strictEqual(mdfeStatusState("Draft"), "None");
});

QUnit.test("unidade do peso e tipo de carga", function (assert) {
	assert.strictEqual(weightUnitText("01"), "KG");
	assert.strictEqual(weightUnitText("02"), "TON");
	assert.strictEqual(cargoTypeText("01"), "Granel sólido");
	assert.strictEqual(cargoTypeText("05"), "Carga geral");
	assert.strictEqual(cargoTypeText("11"), "Perigosa (carga geral)");
	assert.strictEqual(cargoTypeText("99"), "99");
});

QUnit.test("chave formatada reaproveita o CteHelpers", function (assert) {
	assert.strictEqual(formatAccessKey("12345678"), "1234 5678");
});

QUnit.test("vínculo no CT-e: número/série (situação), vazio sem MDF-e", function (assert) {
	assert.strictEqual(manifestLinkText({ ManifestKey: "k", Number: 12, Series: 1, Status: "Authorized" }), "12/1 (Autorizado — não encerrado)");
	assert.strictEqual(manifestLinkText({ ManifestKey: "k", Number: null, Series: 1, Status: "Draft" }), "(sem número)/1 (Rascunho)");
	assert.strictEqual(manifestLinkText(undefined), "");
});

QUnit.module("MdfeHelpers - CIOT");

QUnit.test("CIOT: 11 dígitos dá erro, 12 dá null, vazio dá null", function (assert) {
	assert.ok(ciotError("12345678901"));
	assert.strictEqual(ciotError("123456789012"), null);
	assert.strictEqual(ciotError(""), null);
	assert.strictEqual(ciotError(undefined), null);
	assert.ok(ciotError("12345678901A"));
});

QUnit.module("MdfeHelpers - payloads");

const form = (): TransportManifestForm => ({
	Key: "abc",
	RouteUfs: [{ Uf: "mt" }, { Uf: " " }, { Uf: "GO" }],
	AdditionalDrivers: [{ Cpf: "123.456.789-01", Name: " João " }, { Cpf: "", Name: "" }],
	TrailerPlates: [{ Plate: "abc1d23" }, { Plate: "" }],
	Seals: [{ Number: "L1" }, { Number: " " }],
	LoadingZip: "78.000-000",
	UnloadingZip: "",
	GrossWeight: "1234,5",
	WeightUnit: "02",
	CiotNumber: "",
	CiotResponsibleTaxId: "",
	Contractors: [{ TaxId: "11.222.333/0001-81", Name: "Contratante" }],
	TollSupplierCnpj: "",
	TollVoucherNumber: "",
	TollValue: "",
	Payments: [{
		ContractorTaxId: "11222333000181", ContractorName: "C", Total: "100.5", IndPag: "1", Pix: "", BankCode: "", Agency: "",
		Components: [{ Type: "01", Value: "100.5", Description: "" }],
		Installments: [{ Number: "1", DueDate: "2026-11-30", Value: "100.5" }],
	}],
	AdditionalInfo: " obs ",
});

QUnit.test("save: peso vira Number (vírgula aceita) e linhas vazias somem", function (assert) {
	const payload = buildTransportManifestSavePayload(form());
	assert.strictEqual(payload.Key, "abc");
	assert.strictEqual(payload.Model.GrossWeight, 1234.5);
	assert.strictEqual(typeof payload.Model.GrossWeight, "number");
	assert.deepEqual(payload.Model.RouteUfs, ["MT", "GO"]);
	assert.deepEqual(payload.Model.AdditionalDrivers, [{ Cpf: "12345678901", Name: "João" }]);
	assert.deepEqual(payload.Model.TrailerPlates, ["ABC1D23"]);
	assert.deepEqual(payload.Model.Seals, ["L1"]);
	assert.strictEqual(payload.Model.LoadingZip, "78000000");
	assert.strictEqual(payload.Model.UnloadingZip, null);
	assert.strictEqual(payload.Model.WeightUnit, "02");
	assert.strictEqual(payload.Model.CiotNumber, null);
	assert.strictEqual(payload.Model.TollValue, null);
	assert.deepEqual(payload.Model.Contractors, [{ TaxId: "11222333000181", Name: "Contratante" }]);
	assert.strictEqual(payload.Model.AdditionalInfo, "obs");
});

QUnit.test("save: pagamento com números e data das parcelas", function (assert) {
	const p = buildTransportManifestSavePayload(form()).Model.Payments[0];
	assert.strictEqual(p.Total, 100.5);
	assert.strictEqual(p.IndPag, 1);
	assert.strictEqual(p.Pix, null);
	assert.deepEqual(p.Components, [{ Type: "01", Value: 100.5, Description: null }]);
	assert.deepEqual(p.Installments, [{ Number: 1, DueDate: "2026-11-30", Value: 100.5 }]);
});

QUnit.test("save: peso vazio vai 0", function (assert) {
	const f = form();
	f.GrossWeight = "";
	assert.strictEqual(buildTransportManifestSavePayload(f).Model.GrossWeight, 0);
});

QUnit.test("formulário a partir do MDF-e lido: só reboques, condutores adicionais e listas em linhas", function (assert) {
	const f = transportManifestFormFrom({
		Key: "k", GrossWeight: 10, WeightUnit: "01",
		RouteUfs: [{ LineNum: 2, Uf: "GO" }, { LineNum: 1, Uf: "MT" }],
		Vehicles: [{ IsTraction: true, Plate: "AAA0A00", LineNum: 1 }, { IsTraction: false, Plate: "BBB1B11", LineNum: 2 }],
		Drivers: [{ Cpf: "1", Name: "A", LineNum: 1, AddedByEvent: false }, { Cpf: "2", Name: "B", LineNum: 2, AddedByEvent: true }],
		Seals: [{ Number: "S" }],
		Contractors: [], Payments: [],
	});
	assert.deepEqual(f.RouteUfs, [{ Uf: "MT" }, { Uf: "GO" }]);
	assert.deepEqual(f.TrailerPlates, [{ Plate: "BBB1B11" }]);
	assert.deepEqual(f.AdditionalDrivers, [{ Cpf: "1", Name: "A" }]);
	assert.deepEqual(f.Seals, [{ Number: "S" }]);
	assert.strictEqual(f.GrossWeight, 10);
});

QUnit.test("configuração: ambiente pelo número e séries em colunas", function (assert) {
	const p = buildMdfeSettingsSavePayload({
		BranchCode: "01", Enabled: true, Environment: "Production", DefaultSeries: "2", DefaultCargoType: "", RequiresCiot: true,
		SeriesList: [{ Series: "2", Description: " Principal ", NextNumber: "5", IsUsed: false, isNew: true }],
	});
	assert.deepEqual(p, {
		BranchCode: "01", Enabled: true, Environment: 1, DefaultSeries: 2, DefaultCargoType: "02", RequiresCiot: true,
		Series: [2], Descriptions: ["Principal"], NextNumbers: [5],
	});
});

QUnit.module("MdfeHelpers - lista e inclusão");

QUnit.test("filtro: só não encerrados usa o enum qualificado; situação multi; placa e motorista", function (assert) {
	assert.strictEqual(buildTransportManifestsFilter({}), undefined);
	assert.strictEqual(buildTransportManifestsFilter({ OnlyOpen: true }), "Status eq SiagroB1.Domain.Enums.MdfeStatus'Authorized'");
	assert.strictEqual(buildTransportManifestsFilter({ Statuses: ["Draft", "Closed"] }), "(Status eq 'Draft' or Status eq 'Closed')");
	assert.strictEqual(buildTransportManifestsFilter({ Plate: "abc", Driver: "jo'ao" }),
		"contains(TractionPlate,'ABC') and contains(DriverName,'jo''ao')");
	const dated = buildTransportManifestsFilter({ DateFrom: "2026-10-01", DateTo: "2026-10-31" });
	assert.ok(dated.startsWith("IssuedAt ge 2026-10-01T00:00:00"));
	assert.ok(dated.includes("IssuedAt lt 2026-11-01T00:00:00"));
});

QUnit.test("CT-e elegíveis filtrados por placa e período de emissão (data local)", function (assert) {
	const rows = [
		{ Key: "1", TractionPlate: "ABC1D23", IssuedAt: "2026-10-20T10:00:00-03:00" },
		{ Key: "2", TractionPlate: "XYZ9Z99", IssuedAt: "2026-10-21T12:30:00-03:00" },
	];
	assert.deepEqual(filterEligibleCtes(rows, { Plate: "abc" }).map((r) => r.Key), ["1"]);
	assert.deepEqual(filterEligibleCtes(rows, { DateFrom: "2026-10-21", DateTo: "2026-10-21" }).map((r) => r.Key), ["2"]);
	assert.deepEqual(filterEligibleCtes(rows, {}).map((r) => r.Key), ["1", "2"]);
});

QUnit.test("CT-e agrupados por município de descarga na ordem das linhas", function (assert) {
	const groups = groupCtesByUnloadingCity([
		{ LineNum: 2, UnloadingCityIbge: "5", UnloadingCityName: "B", CteAccessKey: "k2" },
		{ LineNum: 1, UnloadingCityIbge: "4", UnloadingCityName: "A", CteAccessKey: "k1" },
		{ LineNum: 3, UnloadingCityIbge: "4", UnloadingCityName: "A", CteAccessKey: "k3" },
	]);
	assert.deepEqual(groups.map((g) => [g.CityName, g.Ctes.map((c) => c.CteAccessKey)]), [["A", ["k1", "k3"]], ["B", ["k2"]]]);
});

QUnit.test("botões do detalhe conforme a situação", function (assert) {
	assert.deepEqual(mdfeActions("Draft", null), {
		edit: true, confirm: true, reopen: false, transmit: false, consult: false, close: false, damdfe: false, discardNumber: false, delete: true,
		cancel: false, includeDriver: false,
	});
	const authorized = mdfeActions("Authorized", 3);
	assert.ok(authorized.close && authorized.damdfe && authorized.consult);
	assert.notOk(authorized.edit);
	const confirmed = mdfeActions("Confirmed", 3);
	assert.ok(confirmed.transmit && confirmed.reopen && confirmed.discardNumber);
	assert.ok(mdfeActions("Closed", 3).damdfe);
	assert.notOk(mdfeActions("Closed", 3).close);
});

QUnit.module("MdfeHelpers - averbação dos CT-e");

QUnit.test("texto da averbação aceita enum como nome ou número", function (assert) {
	assert.strictEqual(endorsementText("Endorsed"), "Averbado");
	assert.strictEqual(endorsementText(1), "Averbado");
	assert.strictEqual(endorsementText("None"), "Não averbado");
	assert.strictEqual(endorsementText("Cancelled"), "Não averbado");
	assert.strictEqual(endorsementText(null), "Não averbado");
});

QUnit.test("mensagem lista só os CT-e não averbados", function (assert) {
	const rows = [
		{ Number: 1, EndorsementStatus: "Endorsed" },
		{ Number: 2, EndorsementStatus: "None" },
		{ Number: 3, EndorsementStatus: "CancellationPending" },
	];
	assert.strictEqual(notEndorsedMessage(rows), "Averbe os CT-e antes de incluir no MDF-e: 2, 3.");
	assert.strictEqual(notEndorsedMessage([rows[0]]), "");
});

QUnit.module("MdfeHelpers - entrega B");

QUnit.test("justificativa do cancelamento: 15 a 255 caracteres após o trim", function (assert) {
	const msg = "A justificativa deve ter de 15 a 255 caracteres.";
	assert.strictEqual(cancellationJustificationError("a".repeat(14)), msg);
	assert.strictEqual(cancellationJustificationError("a".repeat(15)), "");
	assert.strictEqual(cancellationJustificationError("a".repeat(255)), "");
	assert.strictEqual(cancellationJustificationError("a".repeat(256)), msg);
	assert.strictEqual(cancellationJustificationError(`  ${"a".repeat(14)}  `), msg);
	assert.strictEqual(cancellationJustificationError(null), msg);
});

QUnit.test("CPF do condutor: 11 dígitos com dígitos verificadores", function (assert) {
	assert.strictEqual(cpfError("529.982.247-25"), "");
	assert.strictEqual(cpfError("52998224725"), "");
	assert.strictEqual(cpfError("52998224724"), "CPF inválido.");
	assert.strictEqual(cpfError("11111111111"), "CPF inválido.");
	assert.strictEqual(cpfError("1234"), "CPF inválido.");
	assert.strictEqual(cpfError(""), "Informe o CPF do condutor.");
});

QUnit.test("ações de cancelar e incluir condutor só para autorizado", function (assert) {
	assert.ok(mdfeActions("Authorized", 3).cancel && mdfeActions("Authorized", 3).includeDriver);
	assert.notOk(mdfeActions("Closed", 3).cancel || mdfeActions("Closed", 3).includeDriver);
});

QUnit.test("resultado do evento: 135/136 sucesso, 132/101/151 aviso, resto erro (aceita camelCase)", function (assert) {
	assert.deepEqual(mdfeEventOutcome({ StatusCode: 135, Reason: "ok" }), { kind: "success", text: "135 - ok" });
	assert.deepEqual(mdfeEventOutcome({ statusCode: 136, reason: "ok" }), { kind: "success", text: "136 - ok" });
	assert.strictEqual(mdfeEventOutcome({ statusCode: 132, reason: "x" }).kind, "warning");
	assert.strictEqual(mdfeEventOutcome({ statusCode: 101, reason: "x" }).kind, "warning");
	assert.strictEqual(mdfeEventOutcome({ statusCode: 151, reason: "x" }).kind, "warning");
	assert.deepEqual(mdfeEventOutcome({ statusCode: 218, reason: "Rejeição" }), { kind: "error", text: "218 - Rejeição" });
});

QUnit.test("lote de encerramento: 1 a 50 selecionados", function (assert) {
	assert.strictEqual(MDFE_BATCH_MAX, 50);
	assert.strictEqual(closeBatchSelectionError(0), "Selecione ao menos um MDF-e.");
	assert.strictEqual(closeBatchSelectionError(1), "");
	assert.strictEqual(closeBatchSelectionError(50), "");
	assert.strictEqual(closeBatchSelectionError(51), "Selecione no máximo 50 MDF-e por vez.");
});

QUnit.test("linha dos não encerrados: ações conforme a situação (Pascal ou camelCase)", function (assert) {
	const open = notClosedRowFrom({ accessKey: "1", protocol: "p", manifestKey: "k", number: 5, series: 1, status: "Authorized", statusDiverges: false, outsideSystem: false });
	assert.ok(open.canClose && open.canConsult);
	assert.strictEqual(open.ManifestKey, "k");
	assert.strictEqual(open.state, "None");
	const diverges = notClosedRowFrom({ AccessKey: "2", ManifestKey: "k2", Status: "Closed", StatusDiverges: true, OutsideSystem: false });
	assert.ok(!diverges.canClose && diverges.canConsult);
	assert.strictEqual(diverges.state, "Warning");
	const outside = notClosedRowFrom({ AccessKey: "3", OutsideSystem: true, StatusDiverges: false });
	assert.ok(!outside.canClose && !outside.canConsult);
	assert.strictEqual(outside.situation, "MDF-e fora do sistema");
});

QUnit.test("em processamento só consulta (o lote encerra só autorizado)", function (assert) {
	const row = notClosedRowFrom({ AccessKey: "4", ManifestKey: "k4", Status: "Processing", StatusDiverges: false, OutsideSystem: false });
	assert.ok(!row.canClose && row.canConsult);
});

QUnit.test("resultado do lote em camelCase ou PascalCase", function (assert) {
	assert.deepEqual(closeBatchItemsFrom([{ key: "a", number: 7, success: true, message: "135 - ok" }, { Key: "b", Number: null, Success: false, Message: "x" }]), [
		{ key: "a", number: 7, success: true, message: "135 - ok" },
		{ key: "b", number: null, success: false, message: "x" },
	]);
	assert.deepEqual(closeBatchItemsFrom(null), []);
});

QUnit.test("retorno da SEFAZ em camelCase vira PascalCase", function (assert) {
	assert.deepEqual(sefazStatusFrom({ statusCode: 100, reason: "ok" }), { StatusCode: 100, Reason: "ok" });
	assert.deepEqual(sefazStatusFrom({ StatusCode: 135, Reason: "r" }), { StatusCode: 135, Reason: "r" });
});
