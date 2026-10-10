import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import type InputBase from "sap/m/InputBase";
import { ValueState } from "sap/ui/core/library";
import Table from "sap/ui/table/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import CommonController from "../common/CommonController";

type RoyaltyFilter = {
	FromDate?: string, ToDate?: string, Situation?: string, CardCode?: string,
	OriginCode?: string, ItemCode?: string, StorageAddressCode?: string, Scope?: string,
};
type WriteOffFilter = { FromDate: string, ToDate: string, ItsId: string, TaxId: string, Situation: string };
type RoyaltyTotal = { Situation: string, Count: number, Balance: number, WrittenOffWeight?: number };

const SCOPE_TITLE: Record<string, string> = {
	Pending: "A baixar", WrittenOff: "Baixados", All: "Baixados e a baixar",
};

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
		this.getView().setModel(new JSONModel({ summary: "", title: SCOPE_TITLE.Pending }), "totals");
		this.getView().setModel(new JSONModel({ writeOff: {} }), "viewModel");
		this.getView().setModel(new JSONModel(Main.emptyWriteOffFilter()), "writeOffFilter");
		this.getRouter().getRoute("royaltyWriteOffs").attachPatternMatched(() => this.onRouteMatched());
	}

	/** Mês corrente: datas locais, nunca toISOString (vira o dia seguinte depois das 21h). */
	private static defaultFilter(): RoyaltyFilter {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
		const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		return { FromDate: first, ToDate: today, Situation: "", CardCode: "", OriginCode: "", ItemCode: "", StorageAddressCode: "", Scope: "Pending" };
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
		const scope = f.Scope || "Pending";
		const parts: string[] = [];
		if (scope === "Pending") { parts.push("Balance gt 0"); }
		else if (scope === "WrittenOff") { parts.push("Balance le 0 and WrittenOffWeight gt 0"); }
		const offset = Main.localOffset();
		if (f.FromDate) { parts.push(`TransactionDate ge ${f.FromDate}T00:00:00${offset}`); }
		if (f.ToDate) { parts.push(`TransactionDate le ${f.ToDate}T23:59:59${offset}`); }
		if (f.Situation) { parts.push(`Situation eq ${Main.literal(f.Situation)}`); }
		if (f.CardCode) { parts.push(`CardCode eq ${Main.literal(f.CardCode)}`); }
		if (f.OriginCode) { parts.push(`RoyaltyOriginCode eq ${Main.literal(f.OriginCode)}`); }
		if (f.ItemCode) { parts.push(`ItemCode eq ${Main.literal(f.ItemCode)}`); }
		if (f.StorageAddressCode) { parts.push(`StorageAddressCode eq ${Main.literal(f.StorageAddressCode)}`); }
		(this.getModel("totals") as JSONModel).setProperty("/title", SCOPE_TITLE[scope] ?? SCOPE_TITLE.Pending);
		this.pendingBinding()?.changeParameters({ $filter: parts.length ? parts.join(" and ") : undefined });
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
			`Situation=${arg(f.Situation)},StorageAddressCode=${arg(f.StorageAddressCode)},Scope=${arg(f.Scope || "Pending")})`;
		try {
			const ctx = (this.getModel() as ODataModel).bindContext(path);
			const result = await ctx.requestObject() as { value?: RoyaltyTotal[] };
			const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
			if (request !== this.totalsRequest) { return; }
			const scope = f.Scope || "Pending";
			const describe = (t: RoyaltyTotal) => {
				const written = fmt.format(t.WrittenOffWeight ?? 0);
				if (scope === "WrittenOff") { return `baixado ${written} kg`; }
				if (scope === "All") { return `baixado ${written} · saldo ${fmt.format(t.Balance)} kg`; }
				return `${fmt.format(t.Balance)} kg`;
			};
			const summary = (result?.value ?? [])
				.map(t => `${SITUATION_LABEL[t.Situation] ?? t.Situation}: ${describe(t)} (${t.Count})`)
				.join("   |   ");
			(this.getModel("totals") as JSONModel).setProperty("/summary",
				summary || (scope === "WrittenOff" ? "Nenhum romaneio baixado." : scope === "All" ? "Nenhum romaneio." : "Nenhum saldo pendente."));
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

	/** Pesos em kg têm 3 casas; o saldo vem do banco com ruído de ponto flutuante. */
	private static round3(value: number): number {
		return Math.round(value * 1000) / 1000;
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
		// Recusa a seleção inteira se alguma linha não tem saldo (mais simples e previsível que descartar em silêncio).
		if (contexts.some(c => !(Number(c.getProperty("Balance")) > 0))) {
			MessageBox.warning("Selecione romaneios com saldo a baixar.");
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
			balance: Main.round3(Number(c.getProperty("Balance"))),
			weight: Main.round3(Number(c.getProperty("Balance"))),
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
		// Valor digitado que o tipo Float não consegue interpretar deixa o model com o valor antigo
		// (o saldo inteiro): não pode seguir adiante.
		const hasParseError = this.writeOffDialog?.findAggregatedObjects(true, c => c.isA("sap.m.InputBase"))
			.some(c => (c as InputBase).getValueState() === ValueState.Error);
		if (hasParseError) {
			MessageBox.warning("Corrija o peso a baixar das linhas destacadas.");
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
		} catch {
			// A mensagem do servidor já aparece pelo handler global de mensagens OData; o diálogo
			// continua aberto para o usuário corrigir.
		} finally {
			this.setBusy(false);
		}
	}

	private static emptyWriteOffFilter(): WriteOffFilter {
		return { FromDate: "", ToDate: "", ItsId: "", TaxId: "", Situation: "" };
	}

	/** $filter cru das baixas: WriteOffDate é Edm.Date (literal sem aspas) e enum nunca vai por sap.ui.model.Filter. */
	onFilterWriteOffs(): void {
		const f = (this.getModel("writeOffFilter") as JSONModel).getData() as WriteOffFilter;
		const parts: string[] = [];
		if (f.FromDate) { parts.push(`WriteOffDate ge ${f.FromDate}`); }
		if (f.ToDate) { parts.push(`WriteOffDate le ${f.ToDate}`); }
		if (f.ItsId?.trim()) { parts.push(`contains(ItsId,${Main.literal(f.ItsId.trim())})`); }
		// O CPF/CNPJ é gravado em maiúsculas, sem pontuação (CNPJ alfanumérico): ignora a máscara digitada.
		const digits = (f.TaxId ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
		if (digits) { parts.push(`contains(TaxId,${Main.literal(digits)})`); }
		if (f.Situation) { parts.push(`Situation eq ${Main.literal(f.Situation)}`); }
		(this.byId("writeOffsTable").getBinding("rows") as ODataListBinding)
			?.changeParameters({ $filter: parts.length ? parts.join(" and ") : undefined });
	}

	onClearWriteOffFilter(): void {
		(this.getModel("writeOffFilter") as JSONModel).setData(Main.emptyWriteOffFilter());
		this.onFilterWriteOffs();
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
		} catch {
			// A mensagem do servidor já aparece pelo handler global de mensagens OData; o diálogo
			// de detalhe continua aberto.
		} finally {
			this.setBusy(false);
		}
	}
}
