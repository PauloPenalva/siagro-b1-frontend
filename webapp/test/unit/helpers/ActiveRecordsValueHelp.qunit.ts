import {
	ACTIVE_RECORDS_FILTER, activeRecordsStaticFilter, isActiveOnlyDialog, isQueryField
} from "siagrob1/helpers/ActiveRecordsValueHelp";

QUnit.module("ActiveRecordsValueHelp - cadastro inativo no SAP (GAC-1196)");

QUnit.test("parceiro, armazém e produto abrem só com os ativos num documento", function (assert) {
	for (const name of ["BusinessPartnersSelectDialog", "SuppliersSelectDialog", "CostumersSelectDialog",
		"WarehousesSelectDialog", "ItemsSelectDialog"]) {
		assert.strictEqual(isActiveOnlyDialog(name), true, name);
		assert.strictEqual(activeRecordsStaticFilter(name, undefined, false), ACTIVE_RECORDS_FILTER, name);
	}
});

QUnit.test("o filtro estático do chamador é preservado e combinado", function (assert) {
	assert.strictEqual(
		activeRecordsStaticFilter("SuppliersSelectDialog", "CardType eq 'S' or CardType eq 'C'", false),
		"(CardType eq 'S' or CardType eq 'C') and Inactive eq false");
});

QUnit.test("campo de filtro continua enxergando os inativos", function (assert) {
	assert.strictEqual(activeRecordsStaticFilter("SuppliersSelectDialog", undefined, true), undefined,
		"undefined limpa o filtro de uma abertura anterior do mesmo diálogo");
	assert.strictEqual(activeRecordsStaticFilter("SuppliersSelectDialog", "CardType eq 'S'", true), "CardType eq 'S'");
});

QUnit.test("os outros diálogos não são tocados", function (assert) {
	assert.strictEqual(isActiveOnlyDialog("HarvestSeasonsSelectDialog"), false);
	assert.strictEqual(activeRecordsStaticFilter("HarvestSeasonsSelectDialog", undefined, false), undefined);
	assert.strictEqual(activeRecordsStaticFilter("CostCentersSelectDialog", "Class eq 'Analytic'", false), "Class eq 'Analytic'");
});

QUnit.test("isQueryField: barra de filtros, relatório e lista são consulta", function (assert) {
	assert.strictEqual(
		isQueryField("siagrob1.view.purchaseContracts.Main", ["sap.ui.comp.filterbar.FilterGroupItem", "sap.ui.comp.filterbar.FilterBar"]),
		true, "FilterBar");
	assert.strictEqual(
		isQueryField("siagrob1.view.purchaseContracts.Detail", ["sap.ui.comp.filterbar.FilterBar"]), true,
		"FilterBar numa aba do detalhe");
	assert.strictEqual(
		isQueryField("siagrob1.view.reports.salesInvoices.Main", ["sap.ui.layout.form.FormElement"]), true, "relatório");
	assert.strictEqual(isQueryField("siagrob1.view.fiscalKardex.Main", ["sap.m.HBox"]), true, "campo solto na lista");
});

QUnit.test("isQueryField: campo de documento não é consulta", function (assert) {
	assert.strictEqual(
		isQueryField("siagrob1.view.purchaseContracts.Add", ["sap.ui.layout.form.FormElement"]), false, "inclusão");
	assert.strictEqual(
		isQueryField("siagrob1.view.purchaseContracts.Edit", ["sap.m.ColumnListItem", "sap.m.Table"]), false, "linha editável");
	assert.strictEqual(
		isQueryField("siagrob1.view.financialAdvances.Main", ["sap.ui.layout.form.FormElement", "sap.m.Dialog"]), false,
		"diálogo de inclusão aberto a partir da lista");
});
