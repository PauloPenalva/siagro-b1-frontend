import Dialog from "sap/m/Dialog";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Sorter from "sap/ui/model/Sorter";
import Form from "sap/ui/layout/form/Form";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { anyOfFilter } from "siagrob1/helpers/FilterHelpers";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { SIGNATORY_ROLE_OPTIONS } from "siagrob1/model/contractDrafts";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

const SIGNATORIES_TABLE = "businessPartnerSignatoriesTable";

/**
 * Grupo de atualização PRÓPRIO dos signatários.
 *
 * O modelo grava no grupo `UpdateGroup` do manifest, e o Salvar/Cancelar da ficha do parceiro
 * age sobre ele. Sem um grupo separado, Cancelar no diálogo do signatário jogaria fora também
 * os campos do parceiro que a pessoa ainda não gravou, e Salvar no diálogo gravaria o parceiro
 * junto. Signatário é agregado à parte — grava e descarta sozinho.
 */
const SIGNATORIES_GROUP = "BusinessPartnerSignatoriesGroup";

/**
 * @namespace siagrob1.controller.parceirosNegocio
 */
export default class Edit extends BaseController {
	formatter = { ...formatter };

	private signatoryDialog: Dialog;
	private cardCode: string;

	onInit(): void {
		this.getView().setModel(new JSONModel({ roles: SIGNATORY_ROLE_OPTIONS }), "options");
		this.getRouter().getRoute("parceirosNegocioEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
		this.clearStates("businessPartnerForm");

    const oModel = this.getView().getModel() as ODataModel;
		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		if (oModel.hasPendingChanges(SIGNATORIES_GROUP)) {
			oModel.resetChanges(SIGNATORIES_GROUP);
		}

		const {id} = ev.getParameter("arguments") as {id: string};
		if (id != null) {
			const sPath = `/BusinessPartners('${id}')`;
			oView.bindElement({
				path: sPath,
				events: {
					dataRequested: () => this.setBusy(true),
					dataReceived: () => this.setBusy(false),
				}
			})

			this.cardCode = id;
			this.bindSignatories(id);
			return;
		}

	}

	/**
	 * Ligação ABSOLUTA e filtrada por CardCode: `BusinessPartnerSignatory` não é navegação do
	 * parceiro — a tabela é nossa, sem FK, para valer também em modo SAPB1, onde a
	 * BUSINESS_PARTNERS local está vazia. `$$ownRequest` dá cache próprio à tabela; sem ele o
	 * `refresh()` depois de gravar não re-lê.
	 */
	private bindSignatories(cardCode: string) {
		const oTable = this.byId(SIGNATORIES_TABLE) as Table;

		oTable.bindRows({
			path: "/BusinessPartnerSignatories",
			parameters: {
				$filter: anyOfFilter("CardCode", [cardCode]),
				$$ownRequest: true,
				$$updateGroupId: SIGNATORIES_GROUP,
			},
			sorter: [new Sorter("Order"), new Sorter("Name")],
		});
	}

	private signatoriesBinding(): ODataListBinding {
		return (this.byId(SIGNATORIES_TABLE) as Table).getBinding("rows") as ODataListBinding;
	}

	private selectedSignatory(): Context {
		const oTable = this.byId(SIGNATORIES_TABLE) as Table;
		const index = oTable.getSelectedIndices()[0] ?? -1;

		return index < 0 ? undefined : (oTable.getContextByIndex(index) as Context);
	}

	/**
	 * Pelo conteúdo do diálogo, e não por `Fragment.byId`: o DialogHelper prefixa os ids com
	 * `idDaView_nomeDoFragmento`, e reproduzir esse prefixo aqui quebraria calado se ele mudasse
	 * lá. O Form é o primeiro e único filho de `content`.
	 */
	private signatoryForm(): Form {
		return this.signatoryDialog?.getContent()[0] as Form;
	}

	private async openSignatoryDialog(oContext: Context, title: string) {
		(this.getModel("viewModel") as JSONModel).setProperty("/signatoryDialog", { title });

		this.signatoryDialog ??= await DialogHelper.createDialog(
			this, "siagrob1.view.parceirosNegocio.fragments.BusinessPartnerSignatoryDialog");

		// O diálogo é dependent da view e herdaria o contexto do PARCEIRO; o signatário é
		// apontado explicitamente.
		this.signatoryDialog.setBindingContext(oContext);
		clearFieldStates(this.signatoryForm());
		this.signatoryDialog.open();
	}

	async onAddSignatory() {
		if (!this.cardCode) {
			MessageBox.alert("Grave o parceiro antes de incluir signatários.");
			return;
		}

		// Toda propriedade editável entra no create(), mesmo vazia: o ODataModel v4 recusa
		// alterar propriedade que ainda não foi lida ("Must not change a property before it has
		// been read") e o erro só aparece quando a pessoa digita no campo.
		const oContext = this.signatoriesBinding().create(
			{
				CardCode: this.cardCode,
				Name: "",
				TaxId: "",
				Email: "",
				Role: "SignAsParty",
				Order: 0,
				Active: true,
			},
			false,
			true,
			false
		);

		await this.openSignatoryDialog(oContext, "Novo signatário");
	}

	async onEditSignatory() {
		const oContext = this.selectedSignatory();

		if (!oContext) {
			MessageBox.alert("Selecione um item para editar.");
			return;
		}

		await this.openSignatoryDialog(oContext, "Editar signatário");
	}

	async onConfirmSignatory() {
		if (!validateRequiredFields(this.signatoryForm())) {
			MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
			return;
		}

		const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(SIGNATORIES_GROUP);

			// Alteração que sobra é alteração recusada pelo servidor: o diálogo fica aberto com
			// o que a pessoa digitou, e a mensagem de erro do modelo já apareceu.
			if (oModel.hasPendingChanges(SIGNATORIES_GROUP)) {
				return;
			}

			this.signatoryDialog.close();
			MessageToast.show("Signatário gravado.", { closeOnBrowserNavigation: false });
		} finally {
			this.setBusy(false);
		}
	}

	onCancelSignatory() {
		const oModel = this.getView().getModel() as ODataModel;

		// Descarta só o signatário: o grupo é dele. Numa inclusão, isto também remove da tabela
		// a linha transitória que o create() acabou de pôr.
		if (oModel.hasPendingChanges(SIGNATORIES_GROUP)) {
			oModel.resetChanges(SIGNATORIES_GROUP);
		}

		this.signatoryDialog.close();
	}

	async onDeleteSignatory() {
		const oContext = this.selectedSignatory();

		if (!oContext) {
			MessageBox.alert("Selecione um item para excluir.");
			return;
		}

		if (!await confirmDialog("Deseja realmente excluir este signatário ?", "Excluir signatário ?")) {
			return;
		}

		const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oContext.delete(SIGNATORIES_GROUP);
			await oModel.submitBatch(SIGNATORIES_GROUP);

			if (!oModel.hasPendingChanges(SIGNATORIES_GROUP)) {
				MessageToast.show("Signatário excluído.", { closeOnBrowserNavigation: false });
			}
		} finally {
			this.setBusy(false);
		}
	}

	async onSave() {
		if (!this.validateForm("businessPartnerForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;
		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				oModel.resetChanges(oModel.getUpdateGroupId())
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
}
