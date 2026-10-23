import {
	CTE_CORRECTABLE_FIELDS,
	batchSelectionError,
	canEndorse,
	paymentConditionAfterPartyPick,
	endorsementStatusState,
	endorsementStatusText,
	buildCorrectionPayload,
	buildCteSettingsSavePayload,
	buildTransportDocumentSavePayload,
	buildTransportDocumentsFilter,
	cancellationJustificationError,
	correctionRowsError,
	cteActions,
	cteStatusState,
	cteStatusText,
	emptyTransportDocumentForm,
	formatAccessKey,
	localOffset,
	partyNameByRole,
	partyRoleText,
	sefazOutcome,
	quantityUnitText,
	takerName,
	takerRoleText,
	transportDocumentFormFrom,
} from "siagrob1/helpers/CteHelpers";
import type { TransportDocumentForm } from "siagrob1/helpers/CteHelpers";

QUnit.module("CteHelpers - textos");

QUnit.test("situação do CT-e: texto e estado por nome do enum", function (assert) {
	assert.strictEqual(cteStatusText("Draft"), "Rascunho");
	assert.strictEqual(cteStatusText("Authorized"), "Autorizado");
	assert.strictEqual(cteStatusText("Voided"), "Inutilizado");
	assert.strictEqual(cteStatusText(undefined), "");
	assert.strictEqual(cteStatusState("Authorized"), "Success");
	assert.strictEqual(cteStatusState("Rejected"), "Error");
	assert.strictEqual(cteStatusState("Processing"), "Warning");
	assert.strictEqual(cteStatusState("Draft"), "None");
});

QUnit.test("tomador pelo número (toma3/toma4)", function (assert) {
	assert.strictEqual(takerRoleText(0), "Remetente");
	assert.strictEqual(takerRoleText(3), "Destinatário");
	assert.strictEqual(takerRoleText(4), "Outros");
	assert.strictEqual(takerRoleText(undefined), "");
});

QUnit.test("unidade da quantidade: código e texto", function (assert) {
	assert.strictEqual(quantityUnitText("00"), "00 - M3");
	assert.strictEqual(quantityUnitText("01"), "01 - KG");
	assert.strictEqual(quantityUnitText("05"), "05 - MMBTU");
	assert.strictEqual(quantityUnitText("99"), "99");
});

QUnit.test("chave de acesso em grupos de 4", function (assert) {
	const key = "41261012345678000190570010000000011234567890";
	assert.strictEqual(formatAccessKey(key), "4126 1012 3456 7800 0190 5700 1000 0000 0112 3456 7890");
	assert.strictEqual(formatAccessKey(""), "");
	assert.strictEqual(formatAccessKey(null), "");
});

QUnit.test("nomes dos participantes e do tomador na lista", function (assert) {
	const parties = [
		{ Role: "Sender", Name: "Fazenda A" },
		{ Role: "Recipient", Name: "Porto B" },
		{ Role: "OtherTaker", Name: "Trading C" },
	];
	assert.strictEqual(partyNameByRole(parties, "Sender"), "Fazenda A");
	assert.strictEqual(partyNameByRole(parties, "Shipper"), "");
	assert.strictEqual(takerName(parties, 3), "Porto B");
	assert.strictEqual(takerName(parties, 4), "Trading C");
	assert.strictEqual(takerName(undefined, 0), "");
});

QUnit.module("CteHelpers - cancelamento e CC-e");

QUnit.test("justificativa do cancelamento: 15 a 255 após o trim", function (assert) {
	assert.strictEqual(cancellationJustificationError("  curta  "), "A justificativa deve ter de 15 a 255 caracteres.");
	assert.strictEqual(cancellationJustificationError("x".repeat(15)), "");
	assert.strictEqual(cancellationJustificationError("x".repeat(255)), "");
	assert.ok(cancellationJustificationError("x".repeat(256)));
	assert.ok(cancellationJustificationError(undefined));
});

QUnit.test("campos da CC-e espelham a lista fechada do servidor", function (assert) {
	assert.strictEqual(CTE_CORRECTABLE_FIELDS.length, 10);
	assert.deepEqual(
		[...new Set(CTE_CORRECTABLE_FIELDS.map((f) => f.Group))],
		["compl", "receb", "enderReceb", "dest", "enderDest", "infCarga"]);
	assert.ok(CTE_CORRECTABLE_FIELDS.every((f) => f.MaxLength <= 500));
});

