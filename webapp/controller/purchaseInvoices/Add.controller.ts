import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import { isComplementType, missingUsageMessage } from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";
import { blankItemRow, draftItemRows, ImportedInvoiceItem, remittanceNumbersByItem, toNumber } from "siagrob1/helpers/PurchaseInvoiceDraftHelpers";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { BaseController } from "./BaseController";

/** Rascunho devolvido pela leitura do XML — não é gravado ainda. */
interface ImportedInvoice {
  /** "Normal" ou, na NF-e de complemento (finNFe=2), "ValueComplement" (spec D11) ou "IcmsComplement" (spec 2026-10-17). */
  InvoiceType?: string;
  CardCode: string;
  CardName: string;
  TaxDocumentNumber: string;
  TaxDocumentSeries: string;
  ChaveNFe: string;
  IssueDate: string;
  TotalDocumentValue: number;
  TaxPayerComments: string;
  XmlFileName: string;
  Items: ImportedInvoiceItem[];
  /** CT-e (frete tomado): a importação devolve o tipo, a filial tomadora e a prestação. Ausentes na NF-e comum. */
  TaxDocumentKind?: string;
  BranchCode?: string;
  FreightStartState?: string;
  FreightEndState?: string;
  FreightStartCity?: string;
  FreightEndCity?: string;
  FreightPayerTaxId?: string;
  CteIcmsCst?: string;
  CteIcmsValue?: number | string;
  TruckingCompanyCode?: string;
  TruckingCompanyName?: string;
  /** Avisos da leitura do XML (ex.: NF-e Referenciada não encontrada). */
  Warnings?: string[];
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

  /** Série Automático padrão de PurchaseInvoice, pré-selecionada em todo rascunho novo. */
  private defaultDocNumberKey: string;

  /** Verdadeiro quando a inclusão veio da Manifestação do Destinatário (`?dfe=`): o cancelar volta para lá. */
  private openedFromReceivedDfe = false;

  onInit(): void {
    this.bindTransportGroupVisibility();
    this.getRouter().getRoute("purchaseInvoicesAdd")
      .attachPatternMatched((ev: Route$PatternMatchedEvent) => void this.newRouteMatched(ev));
  }

  /**
   * Com `?dfe=<Id>` (vindo da Manifestação do Destinatário) o rascunho nasce do XML do DF-e, pelo mesmo
   * caminho do Importar XML. Sem o parâmetro nada muda.
   */
  private async newRouteMatched(ev: Route$PatternMatchedEvent) {
    const query = (ev.getParameter("arguments") as { "?query"?: { dfe?: string } })["?query"];
    this.openedFromReceivedDfe = !!query?.dfe;
    await this.prepareNewDraft();

    if (query?.dfe) {
      await this.importFromReceivedDfe(query.dfe);
    }
  }

