import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import CommonController from "../common/CommonController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import RequestModel from "siagrob1/model/RequestModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default abstract class PurchaseContractsBaseController extends CommonController {
  
  onUpload() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      throw new Error("Contexto não encontrado.");
    }

    const key = ctx.getProperty("Key") as string;
    this.navTo("purchaseContractsUpload", { id: key });
  }

  onDownload() {
    const table = this.byId("purchaseContractAttachmentsTable") as Table;
    const selected = table.getSelectedIndex();
    
    if (selected < 0) {
      MessageBox.alert("Selecione um item na tabela.");
      return;
    }

    const ctx = table.getContextByIndex(selected);
    const attachmentKey = ctx.getProperty("Key") as string;
    const fileName = ctx.getProperty("FileName") as string;

    const url =
            `/odata/PurchaseContractsAttachmentsDownload(Key=${attachmentKey})`;

        // Força download binário (sem OData serialization)
        fetch(url, {
            method: "GET"
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Erro ao baixar arquivo");
            }
            return response.blob();
        })
        .then(blob => {
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();

            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
        })
        .catch(() => {
            MessageToast.show("Erro ao baixar o anexo");
        });
  }

  async onDeleteAttachment() {
   
    const table = this.byId("purchaseContractAttachmentsTable") as Table;
    const selected = table.getSelectedIndex();
    
    if (selected < 0) {
      MessageBox.alert("Selecione um item na tabela.");
      return;
    }

    const ctx = table.getContextByIndex(selected);
    const attachmentKey = ctx.getProperty("Key") as string;

    const confirm = await DialogHelper.confirmDialog("Essa operação não podera ser desfeita.", "Deletar anexo",   )
    if (!confirm) {
      return;
    }

    await this.onDeleteAttachmentAction(attachmentKey);
  }

  async onDeleteAttachmentAction(attachmentKey: string) {
    const bindingContext = this.getView().getBindingContext() as Context;
    if (!bindingContext) {
      throw new Error("Contexto não encontrado.");
    }

    const key = bindingContext.getProperty("Key") as string;
    const requestModel = new RequestModel();

    try {
      this.setBusy(true);
      await requestModel.delete(`/odata/PurchaseContractsAttachments(${attachmentKey})`);
      this.getAttachments(key);
    } catch (e) {
      const err = e as Error;
      MessageBox.error(err.message);
    } finally {
      this.setBusy(false);
    }
  }


  onAddBroker() {
    const oTable = this.byId("purchaseContractsBrokersTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveBroker() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractsBrokersTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }
  
  onAddTax() {
    const oTable = this.byId("purchaseContractsTaxesTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveTax() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractsTaxesTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddPriceFixation() {
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({
      "Status": "Pending"
    }, false, true, false);
  }

  onRemovePriceFixation() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddQualityParameter() {
    const oTable = this.byId("purchaseContractQualityParameterTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveQualityParameter() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractQualityParameterTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  async onWithdrawApproval() {
    const oView = this.getView();
    const oContext = oView.getBindingContext() as Context;
    if (!oContext) {
      return;
    }
    const bConfirm = await confirmDialog("Retirar contrato da aprovação ?");
    if (bConfirm) {
    
      const key = oContext.getProperty("Key") as string;
      const sUrl = `${this.api.purchaseContractsWithdrawApproval}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () => { 
          oContext.refresh();
        },
        error: err => {
          this.setBusy(false);
          MessageBox.error((err.responseJSON as { error?: { message?: string } })?.error?.message);
        },
      })
      .done(() => this.setBusy(false))
    }
  }

  async onSendToApproval() {
    const oView = this.getView();
    const oContext = oView.getBindingContext() as Context;
    if (!oContext) {
      return;
    }
    const bConfirm = await confirmDialog("Enviar contrato para aprovação ?");
    if (bConfirm) {
    
      const key = oContext.getProperty("Key") as string;
      const sUrl = `${this.api.purchaseContractsSendToApproval}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () => { 
          oContext.refresh();
        },
        error: err => {
          this.setBusy(false);
          MessageBox.error((err.responseJSON as { error?: { message?: string } })?.error?.message);
        },
      })
      .done(() => this.setBusy(false))
    }
  }

  async onCloseContract() {
    const oView = this.getView();
    const oContext = oView.getBindingContext() as Context;
    if (!oContext) {
      return;
    }
    const bConfirm = await confirmDialog("Encerrar o contrato ? Após encerrado não será possível movimentá-lo.");
    if (bConfirm) {

      const key = oContext.getProperty("Key") as string;
      const sUrl = `${this.api.purchaseContractsClose}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () => {
          oContext.refresh();
        },
        error: err => {
          this.setBusy(false);
          const message = (err.responseJSON as { error?: { message?: string } })?.error?.message;
          MessageBox.error(message ?? "Erro ao encerrar o contrato.");
        },
      })
      .done(() => this.setBusy(false))
    }
  }

  async onReopenContract() {
    const oView = this.getView();
    const oContext = oView.getBindingContext() as Context;
    if (!oContext) {
      return;
    }
    const bConfirm = await confirmDialog("Reabrir o contrato ? Ele voltará a aceitar movimentação.");
    if (bConfirm) {

      const key = oContext.getProperty("Key") as string;
      const sUrl = `${this.api.purchaseContractsReopen}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () => {
          oContext.refresh();
        },
        error: err => {
          this.setBusy(false);
          const message = (err.responseJSON as { error?: { message?: string } })?.error?.message;
          MessageBox.error(message ?? "Erro ao reabrir o contrato.");
        },
      })
      .done(() => this.setBusy(false))
    }
  }

  getAllocations(key: string){
    const oView = this.getView();
    const allocationModel = new JSONModel();
    const oModel = this.getModel() as ODataModel;
    const funcImport = oModel.bindContext("/PurchaseContractsGetAllocationsByContract(...)");
    funcImport.setParameter("PurchaseContractKey", key);

    oView.setModel(allocationModel, "allocationModel");

    this.setBusy(true);
    void funcImport.invoke()
      .then(() => {
        const resultContext = funcImport.getBoundContext();
        const viewModel = this.getModel("allocationModel") as JSONModel
        viewModel.setData(resultContext.getObject() as object);
      })
      .finally(() => this.setBusy(false))
  }

  getAttachments(key: string){
    const oView = this.getView();
    const attachmentsModel = new JSONModel();
    const oModel = this.getModel() as ODataModel;
    const funcImport = oModel.bindContext("/PurchaseContractsAttachmentsListByContract(...)");
    funcImport.setParameter("ContractKey", key);

    oView.setModel(attachmentsModel, "attachmentsModel");

    this.setBusy(true);
    void funcImport.invoke()
      .then(() => {
        const resultContext = funcImport.getBoundContext();
        const viewModel = this.getModel("attachmentsModel") as JSONModel
        viewModel.setData(resultContext.getObject() as object);
      })
      .finally(() => this.setBusy(false))
  }
}
