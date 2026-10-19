import {
	LAST_COMPANY_KEY,
	pickInitialCompany,
	recallCompany,
	rememberCompany,
	shouldShowCompanySelect
} from "siagrob1/helpers/CompanySelectionHelpers";
import { CompanyOption } from "siagrob1/types/Company";

const CEAGUI: CompanyOption = { code: "0001", companyName: "CEAGUI" };
const LM: CompanyOption = { code: "0002", companyName: "LM CEREAIS" };

QUnit.module("CompanySelectionHelpers - seletor de empresa do login", {
	beforeEach: () => window.localStorage.removeItem(LAST_COMPANY_KEY),
	afterEach: () => window.localStorage.removeItem(LAST_COMPANY_KEY)
});

QUnit.test("pickInitialCompany prefere a última empresa usada, se ela ainda existir", function (assert) {
	assert.strictEqual(pickInitialCompany([CEAGUI, LM], "0002"), "0002");
	assert.strictEqual(pickInitialCompany([CEAGUI, LM], "9999"), "0001", "empresa lembrada que sumiu: cai na primeira");
	assert.strictEqual(pickInitialCompany([CEAGUI, LM], null), "0001");
	assert.strictEqual(pickInitialCompany([LM], undefined), "0002");
});

QUnit.test("pickInitialCompany devolve vazio sem empresas (lista indisponível ainda deixa logar)", function (assert) {
	assert.strictEqual(pickInitialCompany([], "0001"), "");
	assert.strictEqual(pickInitialCompany(undefined, "0001"), "");
});

QUnit.test("shouldShowCompanySelect sempre que houver empresa, mesmo uma só", function (assert) {
	assert.strictEqual(shouldShowCompanySelect([CEAGUI, LM]), true);
	assert.strictEqual(shouldShowCompanySelect([CEAGUI]), true, "uma empresa: o usuário vê em qual vai entrar");
	assert.strictEqual(shouldShowCompanySelect([]), false);
	assert.strictEqual(shouldShowCompanySelect(undefined), false);
});

QUnit.test("rememberCompany/recallCompany guardam a última empresa no localStorage", function (assert) {
	assert.strictEqual(recallCompany(), null);
	rememberCompany("0002");
	assert.strictEqual(recallCompany(), "0002");
	rememberCompany(undefined);
	assert.strictEqual(recallCompany(), "0002", "código vazio não apaga a lembrança");
});
