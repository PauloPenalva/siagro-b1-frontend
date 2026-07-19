import Opa5 from "sap/ui/test/Opa5";

const viewName = "siagrob1.view.App";

/**
 * Smoke test da casca da aplicação.
 *
 * Ancorado na view raiz (`App`), e não na tela de login: se já houver sessão
 * ativa o componente vai direto para a home, e um teste preso ao login
 * passaria ou falharia conforme o estado do cookie.
 */
export default class AppPage extends Opa5 {
	// Assertions
	iShouldSeeTheAppShell() {
		this.waitFor({
			id: "toolPage",
			viewName,
			success: () => {
				Opa5.assert.ok(true, "A casca da aplicação (ToolPage) foi renderizada");
			},
			errorMessage: "Não encontrei o ToolPage na view raiz da aplicação"
		});
	}

	iShouldSeeTheNavigationContainer() {
		this.waitFor({
			id: "app",
			viewName,
			success: () => {
				Opa5.assert.ok(true, "O container de navegação está presente");
			},
			errorMessage: "Não encontrei o container de navegação (App) na view raiz"
		});
	}
}
