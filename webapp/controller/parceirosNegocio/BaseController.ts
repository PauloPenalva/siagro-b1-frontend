import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Select, { Select$ChangeEvent } from "sap/m/Select";
import { Button$PressEvent } from "sap/m/Button";
import Input from "sap/m/Input";
import Event from "sap/ui/base/Event";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import SessionService from "siagrob1/services/SessionService";
import { EMAIL_PATTERN, NFE_EMAIL_MAX, nfeEmailListError } from "siagrob1/helpers/NfeEmailHelpers";

type NfeEmailRow = { Address: string };

export abstract class BaseController extends CommonController {

  /**
   * Lista de e-mails da NF-e (STANDALONE): o V4 não lê nem grava coleção primitiva por
   * `getProperty`/`setProperty` ("Accessed value is not primitive"), então a tela edita um
   * JSONModel (`nfeEmails`) e a coleção inteira vai num PATCH próprio logo depois do save do
   * parceiro (`saveNfeEmails`). `saved` guarda o que o servidor já tem, para só enviar mudança.
   */
  protected resetNfeEmails(addresses?: string[]): void {
    const model = (this.getView().getModel("nfeEmails") as JSONModel) ?? new JSONModel();
    const list = addresses ?? [];
    // `undefined` = lista do servidor ainda não lida (ou leitura falhou): tabela travada e sem PATCH.
    model.setData({ rows: list.map((Address) => ({ Address })), saved: [...list], loaded: addresses !== undefined });
    this.getView().setModel(model, "nfeEmails");
  }

  private currentNfeEmails(): string[] {
    const rows = ((this.getView().getModel("nfeEmails") as JSONModel)?.getProperty("/rows") ?? []) as NfeEmailRow[];
    return rows.map((r) => (r.Address ?? "").trim()).filter((a) => a !== "");
  }

  /** Formato e repetição conferidos no cliente; o servidor revalida (máx. 10, único, formato). */
  protected validateNfeEmails(): boolean {
    const error = nfeEmailListError(this.currentNfeEmails());
    if (error) {
      MessageBox.warning(error);
      return false;
    }
    return true;
  }

  protected nfeEmailsLoaded(): boolean {
    const loaded = (this.getView().getModel("nfeEmails") as JSONModel)?.getProperty("/loaded") === true;
    if (!loaded) {
      MessageBox.warning("Os e-mails de NF-e do parceiro ainda não foram carregados. Aguarde ou reabra o cadastro.");
    }
    return loaded;
  }

  /** PATCH da coleção inteira; devolve false (e avisa) se o servidor recusar. */
  protected async saveNfeEmails(cardCode: string): Promise<boolean> {
    const model = this.getView().getModel("nfeEmails") as JSONModel;
    const list = this.currentNfeEmails();
    const saved = (model.getProperty("/saved") ?? []) as string[];
    if (list.length === saved.length && list.every((a, i) => a === saved[i])) {
      return true;
    }
    const result = await sendJson("PATCH", `/odata/BusinessPartners('${encodeURIComponent(cardCode)}')`, { NfeEmails: list });
    if (!result.ok) {
      MessageBox.error(`O parceiro foi salvo, mas os e-mails de NF-e não. Salve novamente.

${result.message}`);
      return false;
    }
    model.setProperty("/saved", list);
    // O cache do V4 ainda guarda a lista antiga; sem refrescar, reabrir o parceiro a mostraria.
    await (this.getView().getBindingContext() as Context | undefined)?.requestRefresh();
    return true;
  }

  onAddNfeEmail(): void {
    const model = this.getView().getModel("nfeEmails") as JSONModel;
    const rows = model.getProperty("/rows") as NfeEmailRow[];
    if (rows.length >= NFE_EMAIL_MAX) {
      MessageBox.warning("Máximo de 10 e-mails por parceiro.");
      return;
    }
    model.setProperty("/rows", [...rows, { Address: "" }]);
  }

  onRemoveNfeEmail(ev: Button$PressEvent): void {
    const model = this.getView().getModel("nfeEmails") as JSONModel;
    const row = ev.getSource().getBindingContext("nfeEmails").getObject() as NfeEmailRow;
    model.setProperty("/rows", (model.getProperty("/rows") as NfeEmailRow[]).filter((r) => r !== row));
  }

  onNfeEmailChange(ev: Event): void {
    const input: Input = ev.getSource();
    const value = input.getValue().trim();
    const rows = (this.getView().getModel("nfeEmails") as JSONModel).getProperty("/rows") as NfeEmailRow[];
    const duplicated = value !== "" && rows.filter((r) => (r.Address ?? "").trim().toLowerCase() === value.toLowerCase()).length > 1;
    const invalid = value !== "" && !EMAIL_PATTERN.test(value);
    input.setValueState(invalid || duplicated ? "Error" : "None");
    input.setValueStateText(invalid ? "E-mail inválido." : duplicated ? "E-mail repetido." : "");
  }

  /**
   * Tipo mudou na inclusão (STANDALONE): a série vem de `Customer` (C…) ou `Supplier` (F…), então a
   * lista do Select é refiltrada e a série padrão do tipo é escolhida, voltando ao modo automático
   * (o código digitado de uma série Manual anterior é descartado). Na edição o código é imutável e
   * em SAPB1 não há série: nada a fazer.
   */
  async onCardTypeChange(event: Select$ChangeEvent): Promise<void> {
    const uiModel = this.getModel("ui") as JSONModel;

    if (SessionService.isSapMode() || uiModel.getProperty("/docNumberSeriesEditable") !== true) {
      return;
    }

    const cardType = event.getSource().getSelectedKey();
    const transaction = cardType === "S" ? "Supplier" : cardType === "C" ? "Customer" : "";
    const viewContext = this.getView().getBindingContext() as Context | undefined;
    const seriesBinding = (this.byId("businessPartnerSeriesSelect") as Select)?.getBinding("items") as ODataListBinding;

    uiModel.setProperty("/docNumberManual", false);

    if (!transaction || !viewContext || !seriesBinding) {
      return;
    }

    seriesBinding.changeParameters({
      $filter: `TransactionCode eq '${transaction}' and Inactive eq false`
    });

    const info = (await this.getDocNumberInfoByTransaction(transaction)).find(x => x.Default);
    void viewContext.setProperty("CardCode", "");
    void viewContext.setProperty("DocNumberKey", info?.Key ?? null);
  }

  onAddAddress() {
    const tb = this.byId("businessPartnerAddressesTable") as Table;
    const oBinding = tb.getBinding("rows") as ODataListBinding;
    // As propriedades que o value help de município grava precisam existir na linha nova.
    oBinding.create({
      StreetNumber: null,
      Complement: null,
      MunicipalityCode: null,
      ZipCode: null,
      City: "",
      State: "",
      // O Select de tipo (targetType 'any') e o value help de país gravam nestas.
      AdresType: null,
      Country: "BR",
    }, false, true, false);
  }

  onRemoveAddress() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("businessPartnerAddressesTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }
}