  private async importFromReceivedDfe(dfeId: string) {
    let xmlContent: string;
    let fileName: string;

    this.setBusy(true);
    try {
      const result = await sendJson("GET", `${ServerRoutes.receivedDfesXml}(Id=${encodeURIComponent(dfeId)})`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      const data = odataValue<Record<string, string>>(result.data);
      xmlContent = data.XmlContent ?? data.xmlContent;
      fileName = data.FileName ?? data.fileName;
    } finally {
      this.setBusy(false);
    }

    await this.applyImportedXml(xmlContent, fileName);
  }

  private async prepareNewDraft() {
    this.clearStates("purchaseInvoicesForm");

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/editable", true);
    // Tipo e emissão só se escolhem na criação: mudá-los depois invalidaria as amarrações.
    uiModel.setProperty("/typeEditable", true);
    uiModel.setProperty("/documentTotal", "0,00");
    uiModel.setProperty("/paymentConditionName", "");
    uiModel.setProperty("/withholdingsRecalculable", false);
    this.startDocNumberCreate();

    const oModel = this.getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // Documento nasce vazio, com uma linha em branco para a digitação manual. Importar XML
    // substitui tudo.
    const branchInfo = await this.getBranchInfo();
    const docNumberInfo = (await this.getDocNumberInfoByTransaction("PurchaseInvoice")).find(x => x.Default);
    this.defaultDocNumberKey = docNumberInfo?.Key;
    this.createDraft(undefined, undefined, branchInfo?.code);
    await this.refreshNfeMode();
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

      // O rascunho do XML também recebe a filial da sessão.
      const branchInfo = await this.getBranchInfo();
      this.startDocNumberCreate();
      this.createDraft(draft, xmlContent, branchInfo?.code);
      await this.refreshNfeMode();

      MessageToast.show(
        `XML lido: ${draft.Items?.length ?? 0} item(ns).`,
        { closeOnBrowserNavigation: false });

      if (draft.Warnings?.length) {
        MessageBox.warning(draft.Warnings.map((warning) => `• ${warning}`).join("\n"));
      }
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
  private createDraft(draft?: ImportedInvoice, xmlContent?: string, branchCode?: string) {
    const oModel = this.getModel() as ODataModel;
    const oBinding = oModel.bindList("/PurchaseInvoices");
    (this.getModel("ui") as JSONModel).setProperty("/remittanceNumbers", remittanceNumbersByItem(draft?.Items));

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // ISO COMPLETO, não só a data: IssueDate/PostingDate são DateTimeOffset, e um "yyyy-MM-dd"
    // faz o DatePicker reescrever o valor normalizado — o que dispara
    // "Must not change a property before it has been read" na entidade transiente.
    const today = new Date().toISOString();

    const oContext = oBinding.create({
      // NF-e de complemento (finNFe=2) importada nasce com o tipo que o servidor leu do XML: Complemento de valor (D11)
      // ou de ICMS (spec 2026-10-17), com linhas só de valor ou só de Base ICMS/ICMS.
      InvoiceType: isComplementType(draft?.InvoiceType) ? draft.InvoiceType : "Normal",
      IssuerType: "ThirdParty",
      TaxDocumentKind: draft?.TaxDocumentKind === "Cte" ? "Cte" : "Nfe",
      // A filial do CT-e é a do tomador lida do XML; vale mais que a da sessão.
      BranchCode: draft?.BranchCode || (branchCode ?? null),
      // Prestação do CT-e: existem no payload inicial (entidade transiente), nulas fora do CT-e.
      FreightStartState: draft?.FreightStartState ?? null,
      FreightEndState: draft?.FreightEndState ?? null,
      FreightStartCity: draft?.FreightStartCity ?? null,
      FreightEndCity: draft?.FreightEndCity ?? null,
      FreightPayerTaxId: draft?.FreightPayerTaxId ?? null,
      CteIcmsCst: draft?.CteIcmsCst ?? null,
      CteIcmsValue: draft?.CteIcmsValue == null ? null : toNumber(draft.CteIcmsValue),
      PaymentConditionCode: null,
      IsNfeReturn: false,
      // Transporte, pesos e volume da NF-e: precisam existir no payload inicial (entidade transiente). Frete
      // "None" = modFrete 9, o que todas as entradas reais usam; sem a chave o servidor assume Cif.
      TruckingCompanyCode: draft?.TruckingCompanyCode ?? null,
      TruckingCompanyName: draft?.TruckingCompanyName ?? null,
      TruckCode: null,
      FreightTerms: "None",
      GrossWeight: 0,
      NetWeight: 0,
      VolumeQuantity: null,
      VolumeSpecies: null,
      VolumeBrand: null,
      VolumeNumbering: null,
      CardCode: draft?.CardCode ?? "",
      CardName: draft?.CardName ?? "",
      // Sempre enviar a série: sem DocNumberKey o servidor trata o número digitado como legado (sem série).
      DocNumberKey: this.defaultDocNumberKey ?? null,
      InvoiceNumber: null,
      TaxDocumentNumber: draft?.TaxDocumentNumber ?? null,
      TaxDocumentSeries: draft?.TaxDocumentSeries ?? null,
      ChaveNFe: draft?.ChaveNFe ?? null,
      IssueDate: draft?.IssueDate ?? today,
      PostingDate: today,
      TotalDocumentValue: toNumber(draft?.TotalDocumentValue),
      TaxPayerComments: draft?.TaxPayerComments ?? null,
      Comments: null,
      // Retenções de serviço (outra compra): existem no payload inicial como 0/false. Com WithholdingsManual falso o
      // servidor calcula tudo pelas alíquotas da natureza ao gravar.
      WithholdingBase: 0, WithheldIss: 0, WithheldIrrf: 0, WithheldInss: 0, WithheldPis: 0, WithheldCofins: 0, WithheldCsll: 0,
      WithholdingsManual: false,
      // Atribuição contábil (centro de custo, item, rateio) + conta contábil do cabeçalho: o PUT do servidor copia tudo, então vão sempre (nulos).
      CostCenterCode: null, AccountingItemCode: null, DistributionRuleCode: null, LedgerAccountCode: null,
      // O XML volta ao servidor no POST: é a prova documental guardada com o documento.
      XmlFileName: draft?.XmlFileName ?? null,
      XmlData: xmlContent
        ? btoa(unescape(encodeURIComponent(xmlContent)))
        : null,
    }, false, false, false);

    this.getView().setBindingContext(oContext);

    // As linhas entram pelo binding da tabela, como no "Incluir Item": aninhadas no create() acima elas
    // existiam no modelo mas a tabela não as mostrava, e o primeiro "Incluir Item" fazia aparecer duas.
    // Cada create() sem bAtEnd entra no TOPO, por isso a lista vai de trás para a frente.
    const oItems = (this.byId("tablePurchaseInvoiceItems") as Table)?.getBinding("rows") as ODataListBinding;
    const created = draftItemRows(draft?.Items).reverse()
      .map((row) => oItems?.create(row, false, false, false))
      .filter((ctx): ctx is Context => !!ctx);

    // Logo após o create() numa entidade recém-vinculada, getProperty() das linhas ainda devolve null: somar agora
    // daria "0,00" na barra até a primeira edição. Espera as linhas ficarem legíveis.
    void Promise.all(created.map((ctx) => ctx.requestObject()))
      .then(() => this.refreshDocumentTotal());
  }

  onAddItem() {
    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;

    if (!oBinding) {
      return;
    }

    // Complemento de valor próprio (spec 2026-10-14): a linha nasce do item da nota original escolhido.
    if (this.isOwnComplementDraft()) {
      void this.addOwnComplementLine(oBinding);
      return;
    }

    oBinding.create(blankItemRow(), false, false, false);

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

    if ((this.getModel("ui") as JSONModel).getProperty("/docNumberManual") === true
      && !String(oContext.getProperty("InvoiceNumber") ?? "").trim()) {
      MessageBox.warning("Informe o número interno do documento.");
      return;
    }

    const oTable = this.byId("tablePurchaseInvoiceItems");
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;

    const uiModel = this.getModel("ui") as JSONModel;
    const nfeMode = uiModel.getProperty("/nfeMode") === true;
    const taxMode = uiModel.getProperty("/taxMode") === true;

    // A devolução de compra da filial que emite NF-e nasce só pelo "Devolver" do detalhe da entrada, que
    // carrega a referência e o saldo; o servidor recusaria esta (por isso vem antes da checagem de natureza).
    if (nfeMode && oContext.getProperty("IssuerType") === "Own" && oContext.getProperty("InvoiceType") === "Return") {
      MessageBox.warning("Na filial que emite NF-e pelo Siagro, a devolução de compra é feita pelo botão Devolver, no detalhe do documento de entrada.");
      return;
    }

    if (taxMode) {
      const withoutUsage = (oBinding?.getAllCurrentContexts() ?? []).filter(ctx => !ctx.getProperty("UsageCode"));
      if (withoutUsage.length > 0) {
        MessageBox.warning(missingUsageMessage(withoutUsage.map(ctx => ctx.getProperty("ItemCode") as string)));
        return;
      }
    }

    const missingUnit = this.missingUnitOfMeasure(
      oBinding?.getAllCurrentContexts() ?? [], oContext.getProperty("InvoiceType") as string);
    if (missingUnit) {
      MessageBox.warning(missingUnit);
      return;
    }

    if (this.isSupplierKeyMissing(oContext)) {
      MessageBox.warning("Informe a chave de acesso da NF-e do fornecedor.");
      return;
    }

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

    // Mesmo aviso, agora para o tipo Normal: item sem contrato amarrado é caminho legítimo
    // (a conciliação fiscal-contratual fica incompleta, não o documento).
    // CT-e (frete) não amarra contrato: a linha é o serviço de transporte.
    if (oContext.getProperty("InvoiceType") === "Normal" && oContext.getProperty("TaxDocumentKind") !== "Cte") {
      const unlinked = (oBinding?.getAllCurrentContexts() ?? [])
        .filter(ctx => !ctx.getProperty("PurchaseContractKey") && !ctx.getProperty("SalesInvoiceItemKey") && !this.isOtherPurchaseLine(ctx));

      if (unlinked.length > 0 && !await confirmDialog(
        `${unlinked.length} item(ns) sem contrato amarrado. Salvar assim mesmo ?`,
        "Documento sem contrato")) {
        return;
      }
    }

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        MessageToast.show("Documento de entrada registrado.", { closeOnBrowserNavigation: false });
        this.navToDetail();
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

    this.navTo(this.openedFromReceivedDfe ? "receivedDfes" : "purchaseInvoices");
  }

  /**
   * Depois de gravar, vai direto ao detalhe — é de lá que saem confirmar, comentar e as demais
   * operações do documento, e voltar para a lista obrigaria o operador a procurar o que ele acabou
   * de criar. Espelha o documento de saída.
   *
   * A chave só existe depois do POST: o contexto nasce transiente e é o servidor que a gera. Por
   * isso a leitura acontece aqui, após o submitBatch, e não no createDraft.
   *
   * Sem chave, cai na lista em vez de deixar o operador preso na tela de inclusão de um documento
   * que já foi gravado.
   */
  private navToDetail() {
    const key = (this.getView().getBindingContext() as Context)?.getProperty("Key") as string;

    if (!key) {
      this.navTo("purchaseInvoices");
      return;
    }

    this.navTo("purchaseInvoicesDetail", { id: key });
  }
}
