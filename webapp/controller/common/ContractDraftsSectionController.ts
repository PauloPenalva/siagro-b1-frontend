import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CkDocumentEditor from "siagrob1/control/CkDocumentEditor";
import Table from "sap/ui/table/Table";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  createDraftParameters,
  draftButtonState,
  DraftRow,
  draftFileName,
  draftsFromResponse,
  templatePickerFilter,
  updateDraftParameters,
} from "siagrob1/helpers/contractDraftActions";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import CommonController from "./CommonController";

const DRAFTS_TABLE = "contractDraftsTable";
const SIGNERS_TABLE = "contractDraftSignersTable";

// Diálogos em dialogs/fragments porque compra e venda usam exatamente os mesmos.
const NEW_DIALOG = "siagrob1.dialogs.fragments.ContractDraftDialog";
const BODY_DIALOG = "siagrob1.dialogs.fragments.ContractDraftBodyDialog";

/**
 * Seção "Minutas" das páginas de contrato.
 *
 * Fica entre `CommonController` e as bases de compra e de venda porque as duas telas fazem
 * exatamente o mesmo: só muda o `ContractType` enviado nas actions, que cada base declara em
 * {@link contractDraftType}. As regras que dá para provar sem navegador moram em
 * `helpers/contractDraftActions`; aqui só se orquestra.
 *
 * Os fragmentos de compra e de venda usam os MESMOS ids (`contractDraftsTable`, …) — estão em
 * views diferentes, então não colidem, e é o que permite este código servir aos dois.
 *
 * ⚠️ O `@namespace` NÃO é enfeite: sem ele o transpilador emite uma classe ES comum, que o UI5
 * não registra. As bases de compra e de venda são geradas como `Pai.extend("nome", …)`, e o
 * `extend` resolve a superclasse pela METADATA do UI5 — uma classe não registrada é pulada, e a
 * cadeia de protótipos vai direto ao `CommonController`. Resultado medido no navegador:
 * `this.initContractDrafts is not a function`, com a página inteira do contrato sem abrir.
 *
 * @namespace siagrob1.controller.common
 */
export default abstract class ContractDraftsSectionController extends CommonController {

  private newDraftDialog: Dialog;
  private bodyDialog: Dialog;

  /** `"Purchase"` ou `"Sales"`. É a única diferença entre as duas telas. */
  protected abstract contractDraftType(): string;

  protected contractDraftKey(): string {
    return this.getView().getBindingContext()?.getProperty("Key") as string;
  }

  /** Modelos da seção. Chamado no `onInit` de cada tela. */
  protected initContractDrafts(): void {
    this.getView().setModel(new JSONModel([]), "drafts");
    this.getView().setModel(
      new JSONModel({
        buttons: draftButtonState(undefined),
        templateFilter: templatePickerFilter(this.contractDraftType()),
        newDraft: { templateKey: "", draftType: "Contract", description: "" },
        body: { description: "", html: "" },
      }),
      "draftUi"
    );
  }

  private draftUi(): JSONModel {
    return this.getModel("draftUi") as JSONModel;
  }

  private draftsTable(): Table {
    return this.byId(DRAFTS_TABLE) as Table;
  }

  private selectedDraft(): DraftRow {
    const table = this.draftsTable();
    const index = table?.getSelectedIndices()[0] ?? -1;

    return index < 0 ? undefined : (table.getContextByIndex(index)?.getObject() as DraftRow);
  }

  /**
   * Recarrega a lista. A function responde ARRAY cru, sem envelope OData — daí o JSONModel com
   * o array na raiz, e não uma ligação direta, que quebraria em
   * "Cannot read properties of undefined (reading 'length')".
   */
  protected async reloadContractDrafts(contractKey?: string): Promise<void> {
    // A chave vem por parâmetro no primeiro carregamento: o `bindElement` da rota ainda não
    // resolveu, e `getBindingContext()` volta indefinido.
    const key = contractKey ?? this.contractDraftKey();

    if (!key) {
      return;
    }

    const url =
      `${ServerRoutes.contractDraftsListByContract}` +
      `(ContractType='${this.contractDraftType()}',ContractKey=${key})`;

    const result = await sendJson("GET", url);

    if (!result.ok) {
      MessageBox.error(result.message || "Não foi possível carregar as minutas.");
      return;
    }

    (this.getModel("drafts") as JSONModel).setData(draftsFromResponse(result.data));
    this.clearDraftSelection();
  }

