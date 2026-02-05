import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import Context from "sap/ui/model/odata/v4/Context";
import Input from "sap/m/Input";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import SalesContractsBaseController from "./SalesContractsBaseController";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default class Upload extends SalesContractsBaseController {

  file: File;

	onInit(): void  {	
		this.getRouter().getRoute("salesContractsUpload").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
    const description = this.byId("salesContractAttachmentDescription") as Input;
    const fileUpload = this.byId('salesContractAttachmentFileUploader') as FileUploader;
    description.setValue(undefined);
    fileUpload.setValue(undefined);
    
    const oModel = this.getView().getModel() as ODataModel;
		
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string };
		if (id != null) {
			const sPath = `/SalesContracts(${id})`;
			this.bindElement(sPath);
      return;
		}

	}

  handleValueChange(ev: FileUploader$ChangeEvent){
    if (ev.getParameter('files')?.length > 0) {
      this.file = ev.getParameter('files')[0] as File;
      return;
    }

    this.file = undefined;
  }

	onSend() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      throw new Error("Contexto não encontrado.");
    }

    const contractKey = ctx.getProperty("Key");
    const description = this.byId("salesContractAttachmentDescription") as Input;
    if (!description.getValue()){
      return;
    }
    const fileUpload = this.byId('salesContractAttachmentFileUploader') as FileUploader;
    if (!fileUpload.getValue()){
      return;
    }

    const filename = this.file.name;
    const contentType = this.file.type;
    
    const reader = new FileReader();
    reader.readAsDataURL(this.file);
    reader.onload = async () => {
        try {
          this.setBusy(true);
          const result = reader.result as string;

          const base64 = result.includes(",")
              ? result.split(",")[1]
              : result;   
          
          const payload = {
                ContractKey: contractKey,
                Description: description.getValue(),
                FileName: filename,
                ContentType: contentType,
                File: base64
            };     

          const response = await fetch(`odata/SalesContractsAttachmentUpload`,
              {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify(payload)
              }
          );

          if (!response.ok) {
              throw new Error("Erro ao enviar anexo");
          }

          this.onNavBack();
          MessageToast.show("Anexo enviado com sucesso !");
        } catch(e) {
          const err = e as Error;
          MessageBox.error(err.message);
        } finally {
          this.setBusy(false);
        }
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
