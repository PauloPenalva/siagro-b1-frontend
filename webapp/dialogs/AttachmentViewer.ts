import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import Image from "sap/m/Image";
import MessageBox from "sap/m/MessageBox";
import MessageStrip from "sap/m/MessageStrip";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import HTML from "sap/ui/core/HTML";
import Control from "sap/ui/core/Control";
import Device from "sap/ui/Device";
import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import {
  AttachmentViewerKind,
  normalizeContentType,
  parseContentDispositionFileName,
  resolveContentType,
  resolveViewerKind,
} from "siagrob1/helpers/AttachmentViewerHelpers";

export type AttachmentViewerOptions = {
  /** Rota que devolve o binário, ex.: `/odata/ShipmentLoadsAttachmentsDownload(Key=...)`. */
  url: string;
  /** Nome para o Baixar e o título. Ausente: lido do Content-Disposition. */
  fileName?: string;
  /** Título do diálogo. Default: o nome do arquivo. */
  title?: string;
};

/**
 * Visualiza um anexo num diálogo, sem baixar (GAC-1171, melhorias). Reaproveitado pela carga e
 * pelos contratos.
 *
 * Montado em código, e não por fragmento: qualquer controller chama sem depender do id da view
 * nem de `addDependent`. Cada abertura cria o seu diálogo e o destrói ao fechar.
 *
 * O arquivo vem por `fetch` → blob → object URL. Um blob não tem `Content-Disposition`, então as
 * rotas de download existentes, que mandam o navegador BAIXAR, servem sem mudança no backend. O
 * Baixar do rodapé reaproveita o mesmo blob, sem refazer a requisição.
 */
export async function openAttachmentViewer(options: AttachmentViewerOptions): Promise<void> {
  BusyIndicator.show(0);

  let response: Response | undefined;
  let blob: Blob | undefined;

  try {
    response = await fetch(options.url);

    if (!response.ok) {
      const message = await readErrorMessage(response);
      MessageBox.error(message || "Não foi possível abrir o anexo.");
      return;
    }

    blob = await response.blob();
  } catch {
    MessageBox.error("Não foi possível abrir o anexo.");
    return;
  } finally {
    BusyIndicator.hide();
  }

  // Inalcançável na prática (os dois caminhos de erro já retornaram), mas o TypeScript não
  // prova atribuição feita dentro de try/catch.
  if (!response || !blob) return;

  const fileName = options.fileName
    || parseContentDispositionFileName(response.headers.get("Content-Disposition"))
    || "anexo";

  const contentType = resolveContentType(blob.type || response.headers.get("Content-Type"), fileName);
  const kind = resolveViewerKind(contentType);

  // O blob só é refeito quando o tipo dele difere do resolvido: com octet-stream o iframe
  // BAIXARIA o PDF em vez de exibi-lo, que é justamente o defeito que o diálogo existe para
  // resolver. Quando o tipo já bate, fica o blob ORIGINAL, que guarda o charset do texto
  // ("text/plain;charset=utf-8"); refeito só com "text/plain", o acento sairia trocado.
  const typedBlob = normalizeContentType(blob.type) === contentType
    ? blob
    : new Blob([blob], { type: contentType });
  const objectUrl = URL.createObjectURL(typedBlob);

  const dialog = new Dialog({
    title: options.title ?? fileName,
    contentWidth: "80%",
    contentHeight: "85%",
    resizable: true,
    draggable: true,
    stretch: Device.system.phone,
    horizontalScrolling: false,
    verticalScrolling: kind === "image",
    content: [buildContent(kind, objectUrl, fileName)],
    beginButton: new Button({
      text: "Baixar",
      icon: "sap-icon://download",
      press: () => download(objectUrl, fileName),
    }),
    endButton: new Button({
      text: "Fechar",
      press: () => dialog.close(),
    }),
    afterClose: () => {
      URL.revokeObjectURL(objectUrl);
      dialog.destroy();
    },
  });

  // Mesma densidade dos diálogos do DialogHelper.
  dialog.addStyleClass("sapUiSizeCompact");
  dialog.open();
}

function buildContent(kind: AttachmentViewerKind, objectUrl: string, fileName: string): Control {
  if (kind === "pdf" || kind === "text") {
    // O src é um blob: URL que este módulo criou, nunca texto do usuário, por isso pode entrar
    // no HTML sem escape. O nome do arquivo NÃO entra aqui.
    return new HTML({
      content: `<iframe src="${objectUrl}" title="Visualização do anexo" style="width:100%;height:100%;border:0;display:block"></iframe>`,
      sanitizeContent: false,
      preferDOM: false,
    });
  }

  if (kind === "image") {
    // `decorative: false` é o que faz o `alt` valer: o default do sap.m.Image é decorativo, e
    // imagem decorativa sai sem ALT. Aqui a imagem É o conteúdo do diálogo.
    return new Image({
      src: objectUrl,
      decorative: false,
      alt: fileName,
      densityAware: false,
      width: "100%",
    });
  }

  return new MessageStrip({
    text: "Pré-visualização indisponível para este tipo de arquivo. Use Baixar.",
    type: "Information",
    showIcon: true,
  }).addStyleClass("sapUiSmallMargin");
}

function download(objectUrl: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
