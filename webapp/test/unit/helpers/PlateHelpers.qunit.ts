import { isValidPlate, normalizePlate } from "siagrob1/helpers/PlateHelpers";

QUnit.module("PlateHelpers - placa do veículo (GAC-1190)");

QUnit.test("normalizePlate põe em maiúsculas e tira espaços e hífen", function (assert) {
	assert.strictEqual(normalizePlate("cud 1h57"), "CUD1H57");
	assert.strictEqual(normalizePlate("CUD-1H57"), "CUD1H57");
	assert.strictEqual(normalizePlate("  abc 1234 "), "ABC1234");
	assert.strictEqual(normalizePlate(""), "");
	assert.strictEqual(normalizePlate(null), "");
	assert.strictEqual(normalizePlate(undefined), "");
});

QUnit.test("isValidPlate aceita o padrão antigo e o Mercosul, digitados de qualquer jeito", function (assert) {
	assert.strictEqual(isValidPlate("ABC1234"), true);
	assert.strictEqual(isValidPlate("ABC1D23"), true);
	assert.strictEqual(isValidPlate("cud 1h57"), true);
	assert.strictEqual(isValidPlate("CUD-1H57"), true);
});

QUnit.test("isValidPlate recusa a placa cortada do GAC-1190 e o que não é placa brasileira", function (assert) {
	assert.strictEqual(isValidPlate("CUD 1H5"), false, "CUD 1H57 cortado no 7º caractere");
	assert.strictEqual(isValidPlate("CUD1H5"), false);
	assert.strictEqual(isValidPlate("ABCD123"), false);
	assert.strictEqual(isValidPlate("ABC12345"), false);
	assert.strictEqual(isValidPlate("ABC1DD3"), false);
	assert.strictEqual(isValidPlate(""), false);
	assert.strictEqual(isValidPlate(null), false);
});
