import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import PurchaseContractsBaseController, { PurchaseFiscalComplement } from "./PurchaseContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import RequestModel from "siagrob1/model/RequestModel";
import { PurchaseContractsTotals } from "siagrob1/types/PurchaseContractsTotal";
import { PurchaseContractRecalcResult } from "siagrob1/types/PurchaseContractRecalcResult";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Dialog from "sap/m/Dialog";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default class Detail extends PurchaseContractsBaseController {

  private _fiscalComplementDialog: Dialog;
  private _fiscalSaving = false;

	onInit(): void  {	
		this.initFiscalComplementModel();
		this.getView().setModel(new JSONModel({}), "fiscalComplementDialog");
		this.initContractDrafts();
		this.getRouter().getRoute("purchaseContractsDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const args = ev.getParameter("arguments") as { id: string; "?query"?: { readonly?: string } };
		const id = args.id;
    const uiModel = this.getModel("ui") as JSONModel;

    const viewModel = this.getModel("viewModel") as JSONModel;

		if (id != null) {

      uiModel.setProperty("/editable", false);
      uiModel.setProperty("/typeEditable", false);

      // Modo somente-leitura: acionado por ?readonly=true, usado quando o aprovador
      // abre o contrato a partir da fila de aprovação de fixações. Nenhuma ação sobre
      // o contrato pode ser executada nesse modo.
      uiModel.setProperty("/readonly", args["?query"]?.readonly === "true");

      void this.applyPreContractPrintVisibility();

			const sPath = `/PurchaseContracts(${id})`;
			this.bindElement(sPath);

      this.getAllocations(id);
      this.getAttachments(id);
      void this.reloadContractDrafts(id);

      void this.startFiscalComplement(id, true);

      const requestModel = new RequestModel({Key: id});
      requestModel.post(this.api.purchaseContractsTotals)
        .then((data: PurchaseContractsTotals) => this.applyContractTotals(viewModel, data));

			return;
		}

	}

  async onOpenFiscalComplementDialog() {
    const current = (this.getModel("fiscalComplement") as JSONModel).getData() as PurchaseFiscalComplement;

    (this.getModel("fiscalComplementDialog") as JSONModel).setData({
      UsageCode: current.UsageCode ?? null,
      UsageName: current.UsageName ?? "",
    });

    this._fiscalComplementDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.purchaseContracts.fragments.PurchaseContractFiscalComplementDialog");

    this._fiscalComplementDialog.open();
  }

  onCloseFiscalComplementDialog() {
    this._fiscalComplementDialog?.close();
  }

  /** Só naturezas de Entrada ativas ($filter estático do enum: `Filter` sobre enum estoura). */
  async openFiscalComplementUsageValueHelp() {
    const selected = await DialogHelper.openTableSelectDialog(
      this, "UsagesSelectDialog", ["Name", "Description"],
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Direction eq 'Incoming'");

    if (!selected) {
      return;
    }

    const model = this.getModel("fiscalComplementDialog") as JSONModel;
    model.setProperty("/UsageCode", selected.getProperty("Code"));
    model.setProperty("/UsageName", selected.getProperty("Name"));
  }

  onClearFiscalComplementUsage() {
    const model = this.getModel("fiscalComplementDialog") as JSONModel;
    model.setProperty("/UsageCode", null);
    model.setProperty("/UsageName", "");
  }

  async onSaveFiscalComplement() {
    // Trava antes do primeiro await: duplo clique não pode disparar duas actions.
    if (this._fiscalSaving) {
      return;
    }
    this._fiscalSaving = true;

    try {
      const form = (this.getModel("fiscalComplementDialog") as JSONModel).getData() as PurchaseFiscalComplement;
      // Int do EDM: número ou null, nunca string (o binder do OData recusa o corpo inteiro).
      const usageCode = form.UsageCode === null || form.UsageCode === undefined || (form.UsageCode as unknown) === ""
        ? null : Number(form.UsageCode);

      const action = (this.getModel() as ODataModel).bindContext(this.api.purchaseContractsSetFiscalComplement);
      action.setParameter("Key", this._fiscalContractKey);
      action.setParameter("UsageCode", usageCode);

      this._fiscalComplementDialog.setBusy(true);
      try {
        await action.invoke();
      } catch {
        // Recusa do servidor (400 em pt-BR) já foi exibida pelo handler global; diálogo segue aberto.
        return;
      } finally {
        this._fiscalComplementDialog.setBusy(false);
      }

      this._fiscalComplementDialog.close();
      MessageToast.show("Complemento fiscal salvo.");
      await this.loadFiscalComplement(this._fiscalContractKey, true);
      this.refreshContractTotals();
      // O log de alterações ganhou uma linha: a tabela tem cache próprio ($$ownRequest).
      this.refreshChangeLogs();
    } finally {
      this._fiscalSaving = false;
    }
  }

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("purchaseContractsEdit", {id: oContext.getProperty("Key") as string });
    }
  }

  async onRecalculateBalance() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      return;
    }

    const bConfirm = await confirmDialog("Recalcular o saldo do contrato a partir das alocações ?");
    if (!bConfirm) {
      return;
    }

    const key = oContext.getProperty("Key") as string;
    const viewModel = this.getModel("viewModel") as JSONModel;

    this.setBusy(true);

    void jQuery.ajax({
      url: `${this.api.purchaseContractsRecalculateBalance}`,
      method: "POST",
      data: JSON.stringify({ Key: key }),
      contentType: "application/json",
      success: (data: PurchaseContractRecalcResult) => {
        viewModel.setProperty("/AvaiableVolume", data.NewAvaiableVolume ?? 0);

        const fmt = (v: number) =>
          Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

        if (data.Changed) {
          MessageBox.information(
            `Saldo recalculado.\n\n` +
            `Alocado: ${fmt(data.PreviousAllocatedVolume)} → ${fmt(data.NewAllocatedVolume)}\n` +
            `Disponível: ${fmt(data.PreviousAvaiableVolume)} → ${fmt(data.NewAvaiableVolume)}`
          );
        } else {
          MessageToast.show("Saldo já estava correto.");
        }

        oContext.refresh();
      },
      error: err => {
        this.setBusy(false);
        const message = (err.responseJSON as { error?: { message?: string } })?.error?.message;
        MessageBox.error(message ?? "Erro ao recalcular o saldo.");
      },
    })
    .done(() => this.setBusy(false));
  }

  /**
   * O pré-contrato é uma personalização do cliente Yokotobi e lê campos que só existem
   * no banco do SAP Business One, então o botão só aparece em SAPB1 — o backend recusa
   * a impressão nos demais modos. Inicializar como `false` evita a armadilha do `visible`
   * com binding indefinido, que valeria true e exibiria o botão até a resposta chegar.
   */
  private async applyPreContractPrintVisibility() {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/preContractPrintVisible", false);

    const systemInfo = await this.getSystemInfo();
    uiModel.setProperty("/preContractPrintVisible", systemInfo?.erp === "SAPB1");
  }

  /**
   * Gera o pré-contrato de compra em PDF, documento preliminar encaminhado ao
   * departamento jurídico para a confecção do contrato definitivo.
   */
  async onPrintPreContract() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      return;
    }

    const key = oContext.getProperty("Key") as string;

    try {
      this.setBusy(true);

      const response = await fetch(`${this.api.prePurchaseContractReport}/${key}/print`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Falha ao gerar o pré-contrato.");
      }

      const blob = await response.blob();
      const fileURL = URL.createObjectURL(blob);
      window.open(fileURL, "_blank");
      setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
    } catch (error) {
      MessageBox.error((error as Error)?.message ?? "Falha ao gerar o pré-contrato.");
    } finally {
      this.setBusy(false);
    }
  }

}
