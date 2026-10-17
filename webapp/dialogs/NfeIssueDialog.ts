import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Text from "sap/m/Text";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import Select from "sap/m/Select";
import MessageBox from "sap/m/MessageBox";
import MessageStrip from "sap/m/MessageStrip";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { NfeSeries, abandonedReservationWarning, formatNfeSeries, pickInitialSeries } from "siagrob1/helpers/NfeSeriesHelpers";

type BranchNfeSeriesSettings = { DefaultSeries: number; SeriesList: NfeSeries[] };

export type NfeIssueDialogOptions = {
  title: string;
  message: string;
  confirmText: string;
  branchCode: string;
  /** Série já gravada no documento (ex.: devolução própria); pré-seleciona se estiver na lista. */
  documentSeries?: string;
  /** Nº já reservado no documento; com a série, serve para avisar que trocar de série abandona a reserva. */
  documentNumber?: string;
};

/**
 * Trava de reentrância: o duplo clique em "emitir" chamaria o diálogo duas vezes (a leitura das séries
 * é assíncrona e o botão que o abre continua clicável). Enquanto um diálogo carrega ou está aberto,
 * outra chamada resolve null na hora.
 */
let dialogActive = false;

/**
 * Confirma a emissão da NF-e pedindo a série. Lê as séries da filial; devolve a série escolhida
 * ou `null` se o usuário desistiu (ou se a leitura das séries falhou, caso em que mostra o erro).
 */
export async function openNfeIssueDialog(owner: Control, opts: NfeIssueDialogOptions): Promise<number> {
  if (dialogActive) {
    return null;
  }
  dialogActive = true;

  // Ocupa a tela enquanto lê as séries (o owner é a view nos três chamadores).
  const busyOwner = owner as Control & { setBusy?: (busy: boolean) => unknown };
  busyOwner.setBusy?.(true);
  let settings: BranchNfeSeriesSettings;
  try {
    const result = await sendJson("GET", `${ServerRoutes.branchNfeSettingsGet}(BranchCode='${encodeURIComponent(opts.branchCode)}')`);
    if (!result.ok) {
      MessageBox.error(result.message);
      dialogActive = false;
      return null;
    }
    settings = odataValue<BranchNfeSeriesSettings>(result.data);
  } catch (error) {
    dialogActive = false;
    throw error;
  } finally {
    busyOwner.setBusy?.(false);
  }

  const list = settings.SeriesList ?? [];
  if (list.length === 0) {
    MessageBox.error("Nenhuma série cadastrada na Configuração da NF-e da filial.");
    dialogActive = false;
    return null;
  }

  return new Promise((resolve) => {
    let chosen: number = null;
    let dialog: Dialog;

    try {
    const warning = new MessageStrip({ type: "Warning", showIcon: true, visible: false }).addStyleClass("sapUiSmallMarginTop");
    const updateWarning = () => {
      const text = abandonedReservationWarning(opts.documentSeries, opts.documentNumber, Number(select.getSelectedKey()));
      warning.setText(text);
      warning.setVisible(text !== "");
    };

    const select = new Select({
      width: "100%",
      items: list.map((s) => new Item({ key: String(s.Series), text: formatNfeSeries(s) })),
      selectedKey: String(pickInitialSeries(list, settings.DefaultSeries, opts.documentSeries)),
      change: updateWarning,
    });
    updateWarning();

    dialog = new Dialog({
      title: opts.title,
      contentWidth: "28rem",
      content: new VBox({
        items: [
          new Text({ text: opts.message }),
          new Label({ text: "Série", required: true, labelFor: select }).addStyleClass("sapUiSmallMarginTop"),
          select,
          warning,
        ],
      }).addStyleClass("sapUiSmallMargin"),
      beginButton: new Button({
        text: opts.confirmText, type: "Emphasized",
        press: () => { chosen = Number(select.getSelectedKey()); dialog.close(); },
      }),
      endButton: new Button({ text: "Cancelar", press: () => dialog.close() }),
      afterClose: () => { dialog.destroy(); dialogActive = false; resolve(chosen); },
    });

    owner.addDependent(dialog);
    dialog.open();
    } catch (error) {
      // Falha ao montar o diálogo: libera a trava, senão nenhuma emissão abriria até recarregar a página.
      dialog?.destroy();
      dialogActive = false;
      MessageBox.error(error instanceof Error ? error.message : "Não foi possível abrir o diálogo.");
      resolve(null);
    }
  });
}