  private clearDraftSelection(): void {
    this.draftsTable()?.clearSelection();
    // setBindingContext(null) e não unbindElement: o contexto foi POSTO com setBindingContext,
    // e unbindObject é no-op quando não houve bindElement. Sem isto a tabela de signatários
    // continuava mostrando os da minuta anterior — que, depois do recarregamento, é outra.
    this.byId(SIGNERS_TABLE)?.setBindingContext(null, "drafts");
    this.draftUi().setProperty("/buttons", draftButtonState(undefined));
  }

  /** Os signatários já vêm no DTO da linha: ligação relativa, sem chamada extra. */
  onDraftSelectionChange(): void {
    const table = this.draftsTable();
    const index = table.getSelectedIndices()[0] ?? -1;

    this.draftUi().setProperty("/buttons", draftButtonState(this.selectedDraft()));

    const signers = this.byId(SIGNERS_TABLE);

    if (index < 0) {
      signers?.setBindingContext(null, "drafts");
      return;
    }

    signers?.setBindingContext(table.getContextByIndex(index), "drafts");
  }

  // ---------------------------------------------------------------- nova minuta

  async onNewDraft(): Promise<void> {
    this.draftUi().setProperty("/newDraft", { templateKey: "", draftType: "Contract", description: "" });

    if (!await this.loadDraftTemplates()) {
      return;
    }

    this.newDraftDialog ??= await DialogHelper.createDialog(this, NEW_DIALOG);
    this.newDraftDialog.open();
  }

  /**
   * Modelos oferecidos no diálogo, num JSONModel em vez de ligação OData direta: o `$filter`
   * depende do lado do contrato e é montado por `templatePickerFilter` — e `ContractType` é
   * enum, que o `Filter` do modelo V4 não serializa.
   *
   * Sem nenhum modelo cadastrado, avisa e não abre o diálogo: um Select vazio deixaria a pessoa
   * clicando em Gerar sem entender por que nada acontece.
   */
  private async loadDraftTemplates(): Promise<boolean> {
    const filter = encodeURIComponent(templatePickerFilter(this.contractDraftType()));
    const result = await sendJson(
      "GET",
      `${ServerRoutes.contractTemplates}?$filter=${filter}&$select=Key,Name&$orderby=Name`
    );

    if (!result.ok) {
      MessageBox.error(result.message || "Não foi possível carregar os modelos de contrato.");
      return false;
    }

    const templates = draftsFromResponse(result.data);

    if (!templates.length) {
      MessageBox.warning(
        "Nenhum modelo de contrato ativo para este tipo de contrato. Cadastre um em Cadastros → Modelos de Contrato."
      );
      return false;
    }

    this.draftUi().setProperty("/templates", templates);

    return true;
  }

  onCancelNewDraft(): void {
    this.newDraftDialog?.close();
  }

  async onConfirmNewDraft(): Promise<void> {
    const { templateKey, draftType, description } = this.draftUi().getProperty("/newDraft") as {
      templateKey: string;
      draftType: string;
      description: string;
    };

    if (!templateKey) {
      MessageBox.warning("Escolha o modelo de contrato.");
      return;
    }

    const parameters = createDraftParameters(
      this.contractDraftType(),
      this.contractDraftKey(),
      templateKey,
      draftType,
      description
    );

    if (await this.invokeDraftAction(ServerRoutes.contractDraftsCreate, parameters, "Minuta criada.")) {
      this.newDraftDialog?.close();
    }
  }

  // ---------------------------------------------------------------- texto da minuta

  async onEditDraftBody(): Promise<void> {
    const draft = this.selectedDraft();

    if (!draft) {
      return;
    }

    const result = await sendJson("GET", `${ServerRoutes.contractDraftsGetBody}(Key=${draft.Key})`);

    if (!result.ok) {
      MessageBox.error(result.message || "Não foi possível carregar o texto da minuta.");
      return;
    }

    // `ContractDraftsGetBody` é `Returns<string>()` no EDM: passa pelo formatador do OData e
    // responde `{ value: "<html>" }`. Sem desembrulhar, o RichTextEditor recebia um objeto e
    // estourava em validateProperty ("is of type object, expected string").
    this.draftUi().setProperty("/body", { html: odataValue<string>(result.data) ?? "" });

    this.bodyDialog ??= await DialogHelper.createDialog(this, BODY_DIALOG);
    this.bodyDialog.open();
  }

  onCancelDraftBody(): void {
    this.bodyDialog?.close();
  }

