import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";

/** O pouco da API do CKEditor que este controle usa. O bundle não traz tipos para o UI5. */
type CkEditor = {
  getData: () => string;
  setData: (html: string) => void;
  destroy: () => Promise<void>;
  enableReadOnlyMode: (id: string) => void;
  disableReadOnlyMode: (id: string) => void;
  ui: { view: { toolbar: { element: HTMLElement } }; getEditableElement: () => HTMLElement };
  model: {
    change: (fn: (writer: { createText: (t: string) => unknown }) => void) => void;
    insertContent: (content: unknown) => void;
    document: { on: (event: string, fn: () => void) => void };
  };
};

type CkEditorClass = {
  /** Recebe o HTML inicial; o build *decoupled* não aceita montar-se sozinho num elemento. */
  create: (initialData: string, config: object) => Promise<CkEditor>;
};

/** Trava de somente-leitura; o CKEditor exige um identificador para quem pediu a trava. */
const READ_ONLY_LOCK = "siagrob1";

/**
 * O bundle é carregado UMA vez por aplicação, não por instância: são 1,47 MB, e a segunda tela
 * que abrir um editor não espera nada. Também encurta a janela de corrida com o re-render do
 * UI5, que só existe enquanto o download acontece.
 */
let libraryPromise: Promise<CkEditorClass>;

function loadLibrary(): Promise<CkEditorClass> {
  libraryPromise ??= new Promise<CkEditorClass>((resolve, reject) => {
    sap.ui.require(
      ["siagrob1/thirdparty/ckeditor/ckeditor", "siagrob1/thirdparty/ckeditor/translations/pt-br"],
      (Editor: CkEditorClass) =>
        resolve(Editor ?? (window as unknown as { DecoupledEditor: CkEditorClass }).DecoupledEditor),
      reject
    );
  });

  return libraryPromise;
}

/**
 * Editor de documento, sobre o CKEditor 5 build *decoupled*.
 *
 * "Decoupled" quer dizer que a barra de ferramentas é um elemento separado da área editável: a
 * barra fica acima, e o texto ganha aparência de papel. É o mesmo build e a mesma barra do
 * editor de minutas do Siagro Angular — ver `webapp/thirdparty/ckeditor/README.md`, inclusive
 * quanto à licença.
 *
 * O bundle (1,47 MB) é carregado SOB DEMANDA, no primeiro render: só quem abre as telas de
 * modelo e de texto da minuta paga o download.
 *
 * @namespace siagrob1.control
 */
export default class CkDocumentEditor extends Control {

  static readonly metadata = {
    properties: {
      /** HTML do documento. Ligação bidirecional, como no RichTextEditor do UI5. */
      value: { type: "string", defaultValue: "" },
      height: { type: "sap.ui.core.CSSSize", defaultValue: "32rem" },
      editable: { type: "boolean", defaultValue: true },
    },
    events: {
      change: { parameters: { value: { type: "string" } } },
    },
  };

  static renderer = {
    apiVersion: 2,
    render(rm: RenderManager, control: CkDocumentEditor): void {
      rm.openStart("div", control);
      rm.class("siagroCkEditor");
      rm.openEnd();

      // Duas divs irmãs: a barra que o CKEditor vai preencher, e a área editável.
      rm.openStart("div", `${control.getId()}-toolbar`);
      rm.class("siagroCkToolbar");
      rm.openEnd();
      rm.close("div");

      rm.openStart("div", `${control.getId()}-editable`);
      rm.class("siagroCkEditable");
      rm.style("height", control.getHeight());
      rm.openEnd();
      rm.close("div");

      rm.close("div");
    },
  };

  // Acessores que o UI5 GERA em tempo de execução a partir do `metadata` acima. O projeto não
  // usa o @ui5/ts-interface-generator, então eles são declarados à mão para o TypeScript —
  // `declare` não emite código nenhum, só informa o tipo.
  declare getValue: () => string;
  declare getHeight: () => string;
  declare getEditable: () => boolean;
  declare fireChange: (parameters?: { value?: string }) => this;

  private editor: CkEditor;
  private creating = false;
  /** Houve um render enquanto a biblioteca carregava; refazer a criação ao terminar. */
  private renderPending = false;

