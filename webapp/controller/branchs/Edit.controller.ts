import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { buildTransportSettingsPayload, shouldSaveTransport, TransportSettings } from "siagrob1/helpers/TransportHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import CommonController from "../common/CommonController";

/**
 * @namespace siagrob1.controller.branchs
 */
export default class Edit extends CommonController {

	onInit(): void {	
		this.getView().setModel(new JSONModel({}), "transport");
		this.getRouter().getRoute("branchsEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
		this.clearStates("formBranchs");
		const { id: branchId } = ev.getParameter("arguments") as { id: string };
		this.transport().setData({});
		this.transportLoaded = false;
		void this.refreshStandaloneFlag().then(() => this.isStandalone() ? this.loadTransport(branchId) : undefined);
		this.setThirdPartyReturnUsageDescription("");
    
    const oModel = this.getView().getModel() as ODataModel;
		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string};
		if (id != null) {
			const sPath = `/Branchs('${id}')`;
			oView.bindElement({
				path: sPath,
				events: {
					dataRequested: () => this.setBusy(true),
					dataReceived: () => {
						this.setBusy(false);
						const ctx = oView.getBindingContext();
						void this.loadThirdPartyReturnUsageDescription(ctx?.getProperty("ThirdPartyPurchaseReturnUsageCode") as number)
							.catch(() => this.setThirdPartyReturnUsageDescription(""));
					},
				}
			})
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("formBranchs")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;
		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				oModel.resetChanges(oModel.getUpdateGroupId())
				// A filial já foi gravada; se a transportadora falhar, a tela fica aberta com a mensagem.
				if (shouldSaveTransport(this.isStandalone(), this.transportLoaded) && !(await this.saveTransport())) {
					return;
				}
				MessageToast.show("Dados atualizados com sucesso.", {
					closeOnBrowserNavigation: false
				});
			}
		} finally {
			this.setBusy(false);
		}
		
	}

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}

	/** A leitura da transportadora deu certo; sem ela a gravação apagaria a configuração. */
	private transportLoaded = false;

	private transport(): JSONModel {
		return this.getView().getModel("transport") as JSONModel;
	}

	private isStandalone(): boolean {
		return (this.getModel("ui") as JSONModel)?.getProperty("/standalone") === true;
	}

	private branchCode(): string {
		return this.getView().getBindingContext()?.getProperty("Code") as string;
	}

	private async loadTransport(branchCode: string): Promise<void> {
		const result = await sendJson("GET", `${ServerRoutes.branchTransportSettingsGet}(BranchCode='${encodeURIComponent(branchCode)}')`);
		if (!result.ok) {
			MessageBox.error(result.message);
			return;
		}
		this.transport().setData({ ...odataValue<TransportSettings>(result.data), AverbaPassword: "" });
		this.transportLoaded = true;
	}

	private async saveTransport(): Promise<boolean> {
		const code = this.branchCode();
		const result = await sendJson("POST", ServerRoutes.branchTransportSettingsSave,
			buildTransportSettingsPayload(code, this.transport().getData() as TransportSettings));
		if (!result.ok) {
			MessageBox.error(`Filial gravada, mas a transportadora não: ${result.message}`);
			return false;
		}
		this.transport().setData({ ...odataValue<TransportSettings>(result.data), AverbaPassword: "" });
		return true;
	}

	/** Só o login na AT&M, com o que está na tela (senha vazia usa a gravada). Não grava nada. */
	async onTestAverba(): Promise<void> {
		const payload = buildTransportSettingsPayload(this.branchCode(), this.transport().getData() as TransportSettings);
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.branchTransportSettingsTestAverba, {
				BranchCode: payload.BranchCode,
				AverbaUser: payload.AverbaUser,
				AverbaPassword: payload.AverbaPassword,
				AverbaCode: payload.AverbaCode,
				AverbaEnvironment: payload.AverbaEnvironment,
			});
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const test = odataValue<{ Success: boolean; Message: string }>(result.data);
			if (test.Success) {
				MessageToast.show(test.Message);
			} else {
				MessageBox.error(test.Message);
			}
		} finally {
			this.setBusy(false);
		}
	}
}
