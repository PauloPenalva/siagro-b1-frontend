import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { BaseController } from "./BaseController";

/** Linha enviada no deep-insert da devolução. */
interface ReturnItemPayload {
  ItemCode: string;
  ItemName: string;
  Quantity: number;
  UnitPrice: number;
  /** Nulo até o operador amarrar. (strictNullChecks off: `string` já admite null aqui.) */
  SalesInvoiceItemKey: string;
}

/** Rascunho devolvido pela leitura do XML — não é gravado ainda. */
interface ImportedReturn {
  CardCode: string;
  CardName: string;
  DocumentNumber: string;
  DocumentSeries: string;
  AccessKey: string;
  IssueDate: string;
  TotalValue: number;
  TaxPayerComments: string;
  XmlFileName: string;
  Items: {
    ItemCode: string;
    ItemName: string;
    Quantity: number;
    UnitPrice: number;
  }[];
}

/**
 * Inclusão da devolução emitida pelo cliente.
 *
 * O caminho normal é Importar XML → amarrar cada linha à NF de origem → Salvar. O XML tira a
 * digitação do cabeçalho e das linhas; a amarração é manual porque o layout da NF-e não a
 * carrega.
 *
 * @namespace siagrob1.controller.customerReturns
 */
export default class Add extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("customerReturnsAdd")
      .attachPatternMatched(() => this.newRouteMatched());
  }

  private newRouteMatched() {
    this.clearStates("customerReturnsForm");

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/totalReturned", "0,000");

    const oModel = this.getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // Documento nasce vazio: quem o preenche é a importação do XML.
    this.getView().setBindingContext(null);
  }

  /**
   * Abre o seletor de arquivo, lê o XML como TEXTO e manda para o servidor interpretar.
   *
   * Vai por action OData, e não por upload multipart: o dev server e o Gateway só encaminham
   * /odata, /security e /reports — um endpoint em /api não chegaria ao backend.
   */
  onImportXml() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,text/xml,application/xml";

    input.onchange = () => {
      const file = input.files?.[0];

      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        // readAsText sempre resolve string; o tipo do FileReader é largo por causa do
        // readAsArrayBuffer.
        const content = typeof reader.result === "string" ? reader.result : "";
        void this.applyImportedXml(content, file.name);
      };
      reader.readAsText(file);
    };

    input.click();
  }

  private async applyImportedXml(xmlContent: string, fileName: string) {
    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);

      const action = oModel.bindContext("/CustomerReturnsImportXml(...)");
      action.setParameter("XmlContent", xmlContent);
      action.setParameter("FileName", fileName);

      await action.invoke();

      const draft = action.getBoundContext()?.getObject() as ImportedReturn;

      this.createFromDraft(draft, xmlContent);

      MessageToast.show(
        `XML lido: ${draft.Items?.length ?? 0} item(ns). Amarre cada linha à NF de origem.`,
        { closeOnBrowserNavigation: false });
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Monta a entidade transiente a partir do rascunho lido.
   *
   * Toda propriedade que a tela edita entra no create() inicial, nem que seja como null: sem
   * isso a primeira alteração abre "Must not change a property before it has been read".
   */
  private createFromDraft(draft: ImportedReturn, xmlContent: string) {
    const oModel = this.getModel() as ODataModel;
    const oBinding = oModel.bindList("/CustomerReturns");

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    const oContext = oBinding.create({
      CardCode: draft.CardCode,
      CardName: draft.CardName,
      DocumentNumber: draft.DocumentNumber,
      DocumentSeries: draft.DocumentSeries,
      AccessKey: draft.AccessKey,
      IssueDate: draft.IssueDate,
      TotalValue: draft.TotalValue,
      TaxPayerComments: draft.TaxPayerComments,
      XmlFileName: draft.XmlFileName,
      // O XML volta ao servidor no POST: é a prova documental guardada com a devolução.
      XmlData: btoa(unescape(encodeURIComponent(xmlContent))),
      Items: (draft.Items ?? []).map<ReturnItemPayload>(item => ({
        ItemCode: item.ItemCode,
        ItemName: item.ItemName,
        Quantity: item.Quantity,
        UnitPrice: item.UnitPrice,
        // Nasce sem amarração: o XML não carrega o vínculo com a NF de origem. Precisa
        // existir no payload inicial, senão a primeira escolha no value help abre
        // "Must not change a property before it has been read".
        SalesInvoiceItemKey: null,
      })),
    }, false, false, false);

    this.getView().setBindingContext(oContext);
    this.refreshTotalReturned();
  }

  async onSave() {
    const oContext = this.getView().getBindingContext() as Context;

    if (!oContext) {
      MessageBox.warning("Importe o XML da devolução antes de salvar.");
      return;
    }

    const oTable = this.byId("tableCustomerReturnItems");
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;

    const unbound = (oBinding?.getAllCurrentContexts() ?? [])
      .filter(ctx => !ctx.getProperty("SalesInvoiceItemKey"));

    // Aviso, não bloqueio: amarrar depois é um caminho legítimo, e a conciliação só fica
    // incompleta enquanto isso.
    if (unbound.length > 0 && !await confirmDialog(
      `${unbound.length} item(ns) sem NF de origem amarrada. Salvar assim mesmo ?`,
      "Devolução sem amarração")) {
      return;
    }

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        MessageToast.show("Devolução registrada.", { closeOnBrowserNavigation: false });
        this.navTo("customerReturns");
      }
    } finally {
      this.setBusy(false);
    }
  }

  onCancel() {
    const oModel = this.getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    this.navTo("customerReturns");
  }
}
