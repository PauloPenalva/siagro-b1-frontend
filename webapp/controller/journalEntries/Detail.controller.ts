import CommonController from "siagrob1/controller/common/CommonController";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import DatePicker from "sap/m/DatePicker";
import Button from "sap/m/Button";
import Label from "sap/m/Label";
import VBox from "sap/m/VBox";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { entryTypeText, formatMoney, originText } from "./JournalEntryFormat";

type JournalEntryDoc = { DocEntry: number; PostingDate: string; ReversedByDocEntry?: number };

/**
 * Detalhe do lançamento contábil: cabeçalho, linhas e estorno (lançamento gravado não se edita nem se apaga).
 * Lido de uma vez com $expand para um JSON model: neste projeto a navegação OData /Lines dá 404, e a grade
 * relativa sob autoExpandSelect pediria a navegação por conta própria.
 *
 * @namespace siagrob1.controller.journalEntries
 */
export default class Detail extends CommonController {
  originText = originText;
  entryTypeText = entryTypeText;
  formatMoney = formatMoney;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "doc");
    this.getRouter().getRoute("journalEntriesDetail").attachPatternMatched((ev) => void this.routeMatched(ev));
  }

  private model(): JSONModel {
    return this.getView().getModel("doc") as JSONModel;
  }

  private async routeMatched(ev: Route$MatchedEvent): Promise<void> {
    const { id } = ev.getParameter("arguments") as { id: string };
    await this.load(Number(id));
  }

  private async load(docEntry: number): Promise<void> {
    this.model().setData({});
    this.setBusy(true);
    try {
      const result = await sendJson("GET",
        `${ServerRoutes.journalEntries}(${docEntry})?$expand=Lines($orderby=LineNumber)`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      this.model().setData(odataValue<object>(result.data));
    } finally {
      this.setBusy(false);
    }
  }

  /** Data Edm.Date (yyyy-MM-dd) em dd/MM/yyyy, sem passar por Date (evita deslocamento de fuso). */
  dateText(value: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  }

  onOpenReversedBy(): void {
    this.navTo("journalEntriesDetail", { id: String(this.model().getProperty("/ReversedByDocEntry")) });
  }

  onOpenReversalOf(): void {
    this.navTo("journalEntriesDetail", { id: String(this.model().getProperty("/ReversalOfDocEntry")) });
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
    const doc = this.model().getData() as JournalEntryDoc;
    this.setBusy(true);
    try {
      // Meio-dia UTC: o parâmetro da action é DateTimeOffset e o servidor usa só a data.
      const result = await sendJson("POST", ServerRoutes.journalEntriesReverse, {
        DocEntry: doc.DocEntry, Date: `${date}T12:00:00Z`,
      });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Lançamento estornado.", { closeOnBrowserNavigation: false });
      const reversal = odataValue<{ DocEntry: number }>(result.data);
      if (reversal?.DocEntry) this.navTo("journalEntriesDetail", { id: String(reversal.DocEntry) });
    } finally {
      this.setBusy(false);
    }
  }
}
