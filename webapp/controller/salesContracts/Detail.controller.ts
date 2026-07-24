import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import SalesContractsBaseController from "./SalesContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import RequestModel from "siagrob1/model/RequestModel";
import { SalesContractsTotals } from "siagrob1/types/SalesContractsTotal";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

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

      uiModel.setProperty("/editable", false);

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

}
