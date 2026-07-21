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

  private _priceFixationDialog: Dialog;
  private _priceFixationDetailsDialog: Dialog;

  /**
   * Abre o diálogo somente-leitura com todos os dados da fixação selecionada,
   * inclusive vencimento financeiro, dados para pagamento e comentários da aprovação
   * — campos longos que não cabem bem na tabela. Funciona também em modo readonly.
   */
  async onViewPriceFixationDetails() {
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione uma fixação para ver os detalhes.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);

    this._priceFixationDetailsDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.purchaseContracts.fragments.PriceFixationDetailsDialog"
    );

    // Binding context da fixação selecionada: o diálogo usa caminhos relativos.
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

    // O saldo vem de PurchaseContractsTotals, que Detail.controller já carrega
    // em /AvailableVolumeToPricing. É só um auxílio visual — a guarda real é
    // a do servidor, em PurchaseContractsPriceFixationsCreateService.
    viewModel.setProperty(
      "/fixationAvailableVolume",
      (viewModel.getProperty("/AvailableVolumeToPricing") as number) ?? 0
    );
    viewModel.setProperty("/fixationDate", new Date());
    viewModel.setProperty("/fixationVolume", 0);
    viewModel.setProperty("/fixationPrice", 0);
    viewModel.setProperty("/fixationFreightCost", 0);
    viewModel.setProperty("/fixationFinancialDueDate", null);
    viewModel.setProperty("/fixationPaymentDetails", "");

    this._priceFixationDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.purchaseContracts.fragments.PriceFixationDialog"
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

    // Invoca a action PurchaseContractsPriceFixationCreate pelo ODataModel, no mesmo
    // padrão de aprovar/rejeitar/estornar. A entidade Fixation vai como parâmetro de
    // entidade; a action devolve a fixação criada e em seguida recarregamos a lista
    // para a linha nova aparecer sem recarregar a rota.
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
    const action = oModel.bindContext(this.api.purchaseContractsPriceFixationCreate);
    action.setParameter("PurchaseContractKey", contractKey);
    action.setParameter("Fixation", fixation);
    await action.invoke();
  }

  /**
   * Recarrega a lista de fixações após uma action (criar/excluir/estornar) que grava
   * no servidor por fora do cache do modelo.
   *
   * A tabela de fixações usa `$$ownRequest: true` (ver o fragmento), então ela tem
   * cache próprio e pode ser refrescada isoladamente. Sem isso, `refresh()` na list
   * binding relativa não re-lê — foi o que motivou o antigo `model.refresh()`, que
   * atualizava mas arrastava TODAS as sap.ui.table.Table da tela e disparava, de forma
   * intermitente, o "Cannot read properties of undefined (reading 'slice')" — a corrida
   * do v4 quando o aContexts de outra tabela fica indefinido durante o render.
   * Refrescar só esta binding evita esse efeito colateral.
   */
  private refreshPriceFixationsList() {
    const oBinding = (this.byId("purchaseContractPriceFixationsTable") as Table)
      .getBinding("rows") as ODataListBinding;
    oBinding?.refresh();
  }

  /**
   * Estorna uma fixação confirmada: desfaz a aprovação e a devolve para "Em Aprovação".
   * Fixação já em aprovação não se estorna — é rejeitada pela diretoria na fila, ou
   * excluída aqui.
   */
  async onCancelPriceFixation() {
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
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

    // bindContext + invoke em vez de jQuery.ajax: a action roda através do ODataModel,
    // que reconhece a mudança e atualiza a linha na tabela sem recarregar a rota.
    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(this.api.purchaseContractsPriceFixationCancel);
    action.setParameter("Key", ctx.getProperty("Key") as string);

    try {
      await action.invoke();
      // Recarrega a lista (não só a linha): a action grava por fora do cache, e o
      // refresh da binding com $$ownRequest re-lê o status "Em Aprovação" na hora.
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
   * Fixação confirmada não se exclui — estorna-se primeiro, o que a devolve
   * para InApproval e a torna excluível.
   */
  async onDeletePriceFixation() {
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
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

    // Invoca a action PurchaseContractsPriceFixationDelete pelo ODataModel, no mesmo
    // padrão de criar/estornar/aprovar. A action exclui no servidor; em seguida
    // recarregamos a lista para a linha sumir sem recarregar a rota.
    try {
      const oModel = this.getView().getModel() as ODataModel;
      const action = oModel.bindContext(this.api.purchaseContractsPriceFixationDelete);
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
   * Gera o espelho da fixação selecionada em PDF: comprovante enviado ao produtor
   * confirmando o preço fixado. Só faz sentido para fixação confirmada — o backend
   * recusa as demais, mas checamos antes para dar mensagem melhor que um 400.
   */
  async onPrintPriceFixation() {
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione uma fixação para emitir o espelho.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);

    if ((ctx.getProperty("Status") as string) !== "Confirmed") {
      MessageBox.error(
        "O espelho só é emitido para fixação confirmada — é um comprovante de " +
        "compromisso firmado com o produtor."
      );
      return;
    }

    const key = ctx.getProperty("Key") as string;

    try {
      this.setBusy(true);

      const response = await fetch(`${this.api.priceFixationReport}/${key}/print`, {
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
   * Recarrega apenas os TOTAIS do contrato (Total Fixado, Volume fixado, Volume a
   * fixar). Eles não vêm do binding OData do contrato: são carregados à parte, de
   * PurchaseContractsTotals, para o viewModel — então uma mudança nas fixações não
   * os atualiza sozinha.
   *
   * A TABELA de fixações não é recarregada aqui: as operações passam pelo ODataModel
   * (create/delete/bindContext), que já atualiza as linhas. Recarregar a lista à mão
   * poderia atropelar mudanças pendentes do modelo.
   *
   * Os erros são exibidos de propósito: a versão anterior engolia a falha e o usuário
   * ficava vendo número desatualizado sem nenhum aviso de que a atualização falhara.
   */
  private refreshContractTotals() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error(
        "Contrato não está carregado: os saldos podem estar desatualizados. Recarregue a tela."
      );
      return;
    }

    const viewModel = this.getModel("viewModel") as JSONModel;
    const requestModel = new RequestModel({ Key: ctx.getProperty("Key") as string });

    requestModel.post(this.api.purchaseContractsTotals)
      .then((data: {
        TotalPrice?: number;
        TotalTax?: number;
        AvailableVolumeToPricing?: number;
        FixedVolume?: number;
        TotalVolume?: number;
        TotalStandard?: number;
        TotalShipmentReleases?: number;
        TotalAvailableToRelease?: number;
        AvaiableVolume?: number;
      }) => {
        viewModel.setProperty("/TotalPrice", data.TotalPrice ?? 0);
        viewModel.setProperty("/TotalTax", data.TotalTax ?? 0);
        viewModel.setProperty("/AvailableVolumeToPricing", data.AvailableVolumeToPricing ?? 0);
        viewModel.setProperty("/FixedVolume", data.FixedVolume ?? 0);
        viewModel.setProperty("/TotalVolume", data.TotalVolume ?? 0);
        viewModel.setProperty("/TotalStandard", data.TotalStandard ?? 0);
        viewModel.setProperty("/TotalShipmentReleases", data.TotalShipmentReleases ?? 0);
        viewModel.setProperty("/TotalAvailableToRelease", data.TotalAvailableToRelease ?? 0);
        viewModel.setProperty("/AvaiableVolume", data.AvaiableVolume ?? 0);
      })
      .fail((err: JQuery.jqXHR) => {
        MessageBox.error(
          this.extractErrorMessage(err, "Falha ao atualizar os saldos do contrato.") +
          " Recarregue a tela para ver os valores corretos."
        );
      });
  }

  /**
   * O backend devolve a mensagem de negócio como texto puro no corpo do 400
   * (BadRequest(ex.Message)), não como JSON — daí o fallback em cascata.
   */
  private extractErrorMessage(err: JQuery.jqXHR, fallback: string): string {
    const json = err.responseJSON as { error?: { message?: string }; message?: string };
    return json?.error?.message ?? json?.message ?? err.responseText ?? fallback;
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
