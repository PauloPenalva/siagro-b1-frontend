import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import formatter from "siagrob1/model/formatter";
import { attachOverflowTooltips } from "siagrob1/helpers/OverflowTooltipHelpers";

type UsageFilter = {
	Text: string, Code: string, Cfop: string, Direction: string,
	ContractBalanceEffects: string[], ConfiguredEffects: string, Situation: string,
};

/**
 * @namespace siagrob1.controller.usages
 */
export default class Main extends BaseController {
  formatter = { ...formatter }

	onInit(): void {
		this.getView().setModel(new JSONModel(Main.defaultFilter()), "filter");
		this.getRouter().getRoute("usages").attachPatternMatched(() => this.routeMatched())
		attachOverflowTooltips(this.byId("usagesTable") as Table);
	}

	private routeMatched() {
		void this.applyErpMode().then(() => this.applyFilters());
	}

	/** Começa só nas ativas; o rows do Main.view.xml traz o mesmo $filter para a 1ª carga já vir certa. */
	private static defaultFilter(): UsageFilter {
		return {
			Text: "", Code: "", Cfop: "", Direction: "",
			ContractBalanceEffects: [], ConfiguredEffects: "", Situation: "Active",
		};
	}

	private static literal(value: string): string {
		return `'${value.replace(/'/g, "''")}'`;
	}

	private rowsBinding(): ODataListBinding {
		return this.byId("usagesTable").getBinding("rows") as ODataListBinding;
	}

	/**
	 * $filter cru: Direction e ContractBalanceEffect são enum, e sap.ui.model.Filter não formata enum OData
	 * ("Unsupported type"). O CFOP mora em colunas diferentes conforme o tipo, então procura nas quatro.
	 */
	private applyFilters(): void {
		const f = (this.getModel("filter") as JSONModel).getData() as UsageFilter;
		const identityEditable = (this.getModel("ui") as JSONModel).getProperty("/identityEditable") === true;
		const parts: string[] = [];

		const text = f.Text?.trim();
		if (text) {
			const v = Main.literal(text);
			parts.push(`(contains(Name,${v}) or contains(Description,${v}))`);
		}
		const code = f.Code?.trim();
		if (code && /^\d+$/.test(code)) {
			parts.push(`Code eq ${code}`);
		}
		const cfop = f.Cfop?.trim();
		if (cfop) {
			const v = Main.literal(cfop);
			const columns = ["CfopOutgoingInState", "CfopOutgoingOutState", "CfopIncomingInState", "CfopIncomingOutState"];
			parts.push(`(${columns.map((c) => `contains(${c},${v})`).join(" or ")})`);
		}
		// O tipo não existe em SAPB1 (o OUSG não tem): o filtro some com o campo.
		if (identityEditable && f.Direction) {
			parts.push(`Direction eq ${Main.literal(f.Direction)}`);
		}
		if (f.ContractBalanceEffects?.length) {
			parts.push(`(${f.ContractBalanceEffects.map((e) => `ContractBalanceEffect eq ${Main.literal(e)}`).join(" or ")})`);
		}
		if (f.ConfiguredEffects) {
			parts.push(`HasConfiguredEffects eq ${f.ConfiguredEffects === "Yes"}`);
		}
		if (f.Situation) {
			parts.push(`Inactive eq ${f.Situation === "Inactive"}`);
		}

		this.rowsBinding()?.changeParameters({ $filter: parts.length ? parts.join(" and ") : undefined });
		(this.byId("usagesTable") as Table)?.clearSelection();
	}

	onSearch(): void {
		this.applyFilters();
	}

	onClearFilters(): void {
		(this.getModel("filter") as JSONModel).setData(Main.defaultFilter());
		this.applyFilters();
	}

	/**
	 * Em SAPB1 a natureza é cadastrada no SAP: aqui só se configura o efeito. Inicializar
	 * como `false` evita a armadilha do `visible` com binding indefinido, que valeria true e
	 * mostraria Incluir/Deletar por um instante antes da resposta.
	 */
	private async applyErpMode() {
		const uiModel = this.getModel("ui") as JSONModel;
		uiModel.setProperty("/identityEditable", false);

		const systemInfo = await this.getSystemInfo();
		uiModel.setProperty("/identityEditable", systemInfo?.erp !== "SAPB1");
	}

	onRefresh(): void {
		this.rowsBinding().refresh();
	}

	onCreate() {
		this.navTo("usagesNew");
	}

	/** Alíquotas de IBS/CBS por vigência (só STANDALONE — o botão some em SAPB1). */
	onOpenIbsCbsRates() {
		this.navTo("ibsCbsRates");
	}

	/** Alíquotas da contribuição social do produtor rural por vigência (só STANDALONE). */
	onOpenRuralContributionRates() {
		this.navTo("ruralContributionRates");
	}

	onDetail(): void {
		const oContext = this.getSelectRowContext(this.byId("usagesTable") as Table);
		if (!oContext) {
			MessageBox.alert("Selecione um item para visualizar.");
			return;
		}

		this.navTo("usagesDetail", { id: String(oContext.getProperty("Code")) });
	}

	onEdit(): void {
		const oTable = this.byId("usagesTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para editar.");
      return;
    }

		const oContext = oTable.getContextByIndex(i) as Context;

		const sId = oContext.getProperty("Code") as string;
		this.navTo("usagesEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("usagesTable") as Table;
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
