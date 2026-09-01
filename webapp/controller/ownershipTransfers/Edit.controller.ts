import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.ownershipTransfers
 */
export default class Edit extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("ownershipTransfersEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
        
		this.clearStates("ownershipTransferForm");
    
    const oModel = this.getView().getModel() as ODataModel;
		
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string };
		if (id != null) {
			const sPath = `/OwnershipTransfers(${id})`;
			// $expand dos dois lotes: a habilitação do contrato depende da classificação
			// de propriedade de ambos, e sem o expand ela não vem no GET-by-key.
			this.bindElement(sPath, {
				$expand: "StorageAddressOrigin($select=Code,OwnershipType,WarehouseCode),"
					+ "StorageAddressDestination($select=Code,OwnershipType)"
			});

			// Só depois que os dados chegam: antes disso as propriedades dos lotes
			// ainda não existem no contexto.
			this.getView().getObjectBinding()
				?.attachEventOnce("dataReceived", (): void => {
					void this.applyContractAvailability();
				});
			return;
		}

	}

	/** Reavalia se o contrato pode ser vinculado, a partir da classificação dos lotes. */
	private async applyContractAvailability() {
		const oContext = this.getView().getBindingContext() as Context;
		if (!oContext) return;

		const originType = oContext.getProperty("StorageAddressOrigin/OwnershipType") as string;
		const destinationType = oContext.getProperty("StorageAddressDestination/OwnershipType") as string;

		const enabled = this.isOwnStockLot(destinationType) && !this.isOwnStockLot(originType);
		this.setContractEnabled(enabled);

		// Destino deixou de ser estoque próprio (reclassificação do lote): o vínculo
		// não pode sobreviver escondido num campo desabilitado.
		if (!enabled) {
			await this.clearPurchaseContract(oContext);
		}
	}

	async onSave() {
		if (!this.validateForm("ownershipTransferForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;
		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				oModel.resetChanges(oModel.getUpdateGroupId())
				this.navToDetail();
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

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("ownershipTransfersDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
