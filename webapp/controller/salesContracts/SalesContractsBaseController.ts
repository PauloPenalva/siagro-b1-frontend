import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import Dialog from "sap/m/Dialog";
import Context from "sap/ui/model/odata/v4/Context";
import ContractDraftsSectionController from "../common/ContractDraftsSectionController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import RequestModel from "siagrob1/model/RequestModel";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import { Link$PressEvent } from "sap/m/Link";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { calculateSalesWashoutAmount, formatNumberPtBr } from "siagrob1/helpers/WashoutHelpers";
import { WashoutDialogState, WashoutFixationOption, WashoutReverseState } from "siagrob1/types/PurchaseContractWashout";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default abstract class SalesContractsBaseController extends ContractDraftsSectionController {

  /** Lado do contrato para a seção "Minutas" (ver ContractDraftsSectionController). */
  protected contractDraftType(): string {
    return "Sales";
  }
  
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

  /** GAC-1171 (melhorias): visualiza o anexo selecionado, sem baixar. */
  async onViewAttachment(): Promise<void> {
    const table = this.byId("salesContractAttachmentsTable") as Table;
    const selected = table.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione um item na tabela.");
      return;
    }

    const ctx = table.getContextByIndex(selected);
    await this.viewContractAttachment(ctx.getProperty("Key") as string, ctx.getProperty("FileName") as string);
  }

  /** O Link da coluna Arquivo: usa o contexto da PRÓPRIA linha, não a seleção. */
  async onViewAttachmentFromRow(event: Link$PressEvent): Promise<void> {
    const ctx = event.getSource().getBindingContext("attachmentsModel");
    const key = ctx?.getProperty("Key") as string;

    if (!key) return;

    await this.viewContractAttachment(key, ctx.getProperty("FileName") as string);
  }

  private viewContractAttachment(key: string, fileName?: string): Promise<void> {
    return openAttachmentViewer({
      url: `/odata/SalesContractsAttachmentsDownload(Key=${key})`,
      fileName,
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
      this.refreshChangeLogs();
    } catch (e) {
      const err = e as Error;
      MessageBox.error(err.message);
    } finally {
      this.setBusy(false);
    }
  }

  private _priceFixationDialog: Dialog;
  private _washoutDialog: Dialog;
  private _washoutReverseDialog: Dialog;
  private _priceFixationDetailsDialog: Dialog;
  private _signatureStatusDialog: Dialog;

  /* ------------------------------------------------------------------ */
  /* Situação da assinatura                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Abre o diálogo da situação de assinatura. Sem guarda de status de propósito: assinatura é
   * fato documental e vale em qualquer status, inclusive encerrado e cancelado.
   */
  async onOpenSignatureStatusDialog() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.alert("Contrato não carregado.");
      return;
    }

    const viewModel = this.getModel("viewModel") as JSONModel;
    // "" e não null: o Select casa a chave por string, e null deixaria o item sem seleção.
    viewModel.setProperty("/signatureStatus", (ctx.getProperty("SignatureStatus") as string) ?? "");

    this._signatureStatusDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesContracts.fragments.SalesContractSignatureDialog"
    );

    this._signatureStatusDialog?.open();
  }

  onCloseSignatureStatusDialog() {
    this._signatureStatusDialog?.close();
  }

  /**
   * Grava pela action dedicada — o PATCH do cabeçalho recusaria o contrato fora de rascunho.
   * String vazia vira null: "não informado" é valor legítimo do campo.
   */
  async onConfirmSignatureStatus() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      return;
    }

    const viewModel = this.getModel("viewModel") as JSONModel;
    const selected = (viewModel.getProperty("/signatureStatus") as string) || null;
    // requestProperty e não getProperty: o botão fica visível desde o primeiro render, e num
    // contexto ainda não resolvido getProperty devolve undefined - JSON.stringify omitiria a
    // chave e o binder do OData recusaria o corpo inteiro com "parameters field is required".
    const key = await oContext.requestProperty("Key") as string;

    this.setBusy(true);

    void jQuery.ajax({
      url: `${this.api.salesContractsSetSignatureStatus}`,
      method: 'POST',
      data: JSON.stringify({ Key: key, SignatureStatus: selected }),
      contentType: 'application/json',
      success: () => {
        this._signatureStatusDialog?.close();
        oContext.refresh();
        // O log de alterações tem `$$ownRequest` — o refresh do contexto não o alcança.
        this.refreshChangeLogs();
        MessageToast.show("Situação da assinatura atualizada.");
      },
      error: err => {
        this.setBusy(false);
        const message = (err.responseJSON as { error?: { message?: string } })?.error?.message;
        MessageBox.error(message ?? "Erro ao atualizar a situação da assinatura.");
      },
    })
    .done(() => this.setBusy(false));
  }

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

    // Toda mutação de fixação passa por aqui, e todas geram linha no log — refrescar neste
    // ponto evita depender de lembrar do log em cada handler.
    this.refreshChangeLogs();
  }

  /**
   * Abre "Registrar Washout" (spec 2026-10-15). Fixações e washouts ativos são lidos antes de abrir, para o Select
   * nascer com os itens; os saldos vêm do contexto OData (requestProperty garante o valor fora do $select). Tudo é
   * auxílio visual: as travas reais são as do servidor (SalesContractsWashoutGuard).
   */
  async onOpenWashoutDialog() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.alert("Contrato não carregado.");
      return;
    }

    const contractKey = ctx.getProperty("Key") as string;
    const isPaf = (ctx.getProperty("Type") as string) === "ToBeDetermined";
    const viewModel = this.getModel("viewModel") as JSONModel;

    let fixations: WashoutFixationOption[];
    let availablePhysical = 0;
    let availableToRelease = 0;
    let availableToPricing = 0;
    this.setBusy(true);
    try {
      fixations = await this.loadWashoutFixationOptions(contractKey);
      // Edm.Decimal chega como string: Number() antes de usar.
      availablePhysical = Number((await ctx.requestProperty("AvaiableVolume")) ?? 0);
      availableToRelease = Number((await ctx.requestProperty("TotalAvailableToRelease")) ?? 0);
      availableToPricing = isPaf ? Number((await ctx.requestProperty("AvailableVolumeToPricing")) ?? 0) : 0;
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao carregar as fixações do contrato.");
      return;
    } finally {
      this.setBusy(false);
    }

    const firstAvailable = fixations.find(f => f.Remaining > 0) ?? fixations[0];

    const state: WashoutDialogState = {
      contractKey,
      isPaf,
      fixations,
      priceFixationKey: firstAvailable?.Key ?? "",
      contractPrice: firstAvailable?.Price ?? 0,
      fixedVolume: 0,
      unfixedVolume: 0,
      marketPrice: 0,
      penaltyAmount: 0,
      amount: 0,
      dueDate: null,
      reason: "",
      availablePhysical,
      availableToRelease,
      availableToPricing,
    };
    viewModel.setProperty("/washout", state);

    this._washoutDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesContracts.fragments.SalesContractWashoutDialog"
    );

    this._washoutDialog?.open();
  }

  onCloseWashoutDialog() {
    this._washoutDialog?.close();
  }

  /** Recalcula a prévia do valor (fórmula da VENDA) sempre que fixação, volume, mercado ou multa mudam. */
  onWashoutValuesChange() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const state = viewModel.getProperty("/washout") as WashoutDialogState;
    const fixation = state.fixations.find(f => f.Key === state.priceFixationKey);
    const contractPrice = fixation?.Price ?? 0;

    viewModel.setProperty("/washout/contractPrice", contractPrice);
    viewModel.setProperty(
      "/washout/amount",
      calculateSalesWashoutAmount(
        Number(state.marketPrice ?? 0),
        contractPrice,
        Number(state.fixedVolume ?? 0),
        Number(state.penaltyAmount ?? 0)
      )
    );
  }

  async onConfirmWashout() {
    this.onWashoutValuesChange();

    const viewModel = this.getModel("viewModel") as JSONModel;
    const state = viewModel.getProperty("/washout") as WashoutDialogState;
    const fixedVolume = Number(state.fixedVolume ?? 0);
    const unfixedVolume = state.isPaf ? Number(state.unfixedVolume ?? 0) : 0;
    const reason = (state.reason ?? "").trim();

    if (fixedVolume < 0 || unfixedVolume < 0) {
      MessageBox.error("Os volumes do washout não podem ser negativos.");
      return;
    }
    if (fixedVolume + unfixedVolume <= 0) {
      MessageBox.error("Informe o volume do washout.");
      return;
    }
    if (fixedVolume > 0 && !state.priceFixationKey) {
      MessageBox.error("Selecione a fixação de preço do volume fixado.");
      return;
    }
    if (!reason) {
      MessageBox.error("Informe o motivo do washout.");
      return;
    }
    if (state.amount > 0 && !state.dueDate) {
      MessageBox.error("Informe o vencimento do título a receber.");
      return;
    }

    // Pré-checagens de saldo: só auxílio. O servidor continua sendo a autoridade — inclusive no volume já
    // faturado, que o cliente não calcula.
    const selectedFixation = state.fixations.find(f => f.Key === state.priceFixationKey);
    if (fixedVolume > 0 && fixedVolume > (selectedFixation?.Remaining ?? 0)) {
      MessageBox.error(
        `Volume fixado excede o saldo da fixação (${formatNumberPtBr(selectedFixation?.Remaining ?? 0, 3)}).`
      );
      return;
    }
    if (state.isPaf && unfixedVolume > state.availableToPricing) {
      MessageBox.error(
        `Volume não fixado excede o saldo a fixar (${formatNumberPtBr(state.availableToPricing, 3)}).`
      );
      return;
    }
    if (fixedVolume + unfixedVolume > state.availablePhysical) {
      MessageBox.error(
        `Volume do washout excede o saldo físico do contrato (${formatNumberPtBr(state.availablePhysical, 3)}).`
      );
      return;
    }
    if (fixedVolume + unfixedVolume > state.availableToRelease) {
      MessageBox.error(
        `Volume do washout excede o saldo não liberado do contrato (${formatNumberPtBr(state.availableToRelease, 3)}).`
      );
      return;
    }

    // Diálogo ABERTO e ocupado durante o invoke: se o servidor recusar, nada do que foi digitado se perde.
    this._washoutDialog?.setBusy(true);
    this.setBusy(true);

    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(this.api.salesContractsWashoutCreate);
    action.setParameter("SalesContractKey", state.contractKey);
    action.setParameter("Washout", {
      PriceFixationKey: fixedVolume > 0 ? state.priceFixationKey : null,
      FixedVolume: fixedVolume,
      UnfixedVolume: unfixedVolume,
      MarketPrice: Number(state.marketPrice ?? 0),
      PenaltyAmount: Number(state.penaltyAmount ?? 0),
      DueDate: state.dueDate ?? null,
      Reason: reason,
    });

    try {
      await action.invoke();
      MessageToast.show("Washout enviado para aprovação.");
      this.onCloseWashoutDialog();
      this.refreshContractTotals();
      this.refreshWashoutsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao registrar washout.");
    } finally {
      this._washoutDialog?.setBusy(false);
      this.setBusy(false);
    }
  }

  async onReverseWashout() {
    const oTable = this.byId("salesContractWashoutsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione um washout para estornar.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);

    if ((ctx.getProperty("Status") as string) !== "Approved") {
      MessageBox.error(
        "Só é possível estornar washout aprovado. Washout em aprovação é rejeitado na tela de aprovação."
      );
      return;
    }

    const amount = Number(ctx.getProperty("Amount") ?? 0);
    const fixedVolume = Number(ctx.getProperty("FixedVolume") ?? 0);
    const clauses: string[] = ["o volume volta ao saldo"];
    if (fixedVolume > 0) {
      clauses.push("o provisório da fixação é restaurado");
    }
    if (amount > 0) {
      clauses.push(`o título a receber de R$ ${formatNumberPtBr(amount, 2)} é cancelado`);
    }
    const summaryBody =
      clauses.length === 1
        ? clauses[0]
        : `${clauses.slice(0, -1).join(", ")} e ${clauses[clauses.length - 1]}`;
    const state: WashoutReverseState = {
      key: ctx.getProperty("Key") as string,
      summary: `WO-${ctx.getProperty("Sequence") as number}: ${summaryBody}.`,
      reason: "",
    };
    (this.getModel("viewModel") as JSONModel).setProperty("/washoutReverse", state);

    // Fragmento genérico da compra: só liga viewModel>/washoutReverse e os handlers abaixo.
    this._washoutReverseDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.purchaseContracts.fragments.WashoutReverseDialog"
    );

    this._washoutReverseDialog?.open();
  }

  onCloseWashoutReverseDialog() {
    this._washoutReverseDialog?.close();
  }

  async onConfirmWashoutReverse() {
    const state = (this.getModel("viewModel") as JSONModel).getProperty("/washoutReverse") as WashoutReverseState;
    const reason = (state.reason ?? "").trim();

    if (!reason) {
      MessageBox.error("Informe o motivo do estorno.");
      return;
    }

    this._washoutReverseDialog?.setBusy(true);
    this.setBusy(true);

    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(this.api.salesContractsWashoutReverse);
    action.setParameter("Key", state.key);
    action.setParameter("Reason", reason);

    try {
      await action.invoke();
      MessageToast.show("Washout estornado.");
      this.onCloseWashoutReverseDialog();
      this.refreshContractTotals();
      this.refreshWashoutsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao estornar washout.");
    } finally {
      this._washoutReverseDialog?.setBusy(false);
      this.setBusy(false);
    }
  }

  /**
   * Fixações confirmadas do contrato com o saldo lavável de cada uma (volume menos washouts em aprovação e
   * aprovados). Lido por fetch: dado de diálogo, e o filtro é feito aqui para não depender de $filter sobre enum.
   */
  private async loadWashoutFixationOptions(contractKey: string): Promise<WashoutFixationOption[]> {
    type FixationRow = { Key: string; FixationDate?: string; FixationVolume: number | string; FixationPrice: number | string; Status: string };
    type WashoutRow = { PriceFixationKey?: string; FixedVolume: number | string; Status: string };

    const [fixations, washouts] = await Promise.all([
      sendJson("GET", `/odata/SalesContracts(${contractKey})/PriceFixations`),
      sendJson("GET", `/odata/SalesContracts(${contractKey})/Washouts`),
    ]);

    if (!fixations.ok) throw new Error(fixations.message);
    if (!washouts.ok) throw new Error(washouts.message);

    const activeWashouts = ((washouts.data as { value?: WashoutRow[] })?.value ?? [])
      .filter(w => w.Status === "InApproval" || w.Status === "Approved");

    return ((fixations.data as { value?: FixationRow[] })?.value ?? [])
      .filter(f => f.Status === "Confirmed")
      .map(f => {
        const volume = Number(f.FixationVolume ?? 0);
        const price = Number(f.FixationPrice ?? 0);
        const washed = activeWashouts
          .filter(w => w.PriceFixationKey === f.Key)
          .reduce((sum, w) => sum + Number(w.FixedVolume ?? 0), 0);
        const remaining = volume - washed;
        const date = f.FixationDate ? new Date(f.FixationDate).toLocaleDateString("pt-BR") : "";

        return {
          Key: f.Key,
          Price: price,
          Remaining: remaining,
          Text: `${date} · ${formatNumberPtBr(volume, 3)} @ ${formatNumberPtBr(price, 8)} · saldo ${formatNumberPtBr(remaining, 3)}`,
        };
      });
  }

  /** Mesmo motivo de refreshPriceFixationsList: a tabela tem $$ownRequest e cache próprio. */
  private refreshWashoutsList() {
    const oBinding = (this.byId("salesContractWashoutsTable") as Table)
      .getBinding("rows") as ODataListBinding;
    oBinding?.refresh();

    this.refreshChangeLogs();
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

  /**
   * Recarrega o log de alterações depois de uma operação que grava por fora do cache do
   * modelo. A tabela usa `$$ownRequest`, então tem cache próprio e pode ser refrescada
   * isoladamente. Silencioso onde a tabela não existe (Add/Edit) - o fragmento do log só
   * está no Detail.
   */
  refreshChangeLogs() {
    const oBinding = (this.byId("salesContractChangeLogsTable") as Table)
      ?.getBinding("rows") as ODataListBinding;
    oBinding?.refresh();
  }

  /* ------------------------------------------------------------------ */
  /* Comentários                                                         */
  /* ------------------------------------------------------------------ */

  private _commentDialog: Dialog;

  /**
   * Comentário selecionado, ou `null` (já avisando o usuário) quando não há seleção.
   */
  private selectedCommentContext(): Context | null {
    const oTable = this.byId("salesContractCommentsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione um comentário.");
      return null;
    }

    return oTable.getContextByIndex(selected) as Context;
  }

  /**
   * Só o autor altera ou exclui o próprio comentário; administrador pode qualquer um. Quem
   * decide de fato é o servidor (ContractCommentRules) - isto só evita oferecer uma ação que
   * voltaria recusada.
   */
  private canModifyComment(oContext: Context): boolean {
    const sessionModel = this.getModel("sessionModel") as JSONModel;

    if (sessionModel?.getProperty("/isAdmin") === true) {
      return true;
    }

    const userName = (sessionModel?.getProperty("/userName") as string) ?? "";
    const author = (oContext.getProperty("CommentedBy") as string) ?? "";

    return userName !== "" && author.toLowerCase() === userName.toLowerCase();
  }

  async onAddComment() {
    if (!this.getView().getBindingContext()) {
      MessageBox.alert("Contrato não carregado.");
      return;
    }

    this.prepareCommentDialog("Novo Comentário", "", null);
    await this.openCommentDialog();
  }

  async onEditComment() {
    const oContext = this.selectedCommentContext();
    if (!oContext) {
      return;
    }

    if (!this.canModifyComment(oContext)) {
      MessageBox.alert("Somente o autor do comentário pode alterá-lo.");
      return;
    }

    this.prepareCommentDialog(
      "Editar Comentário",
      oContext.getProperty("CommentText") as string,
      oContext.getProperty("Key") as string
    );

    await this.openCommentDialog();
  }

  /**
   * O diálogo trabalha sobre um buffer JSON, nunca sobre o contexto OData: two-way binding num
   * Detail deixaria um PATCH pendente no update group diferido e derrubaria o batch inteiro.
   * `key` nulo significa inclusão.
   */
  private prepareCommentDialog(title: string, text: string, key: string) {
    (this.getModel("viewModel") as JSONModel).setProperty("/commentDialog", {
      title,
      text: text ?? "",
      key,
    });
  }

  private async openCommentDialog() {
    this._commentDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesContracts.fragments.SalesContractCommentDialog"
    );

    this._commentDialog.open();
  }

  onCloseCommentDialog() {
    this._commentDialog?.close();
  }

  async onConfirmComment() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const text = ((viewModel.getProperty("/commentDialog/text") as string) ?? "").trim();

    if (text === "") {
      MessageBox.alert("Informe o texto do comentário.");
      return;
    }

    const commentKey = viewModel.getProperty("/commentDialog/key") as string;
    const contractKey = (this.getView().getBindingContext() as Context)
      ?.getProperty("Key") as string;

    this.onCloseCommentDialog();
    this.setBusy(true);

    try {
      const oModel = this.getView().getModel() as ODataModel;

      if (commentKey) {
        const action = oModel.bindContext(this.api.salesContractsCommentUpdate);
        action.setParameter("Key", commentKey);
        action.setParameter("Text", text);
        await action.invoke();
        MessageToast.show("Comentário alterado.");
      } else {
        const action = oModel.bindContext(this.api.salesContractsCommentCreate);
        action.setParameter("ContractKey", contractKey);
        action.setParameter("Text", text);
        await action.invoke();
        MessageToast.show("Comentário incluído.");
      }

      this.refreshCommentsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar o comentário.");
    } finally {
      this.setBusy(false);
    }
  }

  async onRemoveComment() {
    const oContext = this.selectedCommentContext();
    if (!oContext) {
      return;
    }

    if (!this.canModifyComment(oContext)) {
      MessageBox.alert("Somente o autor do comentário pode excluí-lo.");
      return;
    }

    const confirmed = await confirmDialog(
      "Excluir o comentário selecionado ?",
      "Excluir Comentário"
    );

    if (!confirmed) {
      return;
    }

    this.setBusy(true);

    try {
      const oModel = this.getView().getModel() as ODataModel;
      const action = oModel.bindContext(this.api.salesContractsCommentDelete);
      action.setParameter("Key", oContext.getProperty("Key") as string);
      await action.invoke();

      MessageToast.show("Comentário excluído.");
      this.refreshCommentsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao excluir o comentário.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Recarrega a tabela de comentários (cache próprio, por `$$ownRequest`) e o log de
   * alterações: toda mutação de comentário grava linha no log.
   */
  private refreshCommentsList() {
    const oBinding = (this.byId("salesContractCommentsTable") as Table)
      ?.getBinding("rows") as ODataListBinding;
    oBinding?.refresh();

    this.refreshChangeLogs();
  }

  /**
   * Grava as inclusões/remoções de local de entrega feitas no Detail.
   *
   * O modelo usa um update group diferido, então no Detail (que não tem o Salvar da tela)
   * as linhas ficariam pendentes para sempre. Não dá para submeter na inclusão: a linha
   * nasce vazia e só ganha o cliente depois do value help.
   */
  async onSaveDeliveryLocations() {
    const oModel = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        return;
      }

      MessageToast.show("Locais de entrega salvos.");
      this.refreshChangeLogs();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao salvar os locais de entrega.");
    } finally {
      this.setBusy(false);
    }
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
