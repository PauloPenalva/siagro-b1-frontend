/**
 * Regras puras do visualizador de anexos (GAC-1171, melhorias): qual o tipo real do arquivo,
 * se o diálogo pode exibi-lo, e com que nome ele é baixado. Ficam fora do diálogo para serem
 * testadas sem DOM.
 */

export type AttachmentViewerKind = "pdf" | "image" | "text" | "unsupported";

/** Só extensões de tipo EXIBÍVEL: o resto não precisa ser adivinhado, vai para Baixar. */
const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  txt: "text/plain",
};

/**
 * `Content-Type` sem parâmetros (`; charset=...`), minúsculo e sem espaços nas pontas. Usado
 * tanto para achar o tipo (`resolveContentType`) quanto para decidir se ele é exibível
 * (`resolveViewerKind`), para as duas funções concordarem sobre o que é "o mesmo tipo". O
 * diálogo também a usa para saber se o blob recebido já tem o tipo resolvido.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- idem: aceita o mesmo contrato nulável dos chamadores.
export function normalizeContentType(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Tipo do arquivo: o `Content-Type` da resposta, ou a extensão do nome quando ele vier vazio ou
 * genérico. Anexos antigos de contrato foram gravados como `application/octet-stream`, e sem o
 * fallback nenhum PDF deles abriria.
 */
export function resolveContentType(
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks está desligado no tsconfig, mas a assinatura documenta o contrato real do chamador.
  contentType: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- idem: o backend pode devolver o fileName vazio.
  fileName: string | null | undefined,
): string {
  const type = normalizeContentType(contentType);

  if (type && type !== "application/octet-stream") return type;

  const name = fileName ?? "";
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";

  return EXTENSION_TYPES[extension] ?? "application/octet-stream";
}

/**
 * O que o diálogo faz com o tipo.
 *
 * ⚠️ Lista FECHADA, e de propósito. Um blob URL herda a ORIGEM da aplicação: um HTML ou SVG
 * anexado e aberto no iframe rodaria script com a sessão do usuário logado. Por isso só PDF,
 * imagem raster e `text/plain` são exibidos; o resto, inclusive `text/html` e `image/svg+xml`,
 * cai no aviso com o botão Baixar. `sandbox` no iframe não resolve, porque bloqueia o leitor de
 * PDF do Chrome.
 *
 * Self-defending: normaliza o próprio `contentType` (parâmetros, caixa, espaços) em vez de
 * confiar que o chamador já passou por `resolveContentType`. Sem isso, um `Content-Type` com
 * parâmetro como `image/svg+xml; charset=utf-8` não batia com o `===` exato, caía no
 * `startsWith("image/")` seguinte e era classificado (e exibido) como imagem — justo a exclusão
 * que esta função existe para garantir.
 */
export function resolveViewerKind(contentType: string): AttachmentViewerKind {
  const type = normalizeContentType(contentType);

  if (type === "application/pdf") return "pdf";
  if (type === "image/svg+xml") return "unsupported";
  if (type.startsWith("image/")) return "image";
  if (type === "text/plain") return "text";
  return "unsupported";
}

/**
 * Nome do arquivo no `Content-Disposition` que o `File(bytes, type, name)` do ASP.NET manda.
 * Prefere `filename*` (RFC 5987, UTF-8 percent-encoded), que é o único que preserva acento, e
 * cai no `filename` simples se o estendido vier malformado.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- idem: assinatura documenta o contrato real (header pode faltar; sem match devolve null).
export function parseContentDispositionFileName(header: string | null | undefined): string | null {
  if (!header) return null;

  const extended = /filename\*\s*=\s*utf-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // percent-encoding inválido: tenta o filename simples abaixo.
    }
  }

  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const value = (plain?.[1] ?? plain?.[2] ?? "").trim();

  return value || null;
}
