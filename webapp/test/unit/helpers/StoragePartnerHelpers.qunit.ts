import { isSupplierOnlyTransaction } from "siagrob1/helpers/StoragePartnerHelpers";

QUnit.module("StoragePartnerHelpers - depositante só fornecedor no romaneio (GAC-1223)");

QUnit.test("romaneio de armazenagem só aceita fornecedor", function (assert) {
	for (const type of ["Receipt", "Shipment", "QualityLoss"]) {
		assert.strictEqual(isSupplierOnlyTransaction(type), true, type);
	}
});

QUnit.test("tipo ainda não escolhido já abre só com fornecedores", function (assert) {
	assert.strictEqual(isSupplierOnlyTransaction(""), true);
	assert.strictEqual(isSupplierOnlyTransaction(undefined), true);
	assert.strictEqual(isSupplierOnlyTransaction(null), true);
});

QUnit.test("compra, venda e demais tipos continuam com todos os parceiros", function (assert) {
	for (const type of ["Purchase", "PurchaseReturn", "PurchaseQtyComplement", "PurchasePriceComplement",
		"SalesShipment", "SalesShipmentReturn", "TransshipmentReceipt", "WarehouseGain"]) {
		assert.strictEqual(isSupplierOnlyTransaction(type), false, type);
	}
});
