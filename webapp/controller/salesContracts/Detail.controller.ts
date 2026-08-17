import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import SalesContractsBaseController from "./SalesContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import RequestModel from "siagrob1/model/RequestModel";
import { SalesContractsTotals } from "siagrob1/types/SalesContractsTotal";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { SalesContractRecalcResult } from "siagrob1/types/SalesContractRecalcResult";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default class Detail extends SalesContractsBaseController {

	onInit(): void  {	
		this.getRouter().getRoute("salesContractsDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const args = ev.getParameter("arguments") as { id: string; "?query"?: { readonly?: string } };
		const id = args.id;
    const viewModel = this.getModel("viewModel") as JSONModel;
    const uiModel = this.getModel("ui") as JSONModel;

		if (id != null) {

      // O Salvar dos Locais de Entrega submete o update group diferido inteiro, que é
      // compartilhado pelo app. Entrar aqui nunca tem alteração pendente legítima, então
      // limpar garante que aquele submitBatch só carregue o que esta tela produziu - mesmo
      // que o descarte global do Component tenha sido pulado por um $batch em voo.
      this.resetModelChanges();

      uiModel.setProperty("/editable", false);
      uiModel.setProperty("/typeEditable", false);

      // Modo somente-leitura: acionado por ?readonly=true quando o aprovador abre o
      // contrato a partir da fila de aprovação de fixações. Nenhuma ação de mutação
      // (editar, aprovar/retirar, fixar/estornar/excluir, anexar/remover) fica acessível.
      uiModel.setProperty("/readonly", args["?query"]?.readonly === "true");

			const sPath = `/SalesContracts(${id})`;
			this.bindElement(sPath);
      this.getInvoices(id);
      this.getAttachments(id);
      void this.applyPostApprovalEditable(sPath);

      const requestModel = new RequestModel({Key: id});
      requestModel.get<SalesContractsTotals>(this.api.salesContractsGetTotals.replace("$", id))
        .then((data: SalesContractsTotals) => {
          viewModel.setProperty("/TotalPrice", data.TotalPrice ?? 0)
          viewModel.setProperty("/TotalVolume", data.TotalVolume ?? 0)
        });

			return;
		}

	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("salesContractsEdit", {id: oContext.getProperty("Key") as string });
    }
  }

  /**
   * Contrato aprovado continua imutável em quase tudo, mas locais de entrega e anexos seguem
   * editáveis: sem isso um contrato já faturado nunca conseguiria cadastrar o local de entrega
   * que a liberação de entrega exige — ele também não pode voltar para rascunho. A mesma regra
   * é validada no servidor (SalesContractsPostApprovalGuard).
   *
   * A observação NÃO entra aqui: continua editável apenas em rascunho, pela tela de edição.
   *
   * O status é lido do próprio contrato depois que ele carrega; `readonly` (fila de
   * aprovação de fixações) vence sempre.
   */
  private async applyPostApprovalEditable(sPath: string) {
    const uiModel = this.getModel("ui") as JSONModel;
    const oModel = this.getModel() as ODataModel;

    uiModel.setProperty("/postApprovalEditable", false);
    uiModel.setProperty("/postApprovalSaveVisible", false);

    if (uiModel.getProperty("/readonly")) {
      return;
    }

    try {
      const status = await oModel.bindContext(sPath).getBoundContext()
        .requestProperty("Status") as string;

      const editable = status === "Draft" || status === "Approved";
      uiModel.setProperty("/postApprovalEditable", editable);
      uiModel.setProperty("/postApprovalSaveVisible", editable);
    } catch {
      // Sem o status não dá para liberar a edição: o servidor recusaria de qualquer forma,
      // e deixar os botões ativos só produziria erro na cara do usuário.
    }
  }

  /**
   * AllocatedVolume é persistido-derivado e pode dessincronizar do ledger de alocações.
   * Este botão reconcilia UM contrato a partir do ledger — mesmo cálculo do recálculo em
   * lote da tela de conciliação.
   *
   * O Saldo do header está ligado direto em AvaiableVolume da entidade, então o refresh do
   * contexto já repinta o número: não há viewModel para atualizar (diferente da tela de
   * compra, que lê os totais de um endpoint separado).
   */
  async onRecalculateBalance() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      return;
    }

    if (!await confirmDialog("Recalcular o saldo do contrato a partir das alocações ?")) {
      return;
    }

    const action = (this.getModel() as ODataModel)
      .bindContext(this.api.salesContractsRecalculateBalance);
    action.setParameter("Key", oContext.getProperty("Key") as string);

    this.setBusy(true);
    try {
      await action.invoke();
      const result = action.getBoundContext().getObject() as SalesContractRecalcResult;

      const fmt = (v: number) =>
        Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

      if (result.Changed) {
        MessageBox.information(
          `Saldo recalculado.\n\n` +
          `Alocado: ${fmt(result.PreviousAllocatedVolume)} → ${fmt(result.NewAllocatedVolume)}\n` +
          `Disponível: ${fmt(result.PreviousAvaiableVolume)} → ${fmt(result.NewAvaiableVolume)}`
        );
      } else {
        MessageToast.show("Saldo já estava correto.");
      }

      oContext.refresh();
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * O servidor recusa encerrar contrato faturado além do volume contratado (saldo negativo);
   * a mensagem da trava chega ao usuário por este MessageBox.
   */
  async onCloseContract() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      return;
    }

    if (!await confirmDialog("Encerrar o contrato ? Após encerrado não será possível movimentá-lo.")) {
      return;
    }

    const key = oContext.getProperty("Key") as string;

    this.setBusy(true);

    void jQuery.ajax({
      url: `${this.api.salesContractsClose}`,
      method: 'POST',
      data: JSON.stringify({ Key: key }),
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
    .done(() => this.setBusy(false));
  }

  async onReopenContract() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      return;
    }

    if (!await confirmDialog("Reabrir o contrato ? Ele voltará a aceitar movimentação.")) {
      return;
    }

    const key = oContext.getProperty("Key") as string;

    this.setBusy(true);

    void jQuery.ajax({
      url: `${this.api.salesContractsReopen}`,
      method: 'POST',
      data: JSON.stringify({ Key: key }),
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
    .done(() => this.setBusy(false));
  }

}