  /**
   * Grava sem invalidar: reescrever o DOM a cada tecla destruiria o editor e o cursor. O valor
   * novo é empurrado para dentro do CKEditor, não para o renderizador do UI5.
   */
  setValue(value: string): this {
    const current = this.getValue();

    if (value === current) {
      return this;
    }

    this.setProperty("value", value ?? "", true);

    if (this.editor && this.editor.getData() !== (value ?? "")) {
      this.editor.setData(value ?? "");
    }

    return this;
  }

  setEditable(editable: boolean): this {
    this.setProperty("editable", editable, true);
    this.applyEditable();

    return this;
  }

  /** Insere texto na posição do cursor — é o que o painel de campos usa no clique. */
  insertText(text: string): void {
    if (!text || !this.editor) {
      return;
    }

    this.editor.model.change((writer) => {
      this.editor.model.insertContent(writer.createText(text));
    });
  }

  onBeforeRendering(): void {
    // O render apaga as duas divs; o editor preso a elas tem de sair junto, ou fica um editor
    // órfão segurando DOM que não existe mais.
    this.destroyEditor();
  }

  onAfterRendering(): void {
    void this.createEditor();
  }

  exit(): void {
    this.destroyEditor();
  }

  private async createEditor(): Promise<void> {
    // Um render durante o carregamento da biblioteca não pode simplesmente ser ignorado: as
    // divs em que o editor seria montado acabaram de ser trocadas, e desistir aqui deixava a
    // tela com um editor vazio e sem conteúdo. Anota e refaz ao terminar.
    if (this.creating) {
      this.renderPending = true;
      return;
    }

    if (this.editor) {
      return;
    }

    this.creating = true;

    try {
      const EditorClass = await loadLibrary();
      const editable = document.getElementById(`${this.getId()}-editable`);
      const toolbar = document.getElementById(`${this.getId()}-toolbar`);

      // Entre o await e aqui o controle pode ter sido destruído ou re-renderizado.
      if (!editable || !toolbar || !this.getDomRef()) {
        return;
      }

      // `create` recebe o HTML inicial, não um elemento: no build *decoupled* o CKEditor NÃO
      // insere nada no DOM — nem a barra, nem a área editável. Passar um elemento só serviria
      // para ler o conteúdo dele, e a área editável continuaria fora da página. Quem monta as
      // duas é este controle, logo abaixo.
      // SEM `toolbar`: vale a barra padrão do build — desfazer/refazer, parágrafo, fonte,
      // tamanho, cor, fundo, negrito, itálico, sublinhado, tachado, link, imagem, tabela,
      // citação, mídia, alinhamento, listas e recuo.
      //
      // É de propósito que ela não é customizada: o editor do Siagro Angular declara um
      // `editorConfig` com uma barra reduzida, mas o template dele NUNCA passa esse config ao
      // `<ckeditor>` — não há `[config]`. Na prática, lá roda a barra padrão, e é essa que os
      // usuários conhecem. Copiar o `editorConfig` reproduziria a intenção do código, não a tela.
      const editor = await EditorClass.create(this.getValue() ?? "", { language: "pt-br" });

      if (!this.getDomRef()) {
        void editor.destroy();
        return;
      }

      this.editor = editor;
      toolbar.appendChild(editor.ui.view.toolbar.element);
      editable.appendChild(editor.ui.getEditableElement());
      this.applyEditable();

      // Guarda defensiva, não correção de defeito observado: o ouvinte continua vivo enquanto
      // o editor é destruído, e sem conferir a identidade um editor em destruição poderia
      // gravar o próprio esvaziamento na propriedade, zerando o documento.
      editor.model.document.on("change:data", () => {
        if (this.editor === editor) {
          this.pushValueOut();
        }
      });
    } finally {
      this.creating = false;

      if (this.renderPending) {
        this.renderPending = false;
        void this.createEditor();
      }
    }
  }

  /** O valor digitado volta ao modelo a cada mudança, sem esperar o blur. */
  private pushValueOut(): void {
    const data = this.editor.getData();

    if (data === this.getValue()) {
      return;
    }

    this.setProperty("value", data, true);
    this.fireChange({ value: data });
  }

  private applyEditable(): void {
    if (!this.editor) {
      return;
    }

    if (this.getEditable()) {
      this.editor.disableReadOnlyMode(READ_ONLY_LOCK);
    } else {
      this.editor.enableReadOnlyMode(READ_ONLY_LOCK);
    }
  }

  private destroyEditor(): void {
    if (!this.editor) {
      return;
    }

    const editor = this.editor;
    this.editor = undefined;
    void editor.destroy();
  }

}
