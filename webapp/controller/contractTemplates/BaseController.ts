import MessageBox from "sap/m/MessageBox";
import List from "sap/m/List";
import { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import Form from "sap/ui/layout/form/Form";
import JSONModel from "sap/ui/model/json/JSONModel";
import CkDocumentEditor from "siagrob1/control/CkDocumentEditor";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { placeholderToken } from "siagrob1/helpers/ContractDraftPlaceholders";
import { filterPlaceholders, Placeholder } from "siagrob1/helpers/PlaceholderSearch";
import { TEMPLATE_SCOPE_OPTIONS } from "siagrob1/model/contractDrafts";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import AppBaseController from "../BaseController";

export const FORM_ID = "formContractTemplate";
export const EDITOR_ID = "contractTemplateEditor";
export const PLACEHOLDER_LIST = "contractTemplatePlaceholders";

/**
 * Base das telas de Modelo de Contrato (inclusão e edição).
 *
 * ⚠️ `AppBaseController.validateForm`/`clearStates` não servem: fazem `getContent()`, que só
 * existe em `SimpleForm`. Este formulário é `Form` + `ColumnLayout` — a varredura vem de
 * `helpers/FormValidation`.
 */
export abstract class BaseController extends AppBaseController {

  /** Catálogo completo do escopo. A lista exibida é um recorte dele, pela busca. */
  private allPlaceholders: Placeholder[] = [];

  protected initOptions(): void {
    this.getView().setModel(
      new JSONModel({ scopes: TEMPLATE_SCOPE_OPTIONS, placeholderSearch: "" }),
      "options"
    );
    this.getView().setModel(new JSONModel([]), "placeholders");
  }

  protected templateForm(): Form {
    return this.byId(FORM_ID) as Form;
  }

  protected editor(): CkDocumentEditor {
    return this.byId(EDITOR_ID) as CkDocumentEditor;
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

    this.allPlaceholders = odataCollection<Placeholder>(result.data);
    this.applyPlaceholderSearch();
  }

  /** Busca do painel, pela mesma regra do editor Angular: nome e descrição, sem acento. */
  onPlaceholderSearch(): void {
    this.applyPlaceholderSearch();
  }

  private applyPlaceholderSearch(): void {
    const query = (this.getModel("options") as JSONModel).getProperty("/placeholderSearch") as string;

    (this.getModel("placeholders") as JSONModel)
      .setData(filterPlaceholders(this.allPlaceholders, query));
  }

  /**
   * Torna cada campo arrastável para dentro do texto.
   *
   * HTML5 puro, e não a API de drag-and-drop do UI5: o destino é o DOM do CKEditor, que não é um
   * controle UI5 — a `DragInfo`/`DropInfo` do UI5 só conversa entre controles dele. O CKEditor
   * recebe o `text/plain` pelo próprio pipeline de colagem.
   *
   * Religado a cada `updateFinished` porque filtrar a lista recria os itens.
   */
  onPlaceholderListUpdated(): void {
    const list = this.byId(PLACEHOLDER_LIST) as List;

    list?.getItems().forEach((item) => {
      // getDomRef() devolve Element; o arrasto é de HTMLElement.
      const element = item.getDomRef() as HTMLElement;
      const name = item.getBindingContext("placeholders")?.getProperty("Name") as string;
      const token = placeholderToken(name);

      if (!element || !token) {
        return;
      }

      element.setAttribute("draggable", "true");
      element.ondragstart = (ev: DragEvent) => {
        ev.dataTransfer?.setData("text/plain", token);
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "copy";
        }
      };
    });
  }

  /** O catálogo depende do escopo: trocar de Compra para Venda troca os campos disponíveis. */
  async onScopeChange(): Promise<void> {
    await this.loadPlaceholders(this.getView().getBindingContext()?.getProperty("ContractType") as string);
  }

  /** Clique insere no cursor — a alternativa ao arrasto, para quem preferir. */
  onInsertPlaceholder(ev: ListItemBase$PressEvent): void {
    const name = ev.getSource().getBindingContext("placeholders")?.getProperty("Name") as string;
    const token = placeholderToken(name);

    if (token) {
      this.editor()?.insertText(token);
    }
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
