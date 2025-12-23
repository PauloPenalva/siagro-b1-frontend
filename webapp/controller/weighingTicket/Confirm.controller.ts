import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import GenericController from "./GenericController";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";


/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class Confirm extends GenericController {

	onInit(): void | undefined {	
		this.getRouter().getRoute("weighingTicketsConfirm").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private routeMatched(ev: Route$MatchedEvent) {
		this.clearStates("formCreateWeighingTicket");
    
    const oModel = this.getView().getModel() as ODataModel;
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/showField", true);

		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string | null};
		if (id != null) {
      const sPath = `/WeighingTickets(${id})`;
      this.bindElement(sPath);
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("formCreateWeighingTicket")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    if (!await DialogHelper.confirmDialog("Criar romaneio ?")){
      return;
    }
    
    const context = this.getView().getBindingContext();

    const payload = context.getObject() as any;
    delete payload["@odata.context"];
    delete payload["GrossWeight"];

    const qualityInspections = payload.QualityInspections.map( (x: any) => { 
      return {
        Key: x.Key,
        Value: +x.Value, 
        QualityAttribCode: x.QualityAttribCode
      } 
    });
    payload.QualityInspections = qualityInspections;

    console.log(payload);
    
    const model = this.getModel() as ODataModel;
    const action = model.bindContext("/WeighingTicketsCompleted(...)")
    action.setParameter("Key", context.getProperty("Key"));
    action.setParameter("WeighingTicket", payload);

    this.setBusy(true);
    void action.invoke()
      .then(() => {
          MessageToast.show("Romaneio criado com sucesso.");
          this.onNavBack();
      })
      .finally(() => this.setBusy(false))
		
	}

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}
}
