import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
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
		this.getView().setModel(new JSONModel({ writeOff: {} }), "viewModel");
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

	private writeOffDialog?: Dialog;
	private writeOffDetailDialog?: Dialog;

	private static localIsoDate(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	async onOpenWriteOff(): Promise<void> {
		const table = this.byId("pendingTable") as Table;
		const contexts = table.getSelectedIndices()
			.map(i => table.getContextByIndex(i) as Context)
			.filter(Boolean);
		if (contexts.length < 1) {
			MessageBox.warning("Selecione ao menos 1 romaneio para baixar.");
			return;
		}
		const situations = [...new Set(contexts.map(c => c.getProperty("Situation") as string))];
		if (situations.length > 1) {
			MessageBox.warning("Selecione romaneios de uma mesma situação.");
			return;
		}
		const lines = contexts.map(c => ({
			key: c.getProperty("StorageTransactionKey") as string,
			code: c.getProperty("Code") as string,
			partner: `${c.getProperty("CardCode") as string} - ${c.getProperty("CardName") as string}`,
			balance: Number(c.getProperty("Balance")),
			weight: Number(c.getProperty("Balance")),
		}));
		(this.getModel("viewModel") as JSONModel).setProperty("/writeOff", {
			situationLabel: SITUATION_LABEL[situations[0]] ?? situations[0],
			writeOffDate: Main.localIsoDate(new Date()),
			itsId: "", taxId: "", name: "", comments: "",
			lines,
			totalText: "",
		});
		this.updateWriteOffTotal();
		this.writeOffDialog ??= await DialogHelper.createDialog(this, "siagrob1.view.royalties.fragments.WriteOffDialog");
		this.writeOffDialog.open();
	}

	onWriteOffWeightChange(): void { this.updateWriteOffTotal(); }

	private updateWriteOffTotal(): void {
		const vm = this.getModel("viewModel") as JSONModel;
		const lines = (vm.getProperty("/writeOff/lines") ?? []) as { weight: number }[];
		const total = lines.reduce((s, l) => s + (Number(l.weight) || 0), 0);
		vm.setProperty("/writeOff/totalText", new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(total));
	}

	onCloseWriteOff(): void { this.writeOffDialog?.close(); }

	async onConfirmWriteOff(): Promise<void> {
		const form = (this.getModel("viewModel") as JSONModel).getProperty("/writeOff") as {
			writeOffDate: string, itsId: string, taxId: string, name: string, comments: string,
			lines: { key: string, code: string, balance: number, weight: number }[],
		};
		if (!form.writeOffDate || !form.itsId?.trim() || !form.taxId?.trim() || !form.name?.trim()) {
			MessageBox.warning("Informe data, ID do ITS, CPF/CNPJ e nome.");
			return;
		}
		const invalid = form.lines.find(l => !(l.weight > 0) || l.weight > l.balance + 1e-9);
		if (invalid) {
			MessageBox.warning(`Peso inválido no romaneio ${invalid.code}: informe de 0 a ${invalid.balance} kg.`);
			return;
		}
		const action = (this.getModel() as ODataModel).bindContext(this.api.royaltyWriteOffsCreate);
		action.setParameter("WriteOffDate", form.writeOffDate);
		action.setParameter("ItsId", form.itsId.trim());
		action.setParameter("TaxId", form.taxId.trim());
		action.setParameter("Name", form.name.trim());
		// null explícito, nunca undefined: parâmetro do EDM que não chega derruba a action.
		action.setParameter("Comments", form.comments?.trim() || null);
		action.setParameter("StorageTransactionKeys", form.lines.map(l => l.key));
		action.setParameter("Weights", form.lines.map(l => Number(l.weight)));
		try {
			this.setBusy(true);
			await action.invoke();
			this.writeOffDialog?.close();
			MessageToast.show("Baixa ITS registrada.");
			(this.byId("pendingTable") as Table).clearSelection();
			this.onRefresh();
			this.onRefreshWriteOffs();
		} catch (err) {
			MessageBox.error((err as Error).message || "Erro ao registrar a baixa.");
		} finally {
			this.setBusy(false);
		}
	}

	onTabSelect(): void { this.onRefreshWriteOffs(); }

	onRefreshWriteOffs(): void {
		(this.byId("writeOffsTable").getBinding("rows") as ODataListBinding)?.refresh();
	}

	async onWriteOffDetail(): Promise<void> {
		const table = this.byId("writeOffsTable") as Table;
		const ctx = table.getContextByIndex(table.getSelectedIndex()) as Context;
		if (!ctx) {
			MessageBox.warning("Selecione uma baixa.");
			return;
		}
		this.writeOffDetailDialog ??= await DialogHelper.createDialog(this, "siagrob1.view.royalties.fragments.WriteOffDetailDialog");
		this.writeOffDetailDialog.setBindingContext(ctx);
		this.writeOffDetailDialog.open();
	}

	onCloseWriteOffDetail(): void { this.writeOffDetailDialog?.close(); }

	async onCancelWriteOff(): Promise<void> {
		const ctx = this.writeOffDetailDialog?.getBindingContext() as Context;
		if (!ctx) { return; }
		const confirmed = await new Promise<boolean>(resolve => MessageBox.confirm(
			`Cancelar a baixa ITS ${ctx.getProperty("ItsId") as string}? O saldo volta aos romaneios.`,
			{ onClose: (a: unknown) => resolve(a === MessageBox.Action.OK) }));
		if (!confirmed) { return; }
		const action = (this.getModel() as ODataModel).bindContext(this.api.royaltyWriteOffsCancel);
		action.setParameter("Key", ctx.getProperty("Key"));
		try {
			this.setBusy(true);
			await action.invoke();
			this.writeOffDetailDialog?.close();
			MessageToast.show("Baixa ITS cancelada.");
			this.onRefreshWriteOffs();
			this.onRefresh();
		} catch (err) {
			MessageBox.error((err as Error).message || "Erro ao cancelar a baixa.");
		} finally {
			this.setBusy(false);
		}
	}
}
