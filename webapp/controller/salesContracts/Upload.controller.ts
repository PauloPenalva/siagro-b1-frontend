import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import Input from "sap/m/Input";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import SalesContractsBaseController from "./SalesContractsBaseController";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default class Upload extends SalesContractsBaseController {

  file: File;

  /**
   * Chave do contrato, lida da ROTA. Não vem do contexto da view de propósito: o `bindElement`
   * é assíncrono e pode falhar, e `getProperty("Key")` devolve `undefined` sem esperar — era o
   * que montava um payload sem `ContractKey` e derrubava o envio com 404, de forma intermitente.
   */
  contractKey: string;

	onInit(): void  {
		this.getRouter().getRoute("salesContractsUpload").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
    const description = this.byId("salesContractAttachmentDescription") as Input;
    const fileUpload = this.byId('salesContractAttachmentFileUploader') as FileUploader;
    description.setValue(undefined);
    fileUpload.setValue(undefined);
    // O controller é reusado entre visitas à tela: sem limpar aqui, o arquivo escolhido na
    // visita anterior continuaria em memória.
    this.file = undefined;

    const oModel = this.getView().getModel() as ODataModel;
		
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string };
		this.contractKey = id;

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
    const contractKey = this.contractKey;
    if (!contractKey) {
      MessageBox.error("Contrato não identificado. Volte à lista e abra o anexo novamente.");
      return;
    }

    const description = this.byId("salesContractAttachmentDescription") as Input;
    if (!description.getValue()){
      return;
    }
    const fileUpload = this.byId('salesContractAttachmentFileUploader') as FileUploader;
    if (!fileUpload.getValue() || !this.file){
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

          const response = await fetch(`/odata/SalesContractsAttachmentUpload`,
              {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify(payload)
              }
          );

          if (!response.ok) {
              // O corpo da resposta traz o motivo real — o backend responde `BadRequest(e.Message)`
              // ou `NotFound(e.Message)`. Sem ele o usuário só via o texto genérico e não havia
              // como diagnosticar a falha nem pelo relato nem pelo log.
              const detail = await this.readErrorMessage(response);
              throw new Error(detail
                  ? `Erro ao enviar anexo (${response.status}): ${detail}`
                  : `Erro ao enviar anexo (${response.status}).`);
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

  /**
   * Extrai a mensagem de negócio do corpo de erro. O backend responde no envelope do OData
   * (`{"error":{"message":"..."}}`) — mostrar o JSON cru numa MessageBox não ajuda o usuário.
   */
  private async readErrorMessage(response: Response): Promise<string> {
    const body = (await response.text())?.trim();
    if (!body) {
      return "";
    }

    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      return parsed?.error?.message ?? body;
    } catch {
      return body;
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
