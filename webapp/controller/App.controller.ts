import ToolPage from "sap/tnt/ToolPage";
import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import { SideNavigation$ItemPressEvent } from "sap/tnt/SideNavigation";

/**
 * @namespace siagrob1.controller
 */
export default class App extends BaseController {
	private oModel: JSONModel;

	public onInit(): void {
		// apply content density mode to root view
		this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());

		this.oModel = new JSONModel();
		void this.oModel.loadData(sap.ui.require.toUrl("siagrob1/model/menu.json"))
			.then(() => this.getView().setModel(this.oModel,"menu"));
	}

	onHomePress(): void {
		this.getRouter().navTo("main");
	}

	onMenuButtonPress(): void {
		const toolPage = this.byId("toolPage") as ToolPage;

		toolPage.setSideExpanded(!toolPage.getSideExpanded());
	}

	onItemSelect(ev: SideNavigation$ItemPressEvent) : void {
		const item = ev.getParameter('item');
		this.navTo(item.getKey());
	}
}
