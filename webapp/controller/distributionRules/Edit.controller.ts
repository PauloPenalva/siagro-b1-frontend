import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import { ListBase$SelectionChangeEvent } from "sap/m/ListBase";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import {
	Rule, RuleVersion, buildSaveVersionBody, formatIsoDateBr, isVersionEditable,
	normalizeRule, todayInBrasilia, validateRuleLines, versionStatus, versionStatusText
} from "siagrob1/helpers/DistributionRuleHelpers";
import DistributionRulesBaseController from "./DistributionRulesBaseController";

/** Versão como o model `rule` a guarda: dados do servidor + campos de exibição. */
type VersionRow = RuleVersion & {
	ValidFromText: string;
	Status: string;
	StatusText: string;
	IsSelected: boolean;
};

/**
 * @namespace siagrob1.controller.distributionRules
 */
export default class Edit extends DistributionRulesBaseController {

	private newVersionDialog: Dialog;

	onInit(): void {
		this.getView().setModel(new JSONModel(), "rule");
		this.getRouter().getRoute("distributionRulesEdit").attachPatternMatched((ev) => void this.editRouteMatched(ev));
	}

	private async editRouteMatched(ev: Route$PatternMatchedEvent) {
		const { id } = ev.getParameter("arguments") as { id: string };
		await this.loadRule(id);
	}

