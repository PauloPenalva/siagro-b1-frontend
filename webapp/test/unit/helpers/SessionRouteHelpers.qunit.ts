import { isPublicRoute, shouldOpenRequiredBranchDialog } from "siagrob1/helpers/SessionRouteHelpers";

const ready = { selecting: false, authenticated: true, branchCode: "", routeName: "main" };

QUnit.module("SessionRouteHelpers");

QUnit.test("login, esqueci a senha e redefinir senha são rotas públicas", function (assert) {
	assert.strictEqual(isPublicRoute("login"), true);
	assert.strictEqual(isPublicRoute("forgotPassword"), true);
	assert.strictEqual(isPublicRoute("resetPassword"), true);
	assert.strictEqual(isPublicRoute("main"), false);
	assert.strictEqual(isPublicRoute(""), false);
});

QUnit.test("abre o diálogo de filial na home de quem está logado e sem filial", function (assert) {
	assert.strictEqual(shouldOpenRequiredBranchDialog(ready), true);
});

QUnit.test("não abre o diálogo de filial sobre a tela de login, mesmo já autenticado", function (assert) {
	// O login avisa que a sessão ficou pronta antes de navegar para a home.
	assert.strictEqual(shouldOpenRequiredBranchDialog({ ...ready, routeName: "login" }), false);
	assert.strictEqual(shouldOpenRequiredBranchDialog({ ...ready, routeName: "forgotPassword" }), false);
	assert.strictEqual(shouldOpenRequiredBranchDialog({ ...ready, routeName: "resetPassword" }), false);
});

QUnit.test("não abre o diálogo de filial sem sessão, com filial, já aberto ou no cadastro de filial", function (assert) {
	assert.strictEqual(shouldOpenRequiredBranchDialog({ ...ready, authenticated: false }), false);
	assert.strictEqual(shouldOpenRequiredBranchDialog({ ...ready, branchCode: "01" }), false);
	assert.strictEqual(shouldOpenRequiredBranchDialog({ ...ready, selecting: true }), false);
	assert.strictEqual(shouldOpenRequiredBranchDialog({ ...ready, routeName: "branchsNew" }), false);
});
