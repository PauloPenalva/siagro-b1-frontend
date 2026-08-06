import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * Linha enviada no deep-insert do documento.
 *
 * `Quantity` e `UnitPrice` vão como NÚMERO, não string. Verificado contra o servidor: o
 * desserializador OData recusa Edm.Decimal em string e o POST volta 400 "The entity field is
 * required" — o corpo inteiro falha ao vincular, sem mensagem sobre a linha culpada.
 */
interface InvoiceItemPayload {
  ItemCode: string;
  ItemName: string;
  UnitOfMeasureCode: string;
  Quantity: number;
  UnitPrice: number;
  /** Nulo até o operador amarrar. (strictNullChecks off: `string` já admite null aqui.) */
  SalesInvoiceItemKey: string;
}

/** Rascunho devolvido pela leitura do XML — não é gravado ainda. */
interface ImportedInvoice {
  CardCode: string;
  CardName: string;
  TaxDocumentNumber: string;
  TaxDocumentSeries: string;
  ChaveNFe: string;
  IssueDate: string;
  TotalDocumentValue: number;
  TaxPayerComments: string;
  XmlFileName: string;
  Items: {
    ItemCode: string;
    ItemName: string;
    UnitOfMeasureCode: string;
    Quantity: number;
    UnitPrice: number;
  }[];
}

/**
 * Inclusão do documento de entrada.
 *
 * Dois caminhos: **Importar XML**, que tira a digitação do cabeçalho e das linhas, e digitação
 * manual do zero — para NF sem arquivo e para a emissão própria.
 *
 * @namespace siagrob1.controller.purchaseInvoices
 */
export default class Add extends BaseController {
  formatter = { ...formatter }

  onInit(): void {
    this.getRouter().getRoute("purchaseInvoicesAdd")
      .attachPatternMatched(() => this.newRouteMatched());
  }

  private newRouteMatched() {
    this.clearStates("purchaseInvoicesForm");

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/editable", true);
    // Tipo e emissão só se escolhem na criação: mudá-los depois invalidaria as amarrações.
    uiModel.setProperty("/typeEditable", true);
    uiModel.setProperty("/totalItems", "0,00");

    const oModel = this.getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // Documento nasce vazio, com uma linha em branco para a digitação manual. Importar XML
    // substitui tudo.
    this.createDraft();
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

      const action = oModel.bindContext("/PurchaseInvoicesImportXml(...)");
      action.setParameter("XmlContent", xmlContent);
      action.setParameter("FileName", fileName);

      await action.invoke();

      const draft = action.getBoundContext()?.getObject() as ImportedInvoice;

      this.createDraft(draft, xmlContent);

      MessageToast.show(
        `XML lido: ${draft.Items?.length ?? 0} item(ns).`,
        { closeOnBrowserNavigation: false });
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Monta a entidade transiente.
   *
   * TODA propriedade que a tela edita entra no create() inicial, nem que seja como null: sem
   * isso a primeira alteração abre "Must not change a property before it has been read".
   */
  private createDraft(draft?: ImportedInvoice, xmlContent?: string) {
    const oModel = this.getModel() as ODataModel;
    const oBinding = oModel.bindList("/PurchaseInvoices");

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // ISO COMPLETO, não só a data: IssueDate/PostingDate são DateTimeOffset, e um "yyyy-MM-dd"
    // faz o DatePicker reescrever o valor normalizado — o que dispara
    // "Must not change a property before it has been read" na entidade transiente.
    const today = new Date().toISOString();

    const items: InvoiceItemPayload[] = (draft?.Items ?? [{
      ItemCode: "", ItemName: "", UnitOfMeasureCode: "", Quantity: 0, UnitPrice: 0,
    }]).map<InvoiceItemPayload>(item => ({
      ItemCode: item.ItemCode,
      ItemName: item.ItemName,
      UnitOfMeasureCode: item.UnitOfMeasureCode,
      Quantity: item.Quantity ?? 0,
      UnitPrice: item.UnitPrice ?? 0,
      // Nasce sem amarração: o XML não carrega o vínculo com a NF de origem. Precisa EXISTIR no
      // payload inicial, senão a primeira escolha no value help abre
      // "Must not change a property before it has been read".
      SalesInvoiceItemKey: null,
    }));

    const oContext = oBinding.create({
      InvoiceType: "Normal",
      IssuerType: "ThirdParty",
      CardCode: draft?.CardCode ?? "",
      CardName: draft?.CardName ?? "",
      InvoiceNumber: null,
      TaxDocumentNumber: draft?.TaxDocumentNumber ?? null,
      TaxDocumentSeries: draft?.TaxDocumentSeries ?? null,
      ChaveNFe: draft?.ChaveNFe ?? null,
      IssueDate: draft?.IssueDate ?? today,
      PostingDate: today,
      TotalDocumentValue: draft?.TotalDocumentValue ?? 0,
      TaxPayerComments: draft?.TaxPayerComments ?? null,
      Comments: null,
      // O XML volta ao servidor no POST: é a prova documental guardada com o documento.
      XmlFileName: draft?.XmlFileName ?? null,
      XmlData: xmlContent
        ? btoa(unescape(encodeURIComponent(xmlContent)))
        : null,
      Items: items,
    }, false, false, false);

    this.getView().setBindingContext(oContext);
    this.refreshDocumentTotal();
  }

  onAddItem() {
    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;

    if (!oBinding) {
      return;
    }

    oBinding.create({
      ItemCode: "", ItemName: "", UnitOfMeasureCode: "",
      Quantity: 0, UnitPrice: 0, SalesInvoiceItemKey: null,
    }, false, false, false);

    this.refreshDocumentTotal();
  }

  async onRemoveItem() {
    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;
    const i = oTable?.getSelectedIndex() ?? -1;

    if (i < 0) {
      MessageBox.warning("Selecione um item.");
      return;
    }

    await (oTable.getContextByIndex(i) as Context).delete();
    this.refreshDocumentTotal();
  }

  async onSave() {
    const oContext = this.getView().getBindingContext() as Context;

    if (!oContext) {
      MessageBox.warning("Nada a salvar.");
      return;
    }

    if (!oContext.getProperty("CardCode")) {
      MessageBox.warning("Informe o emitente do documento.");
      return;
    }

    const oTable = this.byId("tablePurchaseInvoiceItems");
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;

    // Aviso, não bloqueio: amarrar depois é caminho legítimo, e a conciliação só fica
    // incompleta enquanto isso. Só faz sentido na devolução.
    if (oContext.getProperty("InvoiceType") === "Return") {
      const unbound = (oBinding?.getAllCurrentContexts() ?? [])
        .filter(ctx => !ctx.getProperty("SalesInvoiceItemKey"));

      if (unbound.length > 0 && !await confirmDialog(
        `${unbound.length} item(ns) sem NF de origem amarrada. Salvar assim mesmo ?`,
        "Documento sem amarração")) {
        return;
      }
    }

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        MessageToast.show("Documento de entrada registrado.", { closeOnBrowserNavigation: false });
        this.navTo("purchaseInvoices");
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

    this.navTo("purchaseInvoices");
  }
}
