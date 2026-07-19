import Main from "siagrob1/controller/Main.controller";
import BaseController from "siagrob1/controller/BaseController";

QUnit.module("Main controller");

QUnit.test("herda de BaseController", function (assert) {
	assert.ok(Main.prototype instanceof BaseController);
});

QUnit.test("expõe os formatters na instância", function (assert) {
	const oController = new Main("siagrob1.controller.Main");

	assert.strictEqual(typeof oController.formatter, "object");
	assert.strictEqual(typeof oController.formatter.formatContractType, "function");
});
