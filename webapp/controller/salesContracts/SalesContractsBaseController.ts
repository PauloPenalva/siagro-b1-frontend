import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import Dialog from "sap/m/Dialog";
import Context from "sap/ui/model/odata/v4/Context";
import CommonController from "../common/CommonController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import RequestModel from "siagrob1/model/RequestModel";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default abstract class SalesContractsBaseController extends CommonController {
  
  onUpload() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      throw new Error("Contexto não encontrado.");
    }

    const key = ctx.getProperty("Key") as string;
    this.navTo("salesContractsUpload", { id: key });
  }

  onDownload() {
    const table = this.byId("salesContractAttachmentsTable") as Table;
    const selected = table.getSelectedIndex();
    
    if (selected < 0) {
      MessageBox.alert("Selecione um item na tabela.");
      return;
    }

    const ctx = table.getContextByIndex(selected);
    const attachmentKey = ctx.getProperty("Key") as string;
    const fileName = ctx.getProperty("FileName") as string;

    const url =
            `/odata/SalesContractsAttachmentsDownload(Key=${attachmentKey})`;

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
   
    const table = this.byId("salesContractAttachmentsTable") as Table;
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
      await requestModel.delete(`/odata/SalesContractsAttachments(${attachmentKey})`);
      this.getAttachments(key);
    } catch (e) {
      const err = e as Error;
      MessageBox.error(err.message);
    } finally {
      this.setBusy(false);
    }
  }

  private _priceFixationDialog: Dialog;
  private _priceFixationDetailsDialog: Dialog;

  /**
   * Abre o diálogo somente-leitura com todos os dados da fixação selecionada
   * (vencimento financeiro, dados para pagamento, comentários da aprovação). Espelha
   * PurchaseContractsBaseController.onViewPriceFixationDetails.
   */
  async onViewPriceFixationDetails() {
    const oTable = this.byId("salesContractPriceFixationsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione uma fixação para ver os detalhes.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);

    this._priceFixationDetailsDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesContracts.fragments.PriceFixationDetailsDialog"
    );

    this._priceFixationDetailsDialog.setBindingContext(ctx);
    this._priceFixationDetailsDialog.open();
  }

  onClosePriceFixationDetailsDialog() {
    this._priceFixationDetailsDialog?.close();
  }

  /**
   * Abre o diálogo de fixação de preço. Só faz sentido em contrato a fixar (PAF):
   * o botão que chama isto já é invisível em contrato de preço fixo.
   */
  async onOpenPriceFixationDialog() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.alert("Contrato não carregado.");
      return;
    }

    const viewModel = this.getModel("viewModel") as JSONModel;

    // Saldo a fixar do próprio contrato (auxílio visual — a guarda real é do servidor,
    // em SalesContractsPriceFixationCreateService). requestProperty garante o valor
    // mesmo que a propriedade computada não tenha vindo no $select da tela.
    const available = Number((await ctx.requestProperty("AvailableVolumeToPricing")) ?? 0);

    viewModel.setProperty("/fixationAvailableVolume", available);
    viewModel.setProperty("/fixationDate", new Date());
    viewModel.setProperty("/fixationVolume", 0);
    viewModel.setProperty("/fixationPrice", 0);
    viewModel.setProperty("/fixationFreightCost", 0);
    viewModel.setProperty("/fixationFinancialDueDate", null);
    viewModel.setProperty("/fixationPaymentDetails", "");

    this._priceFixationDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesContracts.fragments.PriceFixationDialog"
    );

    this._priceFixationDialog?.open();
  }

  onClosePriceFixationDialog() {
    this._priceFixationDialog?.close();
  }

  onConfirmPriceFixation() {
    const viewModel = this.getModel("viewModel") as JSONModel;

    const volume = (viewModel.getProperty("/fixationVolume") as number) ?? 0;
    const price = (viewModel.getProperty("/fixationPrice") as number) ?? 0;
    const available = (viewModel.getProperty("/fixationAvailableVolume") as number) ?? 0;

    if (volume <= 0) {
      MessageBox.error("Volume da fixação deve ser maior que zero.");
      return;
    }

    if (price <= 0) {
      MessageBox.error("Preço da fixação deve ser maior que zero.");
      return;
    }

    if (volume > available) {
      MessageBox.error(
        `Volume excede o saldo disponível para fixação (${available.toLocaleString("pt-BR")} kg).`
      );
      return;
    }

    const contractKey = (this.getView().getBindingContext() as Context)
      .getProperty("Key") as string;

    this.onClosePriceFixationDialog();
    this.setBusy(true);

    this.invokePriceFixationCreate(contractKey, {
      FixationDate: viewModel.getProperty("/fixationDate") as Date,
      FixationVolume: volume,
      FixationPrice: price,
      FreightCost: (viewModel.getProperty("/fixationFreightCost") as number) ?? 0,
      FinancialDueDate: (viewModel.getProperty("/fixationFinancialDueDate") as Date) ?? null,
      PaymentDetails: (viewModel.getProperty("/fixationPaymentDetails") as string) ?? "",
    })
      .then(() => {
        MessageToast.show("Fixação enviada para aprovação da diretoria.");
        this.refreshContractTotals();
        this.refreshPriceFixationsList();
      })
      .catch((err: Error) => {
        MessageBox.error(err.message || "Erro ao registrar fixação.");
      })
      .finally(() => this.setBusy(false));
  }

  private async invokePriceFixationCreate(
    contractKey: string,
    fixation: {
      FixationDate: Date;
      FixationVolume: number;
      FixationPrice: number;
      FreightCost: number;
      FinancialDueDate: Date | null;
      PaymentDetails: string;
    }
  ): Promise<void> {
    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(this.api.salesContractsPriceFixationCreate);
    action.setParameter("SalesContractKey", contractKey);
    action.setParameter("Fixation", fixation);
    await action.invoke();
  }

  /**
   * Recarrega apenas a binding da tabela de fixações após uma action que grava por fora
   * do cache do modelo. A tabela usa `$$ownRequest: true`, então tem cache próprio e
   * pode ser refrescada isoladamente sem arrastar outras tabelas da tela.
   */
  private refreshPriceFixationsList() {
    const oBinding = (this.byId("salesContractPriceFixationsTable") as Table)
      .getBinding("rows") as ODataListBinding;
    oBinding?.refresh();
  }

  /**
   * Estorna uma fixação confirmada: desfaz a aprovação e a devolve para "Em Aprovação".
   * Fixação já em aprovação não se estorna — é rejeitada pela diretoria na fila, ou
   * excluída aqui.
   */
  async onCancelPriceFixation() {
    const oTable = this.byId("salesContractPriceFixationsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione uma fixação para estornar.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);
    const status = ctx.getProperty("Status") as string;

    if (status !== "Confirmed") {
      MessageBox.error(
        "Só é possível estornar fixação confirmada. " +
        "Fixação em aprovação deve ser rejeitada pela diretoria ou excluída."
      );
      return;
    }

    const confirmed = await confirmDialog(
      "Confirma o estorno desta fixação? Ela volta para a fila de aprovação da diretoria.",
      "Estornar Fixação"
    );

    if (!confirmed) {
      return;
    }

    this.setBusy(true);

    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(this.api.salesContractsPriceFixationCancel);
    action.setParameter("Key", ctx.getProperty("Key") as string);

    try {
      await action.invoke();
      MessageToast.show("Fixação estornada — voltou para aprovação.");
      this.refreshPriceFixationsList();
      this.refreshContractTotals();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao estornar fixação.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Exclui uma fixação ainda em aprovação, devolvendo o volume ao saldo a fixar.
   * Fixação confirmada não se exclui — estorna-se primeiro.
   */
  async onDeletePriceFixation() {
    const oTable = this.byId("salesContractPriceFixationsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione uma fixação para excluir.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);
    const status = ctx.getProperty("Status") as string;

    if (status !== "InApproval") {
      MessageBox.error(
        "Só é possível excluir fixação em aprovação. " +
        "Estorne a fixação confirmada antes de excluí-la."
      );
      return;
    }

    const volume = Number(ctx.getProperty("FixationVolume") ?? 0);
    const confirmed = await confirmDialog(
      `Excluir a fixação de ${volume.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg? ` +
      "O volume volta para o saldo a fixar.",
      "Excluir Fixação"
    );

    if (!confirmed) {
      return;
    }

    const fixationKey = ctx.getProperty("Key") as string;

    this.setBusy(true);

    try {
      const oModel = this.getView().getModel() as ODataModel;
      const action = oModel.bindContext(this.api.salesContractsPriceFixationDelete);
      action.setParameter("Key", fixationKey);
      await action.invoke();

      MessageToast.show("Fixação excluída.");
      this.refreshContractTotals();
      this.refreshPriceFixationsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao excluir fixação.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Gera o espelho da fixação selecionada em PDF: comprovante enviado ao cliente
   * confirmando o preço fixado. Só faz sentido para fixação confirmada — o backend
   * recusa as demais, mas checamos antes para dar mensagem melhor que um 400.
   */
  async onPrintPriceFixation() {
    const oTable = this.byId("salesContractPriceFixationsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione uma fixação para emitir o espelho.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);

    if ((ctx.getProperty("Status") as string) !== "Confirmed") {
      MessageBox.error(
        "O espelho só é emitido para fixação confirmada — é um comprovante de " +
        "compromisso firmado com o cliente."
      );
      return;
    }

    const key = ctx.getProperty("Key") as string;

    try {
      this.setBusy(true);

      const response = await fetch(`${this.api.salesPriceFixationReport}/${key}/print`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Falha ao gerar o espelho de fixação.");
      }

      const blob = await response.blob();
      const fileURL = URL.createObjectURL(blob);
      window.open(fileURL, "_blank");
      setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
    } catch (error) {
      MessageBox.error((error as Error)?.message ?? "Falha ao gerar o espelho de fixação.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Recarrega os totais do contrato (Total Fixado, Saldo a fixar) após uma operação de
   * fixação. O header liga esses valores direto ao contexto OData do contrato, então
   * refrescar o contexto atualiza a tela. Erros são exibidos: número desatualizado sem
   * aviso é pior que uma mensagem.
   */
  private refreshContractTotals() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error(
        "Contrato não está carregado: os saldos podem estar desatualizados. Recarregue a tela."
      );
      return;
    }

    const key = ctx.getProperty("Key") as string;
    const viewModel = this.getModel("viewModel") as JSONModel;

    // Refresca o contexto OData para o próximo saldo do diálogo (FixedVolume /
    // AvailableVolumeToPricing são colunas escalares) refletir a mudança.
    ctx.refresh();

    // Total Fixado vem de SalesContractsGetTotals (com Include das fixações), não do
    // computed do contexto OData — recarrega no viewModel ao qual o header está ligado.
    new RequestModel({ Key: key })
      .get<{ TotalPrice?: number; TotalVolume?: number }>(
        this.api.salesContractsGetTotals.replace("$", key)
      )
      .then((data) => {
        viewModel.setProperty("/TotalPrice", data.TotalPrice ?? 0);
      })
      .fail(() => {
        MessageBox.error(
          "Falha ao atualizar o Total Fixado. Recarregue a tela para ver o valor correto."
        );
      });
  }

  onAddQualityParameter() {
    const oTable = this.byId("salesContractQualityParameterTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveQualityParameter() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("salesContractQualityParameterTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddDeliveryLocation() {
    const oTable = this.byId("salesContractDeliveryLocationsTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveDeliveryLocation() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("salesContractDeliveryLocationsTable") as Table;
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
      const sUrl = `${this.api.salesContractsWithdrawApproval}`

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
      const sUrl = `${this.api.salesContractsSendToApproval}`

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

   getInvoices(key: string){
      const oView = this.getView();
      const invoicesModel = new JSONModel();
      const oModel = this.getModel() as ODataModel;
      const funcImport = oModel.bindContext("/SalesContractsGetAllocationsByContract(...)");
      funcImport.setParameter("SalesContractKey", key);
  
      oView.setModel(invoicesModel, "invoicesModel");
  
      this.setBusy(true);
      void funcImport.invoke()
        .then(() => {
          const resultContext = funcImport.getBoundContext();
          const viewModel = this.getModel("invoicesModel") as JSONModel
          viewModel.setData(resultContext.getObject() as object);
        })
        .finally(() => this.setBusy(false))
    }

    getAttachments(key: string){
        const oView = this.getView();
        const attachmentsModel = new JSONModel();
        const oModel = this.getModel() as ODataModel;
        const funcImport = oModel.bindContext("/SalesContractsAttachmentsListByContract(...)");
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