QUnit.test("CC-e: linhas viram vetores paralelos; vazio, repetido ou longo é recusado", function (assert) {
	const rows = [{ FieldId: "compl|xObs", Value: " nova obs " }, { FieldId: "infCarga|proPred", Value: "SOJA" }];
	assert.deepEqual(buildCorrectionPayload("k1", rows), {
		Key: "k1", Groups: ["compl", "infCarga"], Fields: ["xObs", "proPred"], Values: ["nova obs", "SOJA"],
	});
	assert.strictEqual(correctionRowsError(rows), "");
	assert.strictEqual(correctionRowsError([]), "Informe ao menos um campo a corrigir.");
	assert.strictEqual(correctionRowsError([{ FieldId: "compl|xObs", Value: " " }]), "Informe o campo e o novo valor em todas as linhas.");
	assert.strictEqual(correctionRowsError([rows[0], rows[0]]), "O campo Observações gerais aparece mais de uma vez.");
	assert.strictEqual(correctionRowsError([{ FieldId: "dest|xNome", Value: "x".repeat(61) }]),
		"Destinatário: nome aceita no máximo 60 caracteres.");
});

QUnit.module("CteHelpers - formulário e filtros");

const filledForm = (): TransportDocumentForm => ({
	...emptyTransportDocumentForm("0001", 1),
	Key: "11111111-2222-3333-4444-555555555555",
	UsageCode: "7",
	TakerRole: "3",
	Sender: { CardCode: " F001 ", CardName: "Fazenda" },
	Recipient: { CardCode: "C002", CardName: "Porto" },
	StartMunicipalityCode: " 4106902 ",
	NfeKeys: [{ AccessKey: " 4126 1012 3456 7800 0190 5500 1000 0000 0112 3456 7890 " }, { AccessKey: "" }],
	PredominantProduct: " SOJA ",
	CargoValue: "1234,5",
	Quantities: [{ UnitCode: "01", MeasureType: "PESO BRUTO", Quantity: "37000" }, { UnitCode: "", MeasureType: "", Quantity: "" }],
	Components: [{ Name: "FRETE PESO", Value: "1500.25" }, { Name: " ", Value: "" }],
	VehicleMode: "Combination",
	TruckCombinationCode: "BITREM1",
	TractionPlate: "ABC1D23",
	DriverCpf: "123.456.789-09",
	InsuranceResponsible: "",
	Tracked: false,
	OwnTransport: true,
	Observation: "  ",
	CostCenterCode: "CC1",
});

QUnit.test("payload do TransportDocumentsSave: vetores paralelos, números e nulos", function (assert) {
	const p = buildTransportDocumentSavePayload(filledForm());
	assert.strictEqual(p.Key, "11111111-2222-3333-4444-555555555555");
	assert.strictEqual(p.BranchCode, "0001");
	assert.strictEqual(p.Series, 1);
	assert.strictEqual(p.UsageCode, 7);
	assert.strictEqual(p.TakerRole, 3);
	assert.deepEqual(p.PartyRoles, [0, 3]);
	assert.deepEqual(p.PartyCardCodes, ["F001", "C002"]);
	assert.strictEqual(p.StartMunicipalityCode, "4106902");
	assert.strictEqual(p.EndMunicipalityCode, null);
	assert.deepEqual(p.NfeKeys, ["41261012345678000190550010000000011234567890"]);
	assert.strictEqual(p.PredominantProduct, "SOJA");
	assert.strictEqual(p.CargoValue, 1234.5);
	assert.deepEqual(p.QuantityUnits, ["01"]);
	assert.deepEqual(p.QuantityMeasureTypes, ["PESO BRUTO"]);
	assert.deepEqual(p.QuantityValues, [37000]);
	assert.deepEqual(p.ComponentNames, ["FRETE PESO"]);
	assert.deepEqual(p.ComponentValues, [1500.25]);
	assert.strictEqual(p.TruckCombinationCode, "BITREM1");
	assert.strictEqual(p.TractionPlate, null, "com conjunto a tração vem dele");
	assert.strictEqual(p.DriverCpf, "12345678909");
	assert.strictEqual(p.InsuranceResponsible, null);
	assert.strictEqual(p.Tracked, false);
	assert.strictEqual(p.Observation, null);
	assert.strictEqual(p.CostCenterCode, "CC1");
	assert.strictEqual(p.DistributionRuleCode, null);
});

