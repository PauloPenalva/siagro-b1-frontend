import CommonController from "siagrob1/controller/common/CommonController";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Dialog from "sap/m/Dialog";
import DatePicker from "sap/m/DatePicker";
import Button from "sap/m/Button";
import Label from "sap/m/Label";
import VBox from "sap/m/VBox";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Context from "sap/ui/model/odata/v4/Context";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { entryTypeText, formatMoney, originText } from "./JournalEntryFormat";

/**
 * Detalhe do lançamento contábil: cabeçalho, linhas e estorno (lançamento gravado não se edita nem se apaga).
 * @namespace siagrob1.controller.journalEntries
 */
export default class Detail extends CommonController {
  originText = originText;
  entryTypeText = entryTypeText;
  formatMoney = formatMoney;

  onInit(): void {
    this.getRouter().getRoute("journalEntriesDetail").attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    this.getView().bindElement({
      path: `/JournalEntries(${Number(id)})`,
      parameters: { $expand: "Lines" },
      events: {
        dataRequested: () => this.setBusy(true),
        dataReceived: () => this.setBusy(false),
      },
    });
  }

  private context(): Context {
    return this.getView().getBindingContext() as Context;
  }

  onOpenReversedBy(): void {
    this.navTo("journalEntriesDetail", { id: String(this.context().getProperty("ReversedByDocEntry")) });
  }

  onOpenReversalOf(): void {
    this.navTo("journalEntriesDetail", { id: String(this.context().getProperty("ReversalOfDocEntry")) });
  }

  onReverse(): void {
    const picker = new DatePicker({
      valueFormat: "yyyy-MM-dd", displayFormat: "dd/MM/yyyy", value: localIsoDate(new Date()), width: "100%",
    });
    const dialog = new Dialog({
      title: "Estornar lançamento",
      contentWidth: "22rem",
      content: [new VBox({ items: [new Label({ text: "Data do estorno", labelFor: picker }), picker] }).addStyleClass("sapUiSmallMargin")],
      beginButton: new Button({
        text: "Estornar", type: "Reject",
        press: () => {
          const date = picker.getValue();
          if (!date) {
            picker.setValueState("Error");
            return;
          }
          dialog.close();
          void this.reverse(date);
        },
      }),
      endButton: new Button({ text: "Cancelar", press: () => dialog.close() }),
      afterClose: () => dialog.destroy(),
    });
    this.getView().addDependent(dialog);
    dialog.open();
  }

  private async reverse(date: string): Promise<void> {
    this.setBusy(true);
    try {
      // Meio-dia UTC: o servidor usa só a data, e o dia não muda em nenhum fuso do Brasil.
      const result = await sendJson("POST", ServerRoutes.journalEntriesReverse, {
        DocEntry: this.context().getProperty("DocEntry") as number, Date: `${date}T12:00:00Z`,
      });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Lançamento estornado.");
      const reversal = odataValue<{ DocEntry: number }>(result.data);
      void this.context().requestSideEffects(["ReversedByDocEntry"]);
      if (reversal?.DocEntry) this.navTo("journalEntriesDetail", { id: String(reversal.DocEntry) });
    } finally {
      this.setBusy(false);
    }
  }
}
