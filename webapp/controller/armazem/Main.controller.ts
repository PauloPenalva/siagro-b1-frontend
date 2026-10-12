import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import formatter from "siagrob1/model/formatter";

/**
 * Lista de armazéns: parceiros de negócio marcados como "Armazém" (QryGroup23 = 'Y').
 * Incluir/editar é feito no cadastro do Parceiro de Negócio; aqui só o complemento.
 * @namespace siagrob1.controller.armazem
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void {
		this.getRouter().getRoute("armazens").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void {
		(this.getView().byId("tableArmazens").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Name", FilterOperator.Contains, query),
				new Filter("Code", FilterOperator.Contains, query),
			],
			and: false,
		});

		(this.getView().byId("tableArmazens").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onComplement(): void {
		const oTable = this.byId("tableArmazens") as Table;
		const oContext = this.getSelectRowContext(oTable);

		if (!oContext) {
			MessageBox.alert("Selecione um armazém.");
			return;
		}

		const sId = oContext.getProperty("Code") as string;
		this.navTo("armazensComplement", {id: sId});
	}
}