  async onConfirmDraftBody(): Promise<void> {
    const draft = this.selectedDraft();

    if (!draft) {
      return;
    }

    // Pelo conteúdo do diálogo, e NÃO por `byId`: o DialogHelper carrega o fragmento com
    // `id = idDaView + "_" + nomeDoFragmento`, então `byId("contractDraftBodyEditor")` nunca
    // resolveria.
    //
    // O CkDocumentEditor empurra o valor para o modelo a cada mudança, sem esperar o blur, mas
    // ler direto do controle elimina qualquer dúvida sobre o que está sendo gravado.
    const editor = this.bodyDialog?.getContent()[0] as CkDocumentEditor;
    const html = editor?.getValue() ?? (this.draftUi().getProperty("/body/html") as string);

    const ok = await this.invokeDraftAction(
      ServerRoutes.contractDraftsUpdate,
      updateDraftParameters(draft, html),
      "Minuta atualizada."
    );

    if (ok) {
      this.bodyDialog?.close();
    }
  }

  // ---------------------------------------------------------------- demais ações

  async onDeleteDraft(): Promise<void> {
    const draft = this.selectedDraft();

    if (!draft || !await confirmDialog("Deseja realmente excluir esta minuta ?", "Excluir minuta ?")) {
      return;
    }

    await this.invokeDraftAction(ServerRoutes.contractDraftsDelete, { Key: draft.Key }, "Minuta excluída.");
  }

  async onSendDraftToSignature(): Promise<void> {
    const draft = this.selectedDraft();

    if (!draft) {
      return;
    }

    if (!await confirmDialog(
      "A minuta será enviada aos signatários para assinatura eletrônica. Confirma ?",
      "Enviar para assinatura ?"
    )) {
      return;
    }

    // Síncrono e conversando com o provedor de assinatura: pode levar segundos. O setBusy é
    // de `invokeDraftAction`, que envolve toda a chamada.
    await this.invokeDraftAction(
      ServerRoutes.contractDraftsSendToSignature,
      { Key: draft.Key },
      "Minuta enviada para assinatura."
    );
  }

  async onCancelDraft(): Promise<void> {
    const draft = this.selectedDraft();

    if (!draft || !await confirmDialog(
      "A assinatura em andamento será cancelada no provedor. Confirma ?",
      "Cancelar assinatura ?"
    )) {
      return;
    }

    await this.invokeDraftAction(ServerRoutes.contractDraftsCancel, { Key: draft.Key }, "Assinatura cancelada.");
  }

  /** Consulta o provedor e reaplica o estado; é também como se busca o PDF que falhou ao baixar. */
  async onRefreshDraftState(): Promise<void> {
    const draft = this.selectedDraft();

    if (!draft) {
      return;
    }

    try {
      this.setBusy(true);

      const result = await sendJson("GET", `${ServerRoutes.contractDraftsRefreshState}(Key=${draft.Key})`);

      if (!result.ok) {
        MessageBox.error(result.message || "Não foi possível consultar a situação no provedor.");
        return;
      }

      // `Returns<bool>()` também vem embrulhado: sem desembrulhar, o objeto é sempre truthy
      // e a mensagem "nada mudou" nunca aparecia.
      const changed = odataValue<boolean>(result.data);

      MessageToast.show(changed ? "Situação atualizada." : "Nada mudou desde a última consulta.");
      await this.reloadContractDrafts();
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Abre o PDF num diálogo, em vez de baixá-lo.
   *
   * Reusa o `openAttachmentViewer`, o mesmo visualizador dos anexos do contrato e da carga: ele
   * busca o binário, exibe o PDF em iframe, mostra a mensagem do servidor quando falha e já traz
   * um "Baixar" no rodapé — por isso aqui há um botão só, e não um para ver e outro para baixar.
   */
  async onOpenDraftPdf(): Promise<void> {
    const draft = this.selectedDraft();

    if (!draft) {
      return;
    }

    await openAttachmentViewer({
      url: `${ServerRoutes.contractDraftsDownloadPdf}(Key=${draft.Key})`,
      fileName: draftFileName(draft),
      title: draft.Sequence ? `Minuta ${draft.Sequence}` : "Minuta",
    });
  }

  // ---------------------------------------------------------------- infraestrutura

  /**
   * Invoca a action e recarrega a lista. Devolve se deu certo, para o chamador decidir se fecha
   * o diálogo — fechá-lo num erro apagaria o que a pessoa digitou.
   */
  private async invokeDraftAction(
    route: string,
    parameters: Record<string, string>,
    successMessage: string
  ): Promise<boolean> {
    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(route);

    Object.entries(parameters).forEach(([name, value]) => action.setParameter(name, value));

    try {
      this.setBusy(true);
      await action.invoke();

      MessageToast.show(successMessage, { closeOnBrowserNavigation: false });
      await this.reloadContractDrafts();

      return true;
    } catch (err) {
      // A mensagem de negócio é do servidor: é ele que sabe por que recusou.
      MessageBox.error((err as Error)?.message || "Não foi possível concluir a operação.");

      return false;
    } finally {
      this.setBusy(false);
    }
  }
}
