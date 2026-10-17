import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Text from "sap/m/Text";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import Select from "sap/m/Select";
import MessageBox from "sap/m/MessageBox";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { NfeSeries, formatNfeSeries, pickInitialSeries } from "siagrob1/helpers/NfeSeriesHelpers";

type BranchNfeSeriesSettings = { DefaultSeries: number; SeriesList: NfeSeries[] };

export type NfeIssueDialogOptions = {
  title: string;
  message: string;
  confirmText: string;
  branchCode: string;
  /** Série já gravada no documento (ex.: devolução própria); pré-seleciona se estiver na lista. */
  documentSeries?: string;
};

/**
 * Confirma a emissão da NF-e pedindo a série. Lê as séries da filial; devolve a série escolhida
 * ou `null` se o usuário desistiu (ou se a leitura das séries falhou, caso em que mostra o erro).
 */
export async function openNfeIssueDialog(owner: Control, opts: NfeIssueDialogOptions): Promise<number> {
  const result = await sendJson("GET", `${ServerRoutes.branchNfeSettingsGet}(BranchCode='${encodeURIComponent(opts.branchCode)}')`);
  if (!result.ok) {
    MessageBox.error(result.message);
    return null;
  }

  const settings = odataValue<BranchNfeSeriesSettings>(result.data);
  const list = settings.SeriesList ?? [];

  return new Promise((resolve) => {
    let chosen: number = null;

    const select = new Select({
      width: "100%",
      items: list.map((s) => new Item({ key: String(s.Series), text: formatNfeSeries(s) })),
      selectedKey: String(pickInitialSeries(list, settings.DefaultSeries, opts.documentSeries)),
    });

    const dialog = new Dialog({
      title: opts.title,
      contentWidth: "28rem",
      content: new VBox({
        items: [
          new Text({ text: opts.message }),
          new Label({ text: "Série", required: true, labelFor: select }).addStyleClass("sapUiSmallMarginTop"),
          select,
        ],
      }).addStyleClass("sapUiSmallMargin"),
      beginButton: new Button({
        text: opts.confirmText, type: "Emphasized",
        press: () => { chosen = Number(select.getSelectedKey()); dialog.close(); },
      }),
      endButton: new Button({ text: "Cancelar", press: () => dialog.close() }),
      afterClose: () => { dialog.destroy(); resolve(chosen); },
    });

    owner.addDependent(dialog);
    dialog.open();
  });
}
