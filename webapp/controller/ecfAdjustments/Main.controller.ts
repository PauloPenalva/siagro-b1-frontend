import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";

type Filter = {
  BranchCode: string;
  BranchName: string;
  Year: number;
  /** Filial/ano cujos dados estão na lista; incluir só vale para o que foi carregado. */
  LoadedFor: string;
  LoadedYear: number;
  loaded: boolean;
};

type Adjustment = {
  Id: string;
  Period: number;
  /** "Irpj", "Csll" ou "Both". */
  Tax: string;
  /** "Addition", "Exclusion" ou "LossOffset". */
  Kind: string;
  TableCode: string;
  Description: string;
  Amount: number;
  LedgerAccountCode: string;
  PartBAccountCode: string;
  PartBAccountName: string;
};

/** Dialogo trabalha com Period como texto (chave do Select). */
type Draft = Omit<Adjustment, "Period"> & { Period: string };

type PeriodOption = { key: string; text: string };

/**
 * Ajustes do LALUR/LACS da ECF (adições, exclusões e compensação de prejuízo) por filial e ano (só STANDALONE).
 * Os períodos oferecidos dependem da forma de apuração gravada nos parâmetros da ECF da filial.
 *
 * @namespace siagrob1.controller.ecfAdjustments
 */
export default class Main extends CommonController {
  onInit(): void {
    const filter = new JSONModel({
      BranchCode: "",
      BranchName: "",
      Year: new Date().getFullYear() - 1,
      LoadedFor: "",
      LoadedYear: 0,
      loaded: false,
    } as Filter);
    // O value help usa setValue (sem `change`): qualquer troca de filial/ano invalida a lista carregada.
    filter.attachPropertyChange((event) => {
      const path = event.getParameter("path");
      if (path === "/BranchCode" || path === "/Year") this.resetList();
    });
    this.getView().setModel(filter, "filter");
    this.getView().setModel(new JSONModel({ items: [] }), "list");
    this.getView().setModel(new JSONModel({ items: [] as PeriodOption[] }), "periods");
    this.getView().setModel(new JSONModel(Main.blankDraft("0")), "adj");
  }

  private static blankDraft(period: string): Draft {
    return {
      Id: "",
      Period: period,
      Tax: "Both",
      Kind: "Addition",
      TableCode: "",
      Description: "",
      Amount: 0,
      LedgerAccountCode: "",
      PartBAccountCode: "",
      PartBAccountName: "",
    };
  }

  private filterModel(): JSONModel {
    return this.getView().getModel("filter") as JSONModel;
  }

  private resetList(): void {
    (this.getView().getModel("list") as JSONModel).setData({ items: [] });
    this.filterModel().setProperty("/loaded", false);
  }

  /** Carrega a forma de apuração da filial (define os períodos) e os ajustes do ano. */
  async onLoad(): Promise<void> {
    const filter = this.filterModel().getData() as Filter;
    const branchCode = filter.BranchCode?.trim();
    const year = Number(filter.Year);
    if (!branchCode) {
      MessageBox.warning("Informe a filial.");
      return;
    }
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      MessageBox.warning("Informe um ano válido.");
      return;
    }

    this.setBusy(true);
    try {
      const settings = await sendJson("GET", `${ServerRoutes.ecfSettingsGet}(branchCode='${encodeURIComponent(branchCode.replace(/'/g, "''"))}')`);
      if (!settings.ok) {
        MessageBox.error(settings.message);
        return;
      }
      const form = odataValue<Record<string, unknown>>(settings.data)?.AssessmentForm;
      const options: PeriodOption[] =
        form === "Quarterly"
          ? [1, 2, 3, 4].map((q) => ({ key: String(q), text: `${q}º trimestre` }))
          : [{ key: "0", text: "Anual" }];
      (this.getView().getModel("periods") as JSONModel).setData({ items: options });

      const odataFilter = encodeURIComponent(`BranchCode eq '${branchCode.replace(/'/g, "''")}' and Year eq ${year}`);
      const result = await sendJson("GET", `${ServerRoutes.ecfAdjustments}?$filter=${odataFilter}&$orderby=Period,TableCode`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      (this.getView().getModel("list") as JSONModel).setData({ items: odataCollection<Adjustment>(result.data) });
      this.filterModel().setProperty("/LoadedFor", branchCode);
      this.filterModel().setProperty("/LoadedYear", year);
      this.filterModel().setProperty("/loaded", true);
    } finally {
      this.setBusy(false);
    }
  }

  private dialog(): Dialog {
    return this.byId("adjustmentDialog") as Dialog;
  }

  private draftModel(): JSONModel {
    return this.getView().getModel("adj") as JSONModel;
  }

  onAdd(): void {
    const options = (this.getView().getModel("periods") as JSONModel).getProperty("/items") as PeriodOption[];
    this.draftModel().setData(Main.blankDraft(options[0]?.key ?? "0"));
    this.dialog().setTitle("Novo ajuste");
    this.dialog().open();
  }

  onEdit(event: { getSource(): { getBindingContext(name: string): { getObject(): Adjustment } } }): void {
    const item = event.getSource().getBindingContext("list").getObject();
    this.draftModel().setData({
      ...item,
      Period: String(item.Period),
      LedgerAccountCode: item.LedgerAccountCode ?? "",
      PartBAccountCode: item.PartBAccountCode ?? "",
      PartBAccountName: item.PartBAccountName ?? "",
    } as Draft);
    this.dialog().setTitle("Editar ajuste");
    this.dialog().open();
  }

  onCancel(): void {
    this.dialog().close();
  }

  async onSaveAdjustment(): Promise<void> {
    const filter = this.filterModel().getData() as Filter;
    const d = this.draftModel().getData() as Draft;
    const payload = {
      BranchCode: filter.LoadedFor,
      Year: filter.LoadedYear,
      Period: Number(d.Period) || 0,
      Tax: d.Tax,
      Kind: d.Kind,
      TableCode: d.TableCode?.trim() ?? "",
      Description: d.Description?.trim() ?? "",
      Amount: Number(d.Amount) || 0,
      LedgerAccountCode: d.LedgerAccountCode?.trim() || null,
      PartBAccountCode: d.PartBAccountCode?.trim() || null,
      PartBAccountName: d.PartBAccountName?.trim() || null,
    };

    this.setBusy(true);
    try {
      const result = d.Id
        ? await sendJson("PATCH", `${ServerRoutes.ecfAdjustments}(${d.Id})`, payload)
        : await sendJson("POST", ServerRoutes.ecfAdjustments, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      this.dialog().close();
      MessageToast.show("Ajuste gravado.");
    } finally {
      this.setBusy(false);
    }
    await this.onLoad();
  }

  onDelete(event: { getSource(): { getBindingContext(name: string): { getObject(): Adjustment } } }): void {
    const item = event.getSource().getBindingContext("list").getObject();
    MessageBox.confirm(`Excluir o ajuste ${item.TableCode} - ${item.Description}?`, {
      actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
      emphasizedAction: MessageBox.Action.DELETE,
      onClose: (action: string) => {
        if (action === "DELETE") void this.deleteAdjustment(item);
      },
    });
  }

  private async deleteAdjustment(item: Adjustment): Promise<void> {
    this.setBusy(true);
    try {
      const result = await sendJson("DELETE", `${ServerRoutes.ecfAdjustments}(${item.Id})`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Ajuste excluído.");
    } finally {
      this.setBusy(false);
    }
    await this.onLoad();
  }
}
