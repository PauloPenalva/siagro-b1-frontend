import opaTest from "sap/ui/test/opaQunit";
import AppPage from "./pages/AppPage";

const onTheApp = new AppPage();

QUnit.module("App Journey");

opaTest("A aplicação inicia e renderiza a casca", function () {
	// Arrangements
	onTheApp.iStartMyUIComponent({
		componentConfig: {
			name: "siagrob1"
		}
	});

	// Assertions
	onTheApp.iShouldSeeTheAppShell();
	onTheApp.iShouldSeeTheNavigationContainer();

	// Cleanup
	onTheApp.iTeardownMyApp();
});
