import MessageBox from "sap/m/MessageBox";
import { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import RichTextEditor from "sap/ui/richtexteditor/RichTextEditor";
import Form from "sap/ui/layout/form/Form";
import JSONModel from "sap/ui/model/json/JSONModel";
import PropertyBinding from "sap/ui/model/PropertyBinding";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { placeholderToken } from "siagrob1/helpers/ContractDraftPreview";
import { TEMPLATE_SCOPE_OPTIONS } from "siagrob1/model/contractDrafts";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import AppBaseController from "../BaseController";

export const FORM_ID = "formContractTemplate";
export const EDITOR_ID = "contractTemplateEditor";

type Placeholder = { Name: string; Description: string };

/** O que interessa da API nativa do TinyMCE — só o necessário para inserir no cursor. */
type TinyMceLike = { insertContent?: (html: string) => void; getContent?: () => string };

/**
 * Base das telas de Modelo de Contrato (inclusão e edição).
 *
 * ⚠️ `AppBaseController.validateForm`/`clearStates` não servem: fazem `getContent()`, que só
 * existe em `SimpleForm`. Este formulário é `Form` + `ColumnLayout` — a varredura vem de
 * `helpers/FormValidation`.
 */
export abstract class BaseController extends AppBaseController {

  protected initOptions(): void {
    this.getView().setModel(new JSONModel({ scopes: TEMPLATE_SCOPE_OPTIONS }), "options");
    this.getView().setModel(new JSONModel([]), "placeholders");
  }

  protected templateForm(): Form {
    return this.byId(FORM_ID) as Form;
  }

  protected editor(): RichTextEditor {
    return this.byId(EDITOR_ID) as RichTextEditor;
  }

  /**
   * Catálogo de placeholders do escopo, por `fetch` e não pelo ODataModel.
   *
   * `ContractTemplatesListPlaceholders` é declarada `ReturnsCollection<Dto>()` no EDM, então
   * passa pelo formatador do OData e responde **com** envelope `{ value: [...] }` —
   * `odataCollection` desembrulha e explica a regra. Ler por `fetch` (e não pelo ODataModel) é
   * o que `FetchHelpers` existe para fazer; a autenticação é por cookie, e o `fetch` de mesma
   * origem leva a sessão igual ao modelo.
   *
   * A raiz do JSONModel É o array, então a lista binda `placeholders>/`.
   */
  protected async loadPlaceholders(scope: string): Promise<void> {
    const model = this.getModel("placeholders") as JSONModel;

    if (!scope) {
      model.setData([]);
      return;
    }

    const url = `${ServerRoutes.contractTemplatesListPlaceholders}(ContractType='${encodeURIComponent(scope)}')`;
    const result = await sendJson("GET", url);

    if (!result.ok) {
      model.setData([]);
      MessageBox.error(result.message || "Não foi possível carregar a lista de campos.");
      return;
    }

    model.setData(odataCollection<Placeholder>(result.data));
  }

  /** O catálogo depende do escopo: trocar de Compra para Venda troca os campos disponíveis. */
  async onScopeChange(): Promise<void> {
    await this.loadPlaceholders(this.getView().getBindingContext()?.getProperty("ContractType") as string);
  }

  onInsertPlaceholder(ev: ListItemBase$PressEvent): void {
    const name = ev.getSource().getBindingContext("placeholders")?.getProperty("Name") as string;
    const token = placeholderToken(name);

    if (!token) {
      return;
    }

    const editor = this.editor();
    const native = editor?.getNativeApi() as TinyMceLike;

    if (native?.insertContent && native?.getContent) {
      native.insertContent(token);
      // O insertContent mexe no TinyMCE, não na propriedade `value` do controle: sem empurrar
      // de volta, o modelo não veria o texto até o próximo blur do editor.
      this.pushEditorValue(editor, native.getContent());
      return;
    }

    // Editor ainda não inicializado: acrescenta ao fim, para o clique não virar nada.
    this.pushEditorValue(editor, (editor?.getValue() ?? "") + token);
  }

  private pushEditorValue(editor: RichTextEditor, value: string): void {
    const binding = editor?.getBinding("value") as PropertyBinding;

    binding?.setValue(value);
  }

  protected clearFormStates(): void {
    clearFieldStates(this.templateForm());
  }

  protected validateTemplate(): boolean {
    if (validateRequiredFields(this.templateForm())) {
      return true;
    }

    MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");

    return false;
  }

  /**
   * A recusa por placeholder desconhecido é do SERVIDOR, que tem o catálogo. Repetir a lista
   * aqui a faria mudar em dois lugares — por isso só a mensagem dele é mostrada.
   */
  protected showSaveError(err: unknown): void {
    MessageBox.error((err as Error)?.message || "Não foi possível salvar o modelo.");
  }
}
