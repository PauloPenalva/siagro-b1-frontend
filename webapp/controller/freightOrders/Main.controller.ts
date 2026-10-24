import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import GridTable from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import {
	FREIGHT_ORDER_STATUSES, FreightOrdersFilter, balanceTonsText, buildFreightOrdersFilter, dateText,
	freightOrderStatusState, freightOrderStatusText, tonsText,
} from "siagrob1/helpers/FreightOrderHelpers";
import BaseController from "../BaseController";

/**
 * Lista de ordens de frete (TMS, só STANDALONE). Filtros vão como $filter cru (Status é enum).
 * @namespace siagrob1.controller.freightOrders
 */
export default class Main extends BaseController {
	statusText = freightOrderStatusText;
	statusState = freightOrderStatusState;
	tonsText = tonsText;
	balanceTonsText = balanceTonsText;
	dateText = dateText;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "filter");
		this.getView().setModel(new JSONModel(FREIGHT_ORDER_STATUSES), "statuses");
		this.getRouter().getRoute("freightOrders").attachPatternMatched(() => {
			void this.refreshStandaloneFlag();
			this.applyFilters();
		});
	}

	private filter(): JSONModel {
		return this.getView().getModel("filter") as JSONModel;
	}

	private binding(): ODataListBinding {
		return this.byId("tableFreightOrders").getBinding("rows") as ODataListBinding;
	}

	private applyFilters(): void {
		this.binding()?.changeParameters({ $filter: buildFreightOrdersFilter(this.filter().getData() as FreightOrdersFilter) });
	}

	onSearch(): void {
		this.applyFilters();
	}

	onClearFilters(): void {
		this.filter().setData({});
		this.applyFilters();
	}

	onRefresh(): void {
		this.binding()?.refresh();
	}

	async onPickTaker(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"]);
		if (ctx) {
			this.filter().setProperty("/TakerCardCode", ctx.getProperty("CardCode"));
			this.filter().setProperty("/TakerName", ctx.getProperty("CardName"));
		}
	}

	async onPickItem(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "ItemsSelectDialog", ["ItemCode", "ItemName"]);
		if (ctx) {
			this.filter().setProperty("/ItemCode", ctx.getProperty("ItemCode"));
			this.filter().setProperty("/ItemName", ctx.getProperty("ItemName"));
		}
	}

	onCreate(): void {
		this.navTo("freightOrdersNew");
	}

	onDetail(): void {
		const table = this.byId("tableFreightOrders") as GridTable;
		const index = table.getSelectedIndices()[0];
		if (index === undefined) {
			MessageBox.alert("Selecione uma ordem de frete para visualizar.");
			return;
		}
		const ctx = table.getContextByIndex(index) as Context;
		this.navTo("freightOrdersDetail", { id: ctx.getProperty("Key") as string });
	}
}