QUnit.test("payload: documento novo sem chave e modal só tração", function (assert) {
	const p = buildTransportDocumentSavePayload({
		...filledForm(), Key: "", UsageCode: "", VehicleMode: "Traction", TractionPlate: " abc1d23 ",
	});
	assert.strictEqual(p.Key, null);
	assert.strictEqual(p.UsageCode, null);
	assert.strictEqual(p.TruckCombinationCode, null);
	assert.strictEqual(p.TractionPlate, "ABC1D23");
});

QUnit.test("formulário a partir do documento lido (com filhos)", function (assert) {
	const form = transportDocumentFormFrom({
		Key: "k", BranchCode: "0001", Series: 2, UsageCode: 5, TakerRole: 0, Status: "Rejected",
		Parties: [{ Role: "Sender", CardCode: "F1", Name: "Faz" }, { Role: "OtherTaker", CardCode: "T1", Name: "Trd" }],
		NfeKeys: [{ AccessKey: "B", Order: 2 }, { AccessKey: "A", Order: 1 }],
		Quantities: [{ UnitCode: "01", MeasureType: "PESO", Quantity: 10 }],
		Components: [{ Name: "FRETE", Value: 5 }],
		TruckCombinationCode: null, TractionPlate: "ABC1D23", DriverCpf: "123",
		Tracked: true, OwnTransport: false, CargoValue: 9,
	});
	assert.strictEqual(form.Key, "k");
	assert.strictEqual(form.Status, "Rejected");
	assert.strictEqual(form.Sender.CardCode, "F1");
	assert.strictEqual(form.OtherTaker.CardName, "Trd");
	assert.strictEqual(form.Shipper.CardCode, "");
	assert.deepEqual(form.NfeKeys.map((k) => k.AccessKey), ["A", "B"]);
	assert.strictEqual(form.VehicleMode, "Traction");
	assert.strictEqual(form.OwnTransport, false);
});

QUnit.test("$filter da lista: período, situação, participantes e placa", function (assert) {
	assert.strictEqual(buildTransportDocumentsFilter({}), undefined);
	// Data local do navegador (o "até" inclui o dia todo): o deslocamento é o do fuso de quem filtra.
	const offset = localOffset(new Date(2026, 9, 1));
	assert.strictEqual(
		buildTransportDocumentsFilter({ DateFrom: "2026-10-01", DateTo: "2026-10-31", Status: "Authorized" }),
		`IssuedAt ge 2026-10-01T00:00:00${offset} and IssuedAt lt 2026-11-01T00:00:00${localOffset(new Date(2026, 10, 1))} and Status eq 'Authorized'`);
	assert.strictEqual(
		buildTransportDocumentsFilter({ Sender: "d'ávila", Plate: "abc" }),
		"Parties/any(p:p/Role eq 'Sender' and contains(p/Name,'d''ávila')) and contains(TractionPlate,'ABC')");
	assert.strictEqual(
		buildTransportDocumentsFilter({ Taker: "x" }),
		"Parties/any(p:contains(p/Name,'x') and ((p/Role eq 'Sender' and $it/TakerRole eq 0)"
		+ " or (p/Role eq 'Shipper' and $it/TakerRole eq 1) or (p/Role eq 'Receiver' and $it/TakerRole eq 2)"
		+ " or (p/Role eq 'Recipient' and $it/TakerRole eq 3) or (p/Role eq 'OtherTaker' and $it/TakerRole eq 4)))");
});

QUnit.test("deslocamento do fuso no formato do OData", function (assert) {
	assert.ok(/^[+-]\d\d:\d\d$/.test(localOffset(new Date(2026, 9, 1))));
});

QUnit.module("CteHelpers - configuração");

QUnit.test("payload do BranchCteSettingsSave", function (assert) {
	const p = buildCteSettingsSavePayload({
		BranchCode: "0001", Enabled: true, Environment: "Production", DefaultSeries: "3", DefaultQuantityUnit: "01",
		SeriesList: [{ Series: "3", Description: " Frete ", NextNumber: "10", IsUsed: false, isNew: true }],
	});
	assert.deepEqual(p, {
		BranchCode: "0001", Enabled: true, Environment: 1, DefaultSeries: 3, DefaultQuantityUnit: "01",
		Series: [3], Descriptions: ["Frete"], NextNumbers: [10],
	});
});

QUnit.module("CteHelpers - botões do detalhe");

