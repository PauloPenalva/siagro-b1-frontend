import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.companies
 */
export default class Edit extends BaseController {

	private code = "";
	private logoFile?: File;

	onInit(): void {
		this.getView().setModel(new JSONModel({ url: "", hasLogo: false }), "logo");
		this.getRouter().getRoute("companiesEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
		this.clearStates("companiesForm");
    this.setScreenModel(false);

    const oModel = this.getView().getModel() as ODataModel;
		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string};
		if (id != null) {
			this.code = id;
			this.clearLogoUploader();
			void this.loadLogo();
			oView.bindElement({
				path: `/Companies('${id}')`,
				events: {
					dataRequested: () => this.setBusy(true),
					dataReceived: () => this.setBusy(false),
				}
			})
		}
	}

	async onSave() {
		if (!this.validateForm("companiesForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;
		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				oModel.resetChanges(oModel.getUpdateGroupId())
				MessageToast.show("Empresa atualizada.", {
					closeOnBrowserNavigation: false
				});
			}
		} finally {
			this.setBusy(false);
		}
	}

	/* Logo */

	/** 204 = sem logo. O `?v=` força o browser a buscar de novo depois de uma troca. */
	private async loadLogo(): Promise<void> {
		const model = this.getView().getModel("logo") as JSONModel;
		model.setData({ url: "", hasLogo: false });
		try {
			const response = await fetch(ServerRoutes.companyLogo(this.code), { credentials: "same-origin" });
			if (response.status === 200) {
				model.setData({ url: `${ServerRoutes.companyLogo(this.code)}?v=${Date.now()}`, hasLogo: true });
			}
		} catch {
			// Sem prévia: o cadastro continua utilizável.
		}
	}

	onLogoSelected(ev: FileUploader$ChangeEvent): void {
		const files = ev.getParameter("files");
		this.logoFile = files?.length > 0 ? files[0] as File : undefined;
	}

	onLogoTypeMismatch(): void {
		this.logoFile = undefined;
		MessageBox.warning("Formato não suportado. Use PNG ou JPG.");
	}

	onLogoTooLarge(): void {
		this.logoFile = undefined;
		MessageBox.warning("O logo deve ter no máximo 1 MB.");
	}

	async onUploadLogo(): Promise<void> {
		if (!this.logoFile) {
			MessageBox.warning("Escolha uma imagem antes de enviar.");
			return;
		}
		const file = this.logoFile;
		try {
			this.setBusy(true);
			await new RequestModel().post(ServerRoutes.companyLogo(this.code), {
				ContentType: file.type,
				File: await this.toBase64(file)
			});
			this.clearLogoUploader();
			await this.loadLogo();
			MessageToast.show("Logo atualizado.");
		} catch (error) {
			this.showRequestError(error, "Falha ao enviar o logo.");
		} finally {
			this.setBusy(false);
		}
	}

	async onRemoveLogo(): Promise<void> {
		try {
			this.setBusy(true);
			await new RequestModel().delete(ServerRoutes.companyLogo(this.code));
			await this.loadLogo();
			MessageToast.show("Logo removido.");
		} catch (error) {
			this.showRequestError(error, "Falha ao remover o logo.");
		} finally {
			this.setBusy(false);
		}
	}

	private toBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				// readAsDataURL devolve "data:image/png;base64,..." e o servidor espera só o conteúdo.
				resolve(result.includes(",") ? result.split(",")[1] : result);
			};
			reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
			reader.readAsDataURL(file);
		});
	}

	/** O servidor responde a validação como texto puro (BadRequest(string)). */
	private showRequestError(error: unknown, fallback: string): void {
		const err = error as JQuery.jqXHR;
		const text = typeof err?.responseText === "string" ? err.responseText.replace(/^"|"$/g, "") : "";
		MessageBox.error(text && text.length < 300 ? text : fallback);
	}

	private clearLogoUploader(): void {
		this.logoFile = undefined;
		(this.byId("logoUploader") as FileUploader)?.setValue("");
	}

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}
}