	private async loadRule(code: string, selectDate?: string) {
		this.setBusy(true);
		try {
			const url = `/odata/DistributionRules('${encodeURIComponent(code)}')?$expand=Versions($expand=Lines)`;
			const result = await sendJson("GET", url);

			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}

			const rule = normalizeRule(odataValue<Record<string, unknown>>(result.data));
			this.fillModel(rule, selectDate);
		} finally {
			this.setBusy(false);
		}
	}

	private fillModel(rule: Rule, selectDate?: string) {
		const today = todayInBrasilia();

		this.ruleModel().setData({
			Header: {
				Code: rule.Code,
				Name: rule.Name,
				Inactive: rule.Inactive
			},
			Today: today,
			Versions: this.decorate(rule.Versions, today),
			Selected: {},
			Lines: [],
			Editable: false,
			Total: 0,
			TotalOk: false,
			TotalText: ""
		});

		// Abre na versão pedida; senão na vigente (ou na primeira, se todas forem futuras).
		const rows = this.versions();
		const wanted = rows.findIndex(v => v.ValidFrom === selectDate);
		const current = rows.findIndex(v => v.Status === "Current");
		this.selectVersion(wanted >= 0 ? wanted : current >= 0 ? current : 0);
	}

	private decorate(versions: RuleVersion[], today: string): VersionRow[] {
		return versions.map(v => {
			const status = versionStatus(versions, v.ValidFrom, today);
			return {
				...v,
				ValidFromText: formatIsoDateBr(v.ValidFrom),
				Status: status,
				StatusText: versionStatusText(status),
				IsSelected: false
			};
		});
	}

	private versions(): VersionRow[] {
		return (this.ruleModel().getProperty("/Versions") as VersionRow[]) ?? [];
	}

	private selectedIndex(): number {
		return this.versions().findIndex(v => v.IsSelected);
	}

	/** Mostra as linhas da versão `index`; só versões futuras ficam editáveis. */
	private selectVersion(index: number) {
		const model = this.ruleModel();
		const versions = this.versions();

		// Linhas de uma versão nova ainda não gravada sobrevivem à troca de versão em tela.
		const leaving = versions.find(v => v.IsSelected);
		if (leaving?.IsNew) {
			leaving.Lines = this.lines().map(l => ({ ...l }));
		}

		versions.forEach((v, i) => (v.IsSelected = i === index));
		model.setProperty("/Versions", versions);

		const version = versions[index];

		if (!version) {
			model.setProperty("/Selected", {});
			model.setProperty("/Lines", []);
			model.setProperty("/Editable", false);
		} else {
			model.setProperty("/Selected", { ValidFrom: version.ValidFrom, Id: version.Id, IsNew: !!version.IsNew });
			model.setProperty("/Lines", version.Lines.map(l => ({ ...l })));
			model.setProperty("/Editable", isVersionEditable(version.ValidFrom, model.getProperty("/Today") as string));
		}

		this.recomputeTotal();
	}

	onVersionSelected(ev: ListBase$SelectionChangeEvent) {
		const path = ev.getParameter("listItem").getBindingContext("rule").getPath();
		this.selectVersion(Number(path.split("/").pop()));
	}

	async onSaveHeader() {
		const header = this.ruleModel().getProperty("/Header") as { Code: string; Name: string; Inactive: boolean };

		if (!header.Name?.trim()) {
			MessageBox.warning("Informe o nome da regra.");
			return;
		}

		this.setBusy(true);
		try {
			const result = await sendJson("PATCH", `/odata/DistributionRules('${encodeURIComponent(header.Code)}')`,
				{ Name: header.Name.trim(), Inactive: header.Inactive });

			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}

			MessageToast.show("Dados atualizados com sucesso.", { closeOnBrowserNavigation: false });
		} finally {
			this.setBusy(false);
		}
	}

	async onNewVersion() {
		this.ruleModel().setProperty("/NewVersionDate", "");

		this.newVersionDialog ??= await Fragment.load({
			id: this.getView().getId(),
			name: "siagrob1.view.distributionRules.fragments.NewVersionDialog",
			controller: this
		}) as Dialog;

		this.getView().addDependent(this.newVersionDialog);
		this.newVersionDialog.open();
	}

	onNewVersionCancel() {
		this.newVersionDialog.close();
	}

	onNewVersionConfirm() {
		const model = this.ruleModel();
		const date = model.getProperty("/NewVersionDate") as string;
		const today = model.getProperty("/Today") as string;

		if (!date) {
			MessageBox.warning("Informe a data de início da nova versão.");
			return;
		}

		if (!isVersionEditable(date, today)) {
			MessageBox.warning("A nova versão deve começar depois de hoje; versões passadas não podem ser criadas.");
			return;
		}

		// Parte das linhas da versão em tela; uma futura com a mesma data é substituída (como no servidor).
		const source = this.versions()[this.selectedIndex()] ?? this.versions()[this.versions().length - 1];
		const kept = this.versions().filter(v => v.ValidFrom !== date);
		const created: RuleVersion = {
			ValidFrom: date,
			Lines: (source?.Lines ?? []).map(l => ({ ...l })),
			IsNew: true
		};
		const all = [...kept, created].sort((a, b) => a.ValidFrom.localeCompare(b.ValidFrom));
		const rows = this.decorate(all, today);

		model.setProperty("/Versions", rows);
		this.newVersionDialog.close();
		this.selectVersion(rows.findIndex(v => v.ValidFrom === date));
	}

	async onSaveVersion() {
		const model = this.ruleModel();
		const code = model.getProperty("/Header/Code") as string;
		const validFrom = model.getProperty("/Selected/ValidFrom") as string;
		const lines = this.lines();

		const problem = validateRuleLines(lines);
		if (problem) {
			MessageBox.warning(problem);
			return;
		}

		this.setBusy(true);
		try {
			const result = await sendJson("POST", "/odata/DistributionRulesSaveVersion",
				buildSaveVersionBody(code, validFrom, lines));

			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}

			MessageToast.show("Versão salva com sucesso.", { closeOnBrowserNavigation: false });
			await this.loadRule(code, validFrom);
		} finally {
			this.setBusy(false);
		}
	}

	async onDeleteVersion() {
		const model = this.ruleModel();
		const version = this.versions()[this.selectedIndex()];

		if (!version) {
			MessageBox.alert("Selecione uma versão para excluir.");
			return;
		}

		if (!model.getProperty("/Editable")) {
			MessageBox.alert("Somente versões futuras podem ser excluídas.");
			return;
		}

		if (!(await confirmDialog("Deseja realmente excluir esta versão ?", "Excluir versão ?"))) {
			return;
		}

		const code = model.getProperty("/Header/Code") as string;

		// Versão ainda não gravada: basta descartar da tela.
		if (version.IsNew || !version.Id) {
			const rest = this.versions().filter(v => v !== version);
			model.setProperty("/Versions", rest);
			this.selectVersion(Math.max(0, rest.findIndex(v => v.Status === "Current")));
			return;
		}

		this.setBusy(true);
		try {
			const result = await sendJson("POST", "/odata/DistributionRulesDeleteVersion", { VersionId: version.Id });

			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}

			MessageToast.show("Versão excluída.", { closeOnBrowserNavigation: false });
			await this.loadRule(code);
		} finally {
			this.setBusy(false);
		}
	}

	onCancel(): void {
		this.onNavBack();
	}
}
