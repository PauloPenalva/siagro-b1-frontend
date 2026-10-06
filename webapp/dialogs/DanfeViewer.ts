import Context from "sap/ui/model/odata/v4/Context";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import { correctionViewerOptions, danfeViewerOptions } from "siagrob1/helpers/NfeHelpers";

/**
 * DANFE do documento (entrada ou saída) no visualizador de anexos — o mesmo diálogo da minuta e dos anexos,
 * com "Baixar" no rodapé — em vez de abrir o PDF em outra aba.
 *
 * `printRoute`: a rota do Reports que gera o PDF por POST (`/reports/Danfe` ou `/reports/Danfe/purchase-invoices`).
 * Os campos do título vêm com `getProperty`, como o XML: se algum ainda não chegou, o título fica só "DANFE".
 */
export async function openDanfeViewer(printRoute: string, ctx: Context): Promise<void> {
  await openAttachmentViewer({
    url: `${printRoute}/${ctx.getProperty("Key") as string}/print`,
    method: "POST",
    errorMessage: "Falha ao gerar o DANFE.",
    ...danfeViewerOptions({
      ChaveNFe: ctx.getProperty("ChaveNFe") as string,
      TaxDocumentNumber: ctx.getProperty("TaxDocumentNumber") as string,
      TaxDocumentSeries: ctx.getProperty("TaxDocumentSeries") as string,
    }),
  });
}

/** PDF de uma CC-e no mesmo visualizador do DANFE. `printRoute` é a mesma do DANFE do documento. */
export async function openNfeCorrectionViewer(printRoute: string, ctx: Context, sequence: number): Promise<void> {
  await openAttachmentViewer({
    url: `${printRoute}/${ctx.getProperty("Key") as string}/cce/${sequence}/print`,
    method: "POST",
    errorMessage: "Falha ao gerar a carta de correção.",
    ...correctionViewerOptions({
      ChaveNFe: ctx.getProperty("ChaveNFe") as string,
      TaxDocumentNumber: ctx.getProperty("TaxDocumentNumber") as string,
      TaxDocumentSeries: ctx.getProperty("TaxDocumentSeries") as string,
    }, sequence),
  });
}
