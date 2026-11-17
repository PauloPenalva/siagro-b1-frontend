import Main from "siagrob1/controller/Main.controller";
import BaseController from "siagrob1/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";

QUnit.module("Main controller");

QUnit.test("herda de BaseController", function (assert) {
	assert.ok(Main.prototype instanceof BaseController);
});

QUnit.test("expõe os formatters na instância", function (assert) {
	const oController = new Main("siagrob1.controller.Main");

	assert.strictEqual(typeof oController.formatter, "object");
	assert.strictEqual(typeof oController.formatter.formatContractType, "function");
});

type HomeState = { hidden: boolean; logoUrl: string; loading: boolean };
type LoadableMain = { getModel: () => JSONModel; loadCompanyHome: () => Promise<{ hasLogo?: boolean }>; load: () => Promise<void> };

/** Roda `load()` em modo SAPB1 com a resposta de /api/companies/current/home simulada. */
async function loadInSapMode(home: { hasLogo?: boolean }): Promise<HomeState> {
	const model = new JSONModel({ loading: false, loadedAt: "", hidden: false, logoUrl: "" });
	const controller = new Main("siagrob1.controller.Main") as unknown as LoadableMain;
	controller.getModel = () => model;
	controller.loadCompanyHome = () => Promise.resolve(home);

	const session = SessionService as unknown as { isAuthenticated: () => boolean; isSapMode: () => boolean };
	const original = { isAuthenticated: session.isAuthenticated, isSapMode: session.isSapMode };
	session.isAuthenticated = () => true;
	session.isSapMode = () => true;

	try {
		await controller.load();
	} finally {
		session.isAuthenticated = original.isAuthenticated;
		session.isSapMode = original.isSapMode;
	}

	return model.getData() as HomeState;
}

QUnit.test("em SAPB1 a home mostra o logo cadastrado da empresa", function (assert) {
	const done = assert.async();
	void loadInSapMode({ hasLogo: true }).then(state => {
		assert.strictEqual(state.hidden, true, "painel oculto");
		assert.ok(state.logoUrl.startsWith(ServerRoutes.currentCompanyLogo), "logo da empresa da sessão");
		done();
	});
});

QUnit.test("em SAPB1 sem logo cadastrado a home mostra o logo do Siagro", function (assert) {
	const done = assert.async();
	void loadInSapMode({}).then(state => {
		assert.strictEqual(state.hidden, true, "painel oculto");
		assert.strictEqual(state.logoUrl, "/assets/logo_siagro_principal.png");
		done();
	});
});
