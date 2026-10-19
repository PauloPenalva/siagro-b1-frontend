import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CommonController from "siagrob1/controller/common/CommonController";

type Direction = "Payable" | "Receivable";

/**
 * Inclusão e edição do título lançado à mão em Contas a Pagar/Receber (origem Manual, natureza Firme).
 * Três rotas, uma tela: `accountsPayableNew`, `accountsReceivableNew` e `financialDocumentsEdit`.
 * O número vem da série escolhida (Automático ou Manual), só na inclusão. Com baixa, o backend só aceita
 * vencimento e textos; a tela trava os outros campos (`manual>/locked`).
 *
 * @namespace siagrob1.controller.financialDocuments
 */
export default class Manual extends CommonController {
  private _direction: Direction = "Payable";
  private _isNew = true;

  onInit(): void {
    this.getView().setModel(new JSONModel({ title: "", partnerLabel: "Parceiro", locked: false }), "manual");

    const router = this.getRouter();
    router.getRoute("accountsPayableNew").attachPatternMatched(() => void this.startCreate("Payable"));
    router.getRoute("accountsReceivableNew").attachPatternMatched(() => void this.startCreate("Receivable"));
    router.getRoute("financialDocumentsEdit").attachPatternMatched((ev) => this.startEdit(ev));
  }

  private odata(): ODataModel {
    return this.getView().getModel() as ODataModel;
  }

  private manualModel(): JSONModel {
    return this.getModel("manual") as JSONModel;
  }

  private resetPending(): void {
    if (this.odata().hasPendingChanges(this.odata().getUpdateGroupId())) {
      this.odata().resetChanges(this.odata().getUpdateGroupId());
    }
  }

  private setLabels(direction: Direction, isNew: boolean, code = ""): void {
    const side = direction === "Payable" ? "a pagar" : "a receber";
    this.manualModel().setProperty("/title", isNew ? `Novo título ${side}` : `Editar título ${side} ${code}`);
    this.manualModel().setProperty("/partnerLabel", direction === "Payable" ? "Fornecedor" : "Cliente");
  }

  private async startCreate(direction: Direction): Promise<void> {
    this._direction = direction;
    this._isNew = true;
    this.startDocNumberCreate();
    (this.getModel("ui") as JSONModel).setProperty("/editable", true);
    this.manualModel().setProperty("/locked", false);
    this.setLabels(direction, true);
    this.resetPending();
    this.clearStates("financialDocumentManualForm");

    this.setBusy(true);
    try {
      const branchInfo = await this.getBranchInfo();
      const series = await this.getDocNumberInfoByTransaction("FinancialDocument");
      const defaultSeries = series.filter((x) => x.Default)[0];
      const today = new Date();

      const context = this.odata().bindList("/FinancialDocuments").create({
        Direction: direction,
        DocNumberKey: defaultSeries?.Key,
        BranchCode: branchInfo?.code,
        // Meia-noite LOCAL convertida para ISO: o servidor converte de volta e o dia não vira (ver DateHelpers).
        DocumentDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString(),
        NetAmount: 0,
        Currency: "Brl",
      }, false, false, false);

      this.getView().setBindingContext(context);
    } finally {
      this.setBusy(false);
    }
  }

  private startEdit(ev: Route$PatternMatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (!id) return;

    this._isNew = false;
    this.resetDocNumberMode();
    (this.getModel("ui") as JSONModel).setProperty("/editable", true);
    this.manualModel().setProperty("/locked", false);
    this.resetPending();
    this.clearStates("financialDocumentManualForm");

    // Direction e SettledAmount não têm controle na tela: sem o $select explícito o autoExpandSelect não os traz.
    this.bindElement(`/FinancialDocuments(${id})`, {
      $select: "Direction,SettledAmount",
      $expand: "Settlements($select=Key)",
    });

    void this.applyEditState();
  }

  private async applyEditState(): Promise<void> {
    const context = this.getView().getBindingContext() as Context;
    if (!context) return;

    const data = await context.requestObject() as {
      Direction: Direction; Code: string; SettledAmount: number | string; Settlements?: unknown[];
    };
    this._direction = data.Direction;
    this.setLabels(data.Direction, false, data.Code);

    const locked = Number(data.SettledAmount ?? 0) !== 0 || (data.Settlements?.length ?? 0) > 0;
    this.manualModel().setProperty("/locked", locked);
  }

  async onSave(): Promise<void> {
    if (!this.validateForm("financialDocumentManualForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    if (this._isNew && this.isManualNumberMissing("Code")) {
      return;
    }

    const context = this.getView().getBindingContext() as Context;
    if (!(Number(context?.getProperty("NetAmount")) > 0)) {
      MessageBox.warning("O valor do título deve ser maior que zero.");
      return;
    }

    const groupId = this.odata().getUpdateGroupId();
    this.setBusy(true);
    try {
      await this.odata().submitBatch(groupId);
      if (this.odata().hasPendingChanges(groupId)) {
        // Erro do backend já exibido pelo handler global; a tela fica como está para correção.
        return;
      }

      MessageToast.show(this._isNew ? "Título incluído." : "Título alterado.");
      const key = context.getProperty("Key") as string;
      if (key) {
        (this.getModel("viewModel") as JSONModel)
          .setProperty("/financialDocumentOriginRoute", this.listRoute());
        this.navTo("financialDocumentsDetail", { id: key });
      }
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetPending();
    if (this._isNew) {
      this.navTo(this.listRoute());
    } else {
      this.onNavBack();
    }
  }

  private listRoute(): string {
    return this._direction === "Receivable" ? "accountsReceivable" : "accountsPayable";
  }
}
