import {
	closedLoadWarning, completeTransferRefusal, reopenTransferRefusal, summarizeTransshipments, transshipmentTexts,
} from "siagrob1/helpers/TransshipmentHelpers";

QUnit.module("TransshipmentHelpers - transferência entre armazéns de terceiros (GAC-1176)");

QUnit.test("resumo: rótulo por linha, quebra somada e se a carga terminou numa transferência", function (assert) {
	const summary = summarizeTransshipments([
		{ Key: "k1", Sequence: 1, Type: "Transshipment", WarehouseCode: "A1", WarehouseName: "Um", ShrinkageQuantity: "150.000" },
		{ Key: "k2", Sequence: 2, Type: "Transfer", WarehouseCode: "B2", WarehouseName: "Dois", ShrinkageQuantity: 200.5, FinalDestinationAt: "2026-11-12T10:00:00Z" },
	]);

	assert.deepEqual(summary.lookup, {
		k1: "Transbordo 1 — armazém (A1) Um",
		k2: "Transferência 2 — armazém (B2) Dois",
	});
	assert.strictEqual(summary.shrinkageTotal, 350.5);
	assert.strictEqual(summary.hasFinal, true);
});

QUnit.test("resumo: só o ÚLTIMO transbordo decide se a carga terminou numa transferência", function (assert) {
	const summary = summarizeTransshipments([
		{ Key: "k1", Sequence: 1, Type: "Transfer", FinalDestinationAt: "2026-11-12T10:00:00Z" },
		{ Key: "k2", Sequence: 2, Type: "Transshipment" },
	]);

	assert.strictEqual(summary.hasFinal, false);
});

QUnit.test("resumo: carga sem transbordo", function (assert) {
	assert.deepEqual(summarizeTransshipments([]), { lookup: {}, shrinkageTotal: 0, hasFinal: false });
	assert.deepEqual(summarizeTransshipments(undefined), { lookup: {}, shrinkageTotal: 0, hasFinal: false });
});

QUnit.test("concluir: exige entrada registrada, sem saída vinculada e ainda não concluída", function (assert) {
	assert.strictEqual(
		completeTransferRefusal({ Key: "k1" }, []),
		"Registre a entrada no armazém antes de concluir a transferência.");
	assert.strictEqual(
		completeTransferRefusal({ Key: "k1", EntryStorageTransactionKey: "e1" }, ["k1"]),
		"Este transbordo já tem a Expedição de saída vinculada: a mercadoria seguiu viagem.");
	assert.strictEqual(
		completeTransferRefusal({ Key: "k1", EntryStorageTransactionKey: "e1", FinalDestinationAt: "2026-11-12T10:00:00Z" }, []),
		"Esta transferência já foi concluída.");
	assert.strictEqual(completeTransferRefusal({ Key: "k1", EntryStorageTransactionKey: "e1" }, []), null);
	assert.strictEqual(completeTransferRefusal({ Key: "k1", EntryStorageTransactionKey: "e1" }, undefined), null);
});

QUnit.test("reabrir: só a transferência concluída", function (assert) {
	assert.strictEqual(reopenTransferRefusal({ Key: "k1" }), "Esta transferência não foi concluída.");
	assert.strictEqual(reopenTransferRefusal({ Key: "k1", FinalDestinationAt: "2026-11-12T10:00:00Z" }), null);
});

QUnit.test("textos do diálogo e dos avisos acompanham o tipo", function (assert) {
	assert.deepEqual(transshipmentTexts("Transfer"), {
		startTitle: "Iniciar Transferência",
		entryTitle: "Registrar Entrada da Transferência",
		started: "Transferência iniciada.",
		entered: "Entrada da transferência registrada.",
		reversed: "Transferência estornada.",
		reverseQuestion: "Estornar a transferência selecionada ?",
		missingDate: "Informe a data da transferência.",
		missingWarehouse: "Informe o armazém de destino da transferência.",
		missingWeight: "Informe o peso pesado na entrada da transferência.",
		warehouseLabel: "Armazém de Destino",
		startDateLabel: "Data da Transferência",
	});
	assert.strictEqual(transshipmentTexts("Transshipment").startTitle, "Iniciar Transbordo");
	assert.strictEqual(transshipmentTexts(undefined).reversed, "Transbordo estornado.");
	assert.strictEqual(transshipmentTexts(null).missingWarehouse, "Informe o armazém do transbordo.");
});

QUnit.test("aviso da carga encerrada: a Concluída não manda só cancelar documentos de saída", function (assert) {
	// Faturada: há nota, e cancelar a nota é o caminho.
	assert.strictEqual(
		closedLoadWarning("CG1", "Invoiced", "Faturada", "estornar este romaneio"),
		"A carga CG1 já tem faturamento (Faturada). Cancele os documentos de saída da carga antes de estornar este romaneio.");
	// Concluída tem dois caminhos: pela conferência (há nota) ou por transferência (não há).
	assert.strictEqual(
		closedLoadWarning("CG1", "Completed", "Concluída", "desvincular este romaneio"),
		"A carga CG1 está concluída. Se ela foi concluída por transferência entre armazéns, reabra a transferência na carga; " +
		"senão, cancele os documentos de saída da carga antes de desvincular este romaneio.");
	assert.strictEqual(closedLoadWarning("CG1", "Open", "Carregada", "estornar este romaneio"), null);
	assert.strictEqual(closedLoadWarning("CG1", "InTransshipment", "Em Transbordo", "estornar este romaneio"), null);
});
