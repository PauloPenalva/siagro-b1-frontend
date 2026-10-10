import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CommonController from "../common/CommonController";

type RoyaltyFilter = {
	FromDate?: string, ToDate?: string, Situation?: string, CardCode?: string,
	OriginCode?: string, ItemCode?: string, StorageAddressCode?: string,
};
type RoyaltyTotal = { Situation: string, Count: number, Balance: number };

const SITUATION_LABEL: Record<string, string> = {
	Declared: "Declarada", Tested: "Testada", Conventional: "Convencional", ParticipantWarehouse: "Armazém Participante",
};

/**
 * Royalties ITS: o que falta baixar no site da Bayer (aba Pendentes) e as baixas registradas (aba Baixas).
 * @namespace siagrob1.controller.royalties
 */
export default class Main extends CommonController {
	onInit(): void {
		this.createFilterModel(Main.defaultFilter());
		this.getView().setModel(new JSONModel({ summary: "" }), "totals");
		this.getRouter().getRoute("royaltyWriteOffs").attachPatternMatched(() => this.onRouteMatched());
	}

	/** Mês corrente: datas locais, nunca toISOString (vira o dia seguinte depois das 21h). */
	private static defaultFilter(): RoyaltyFilter {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
		const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		return { FromDate: first, ToDate: today, Situation: "", CardCode: "", OriginCode: "", ItemCode: "", StorageAddressCode: "" };
	}

	private onRouteMatched(): void {
		this.applyFilters();
	}

	protected pendingBinding(): ODataListBinding {
		return this.byId("pendingTable").getBinding("rows") as ODataListBinding;
	}

	protected filterData(): RoyaltyFilter {
		return (this.getModel("filter") as JSONModel).getData() as RoyaltyFilter;
	}

	private static literal(value: string): string {
		return `'${String(value).replace(/'/g, "''")}'`;
	}

	/** Deslocamento local no formato OData ("-03:00"); o limite do dia é o do usuário, não o UTC. */
	private static localOffset(): string {
		const minutes = -new Date().getTimezoneOffset();
		const sign = minutes < 0 ? "-" : "+";
		const abs = Math.abs(minutes);
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
	}

	/** $filter cru: sap.ui.model.Filter não formata enum OData ("Unsupported type"). */
	protected applyFilters(): void {
		const f = this.filterData();
		const parts = ["Balance gt 0"];
		const offset = Main.localOffset();
		if (f.FromDate) { parts.push(`TransactionDate ge ${f.FromDate}T00:00:00${offset}`); }
		if (f.ToDate) { parts.push(`TransactionDate le ${f.ToDate}T23:59:59${offset}`); }
		if (f.Situation) { parts.push(`Situation eq ${Main.literal(f.Situation)}`); }
		if (f.CardCode) { parts.push(`CardCode eq ${Main.literal(f.CardCode)}`); }
		if (f.OriginCode) { parts.push(`RoyaltyOriginCode eq ${Main.literal(f.OriginCode)}`); }
		if (f.ItemCode) { parts.push(`ItemCode eq ${Main.literal(f.ItemCode)}`); }
		if (f.StorageAddressCode) { parts.push(`StorageAddressCode eq ${Main.literal(f.StorageAddressCode)}`); }
		this.pendingBinding()?.changeParameters({ $filter: parts.join(" and ") });
		(this.byId("pendingTable") as Table)?.clearSelection();
		void this.loadTotals();
	}

	private totalsRequest = 0;

	private async loadTotals(): Promise<void> {
		const request = ++this.totalsRequest;
		const f = this.filterData();
		const arg = (v?: string) => (v ? Main.literal(v) : "null");
		const path = `${this.api.royaltyBalanceTotals}(FromDate=${arg(f.FromDate)},ToDate=${arg(f.ToDate)},` +
			`CardCode=${arg(f.CardCode)},OriginCode=${arg(f.OriginCode)},ItemCode=${arg(f.ItemCode)},` +
			`Situation=${arg(f.Situation)},StorageAddressCode=${arg(f.StorageAddressCode)})`;
		try {
			const ctx = (this.getModel() as ODataModel).bindContext(path);
			const result = await ctx.requestObject() as { value?: RoyaltyTotal[] };
			const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
			if (request !== this.totalsRequest) { return; }
			const summary = (result?.value ?? [])
				.map(t => `${SITUATION_LABEL[t.Situation] ?? t.Situation}: ${fmt.format(t.Balance)} kg (${t.Count})`)
				.join("   |   ");
			(this.getModel("totals") as JSONModel).setProperty("/summary", summary || "Nenhum saldo pendente.");
		} catch {
			if (request !== this.totalsRequest) { return; }
			(this.getModel("totals") as JSONModel).setProperty("/summary", "Não foi possível carregar os totais.");
		}
	}

	onSearch(): void { this.applyFilters(); }
	onClearFilters(): void { this.clearFilters(); this.applyFilters(); }
	onRefresh(): void { this.pendingBinding()?.refresh(); void this.loadTotals(); }

	async onPrintPdf(): Promise<void> {
		const f = this.filterData();
		if (!f.FromDate || !f.ToDate) {
			MessageBox.warning("Informe o período de entrada.");
			return;
		}
		const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v]));
		try {
			this.setBusy(true);
			const response = await fetch(this.api.royaltyPendingReport, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				throw new Error((await response.text()) || "Falha ao gerar relatório.");
			}
			const fileURL = URL.createObjectURL(await response.blob());
			window.open(fileURL, "_blank");
			setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
		} catch (error) {
			MessageBox.error((error as Error)?.message);
		} finally {
			this.setBusy(false);
		}
	}

	onTabSelect(): void { /* a aba Baixas aplica o próprio filtro na Task 16 */ }

	/** Implementado na Task 16. */
	onOpenWriteOff(): void { /* Task 16 */ }
}
