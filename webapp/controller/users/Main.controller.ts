import SearchField from "sap/m/SearchField";
import CheckBox from "sap/m/CheckBox";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import { buildUserListFilters } from "siagrob1/helpers/UserListFilters";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.users
 */
export default class Main extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("users").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void {
		(this.getView().byId("tableUsers").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(): void {
		this.applyFilters();
	}

	onToggleInactive(): void {
		this.applyFilters();
	}

	/**
	 * Pesquisa e "Mostrar inativos" são reaplicados juntos: `filter()` substitui os filtros de
	 * aplicação do binding, então aplicar só um apagaria o outro.
	 */
	private applyFilters(): void {
		const query = (this.byId("searchUsers") as SearchField).getValue();
		const showInactive = (this.byId("showInactiveUsers") as CheckBox).getSelected();

		(this.byId("tableUsers").getBinding("rows") as ODataListBinding)
			.filter(buildUserListFilters(query, showInactive));
	}

	onCreate() {
			this.navTo("usersNew");
	}

	/**
	 * Espelha o cadastro de usuários do SAP (OUSR) sem esperar a varredura periódica.
	 *
	 * Só aparece em modo SAPB1; a action responde 400 nos demais.
	 */
	async onSyncFromSap(): Promise<void> {
		if (!await confirmDialog(
			"Os usuários serão criados e atualizados a partir do cadastro do SAP. Continuar ?",
			"Sincronizar com o SAP")) {
			return;
		}

		try {
			this.setBusy(true);

			const model = this.getView().getModel() as ODataModel;
			// Action sem parâmetro: o "(...)" é obrigatório no bindContext, senão o UI5 monta uma
			// URL que o OData não reconhece.
			const action = model.bindContext(ServerRoutes.usersSyncFromSap);

			await action.invoke();

			const result = action.getBoundContext()?.getObject() as { message?: string };

			MessageBox.information(result?.message ?? "Sincronização concluída.");
			this.onRefresh();
		} catch (error) {
			MessageBox.error((error as Error).message || "Falha ao sincronizar os usuários com o SAP.");
			console.warn("Falha ao sincronizar os usuários com o SAP.", error);
		} finally {
			this.setBusy(false);
		}
	}

	onEdit(): void {
		const oTable = this.byId("tableUsers") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para editar.");
      return;
    }
    
		const oContext = oTable.getContextByIndex(i) as Context;
    
		const sId = oContext.getProperty("Id") as string;
		this.navTo("usersEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableUsers") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para deletar.");
      return;
    }

		const oBindingContext = oTable.getContextByIndex(i) as Context;

		if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
			try{
				this.setBusy(true)
	
				await oBindingContext.delete("$auto");
	
				await oModel.submitBatch(oModel.getUpdateGroupId())
					
				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					MessageBox.information("Registro deletado.")
				}
			} finally {
				this.setBusy(false)
			}
		}

	}
}