QUnit.test("ações seguem as travas dos serviços", function (assert) {
	assert.ok(cteActions("Draft", null).delete);
	assert.notOk(cteActions("Draft", 5).delete);
	assert.ok(cteActions("Draft", 5).discardNumber);
	assert.ok(cteActions("Confirmed", 5).reopen);
	assert.ok(cteActions("Rejected", 5).transmit);
	assert.ok(cteActions("Rejected", 5).edit);
	assert.notOk(cteActions("Authorized", 5).discardNumber);
	assert.ok(cteActions("Authorized", 5).cancel);
	assert.ok(cteActions("Cancelled", 5).dacte);
	assert.notOk(cteActions("Cancelled", 5).correction);
});

QUnit.test("papel do participante e desfecho da SEFAZ", function (assert) {
	assert.strictEqual(partyRoleText("Shipper"), "Expedidor");
	assert.strictEqual(partyRoleText(""), "");
	assert.deepEqual(sefazOutcome({ StatusCode: 100, Reason: "Autorizado o uso do CT-e" }),
		{ ok: true, text: "100 - Autorizado o uso do CT-e" });
	assert.notOk(sefazOutcome({ StatusCode: 539, Reason: "Duplicidade" }).ok);
	assert.ok(sefazOutcome({ StatusCode: 150, Reason: "Autorizado fora de prazo" }).ok);
});

QUnit.module("CteHelpers - averbação e lote");

QUnit.test("situação da averbação", function (assert) {
	assert.strictEqual(endorsementStatusText("None"), "Não averbado");
	assert.strictEqual(endorsementStatusText("Endorsed"), "Averbado");
	assert.strictEqual(endorsementStatusText("CancellationPending"), "Cancelamento pendente");
	assert.strictEqual(endorsementStatusText("Cancelled"), "Averbação cancelada");
	assert.strictEqual(endorsementStatusText(null), "");
	assert.strictEqual(endorsementStatusState("Endorsed"), "Success");
	assert.strictEqual(endorsementStatusState("CancellationPending"), "Warning");
	assert.strictEqual(endorsementStatusState("None"), "None");
});

QUnit.test("averbar só autorizado, não averbado, com AT&M ligada", function (assert) {
	assert.ok(canEndorse("Authorized", "None", true));
	assert.ok(canEndorse("Authorized", null, true));
	assert.notOk(canEndorse("Authorized", "None", false));
	assert.notOk(canEndorse("Authorized", "Endorsed", true));
	assert.notOk(canEndorse("Cancelled", "None", true));
	assert.notOk(canEndorse("Confirmed", "None", true));
});

QUnit.test("seleção do lote: 1 a 200", function (assert) {
	assert.ok(batchSelectionError(0));
	assert.strictEqual(batchSelectionError(1), "");
	assert.strictEqual(batchSelectionError(200), "");
	assert.ok(batchSelectionError(201));
});

QUnit.test("filtro Averbado e condição de pagamento no payload", function (assert) {
	assert.strictEqual(buildTransportDocumentsFilter({ Endorsed: "yes" }), "EndorsementStatus eq 'Endorsed'");
	assert.strictEqual(buildTransportDocumentsFilter({ Endorsed: "no" }), "EndorsementStatus ne 'Endorsed'");
	const form = { ...emptyTransportDocumentForm("0001", 1), PaymentConditionCode: "3" };
	assert.strictEqual(buildTransportDocumentSavePayload(form).PaymentConditionCode, 3);
	assert.strictEqual(buildTransportDocumentSavePayload(emptyTransportDocumentForm("0001", 1)).PaymentConditionCode, null);
	assert.strictEqual(transportDocumentFormFrom({ PaymentConditionCode: 7 }).PaymentConditionCode, "7");
});

QUnit.test("condição de pagamento só segue o tomador", function (assert) {
	// Tomador = Remetente (0): escolher o destinatário não mexe na condição.
	assert.deepEqual(paymentConditionAfterPartyPick("0", "Recipient", "5", 9), { code: "5", changed: false });
	assert.deepEqual(paymentConditionAfterPartyPick("0", "Sender", "5", 9), { code: "9", changed: true });
	assert.deepEqual(paymentConditionAfterPartyPick("0", "Sender", "5", null), { code: null, changed: true });
	// Troca do tomador (pickedRole null) sempre recalcula.
	assert.deepEqual(paymentConditionAfterPartyPick("3", null, "5", 7), { code: "7", changed: true });
	assert.deepEqual(paymentConditionAfterPartyPick("3", null, "", null), { code: null, changed: false });
});
