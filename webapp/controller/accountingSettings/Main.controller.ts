import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";

type AccountingSettings = {
  CutoverDate?: string;
  DefaultResultClosingAccountCode?: string;
  ClosingFrequency: "Monthly" | "Yearly";
};

/** Valores numéricos de AccountingClosingFrequency no backend (a action recebe o número). */
const FREQUENCY = { Monthly: 1, Yearly: 2 } as const;

/**
 * Configurações contábeis da empresa (só STANDALONE): data de corte da contabilização automática, conta de
 * apuração padrão e periodicidade da apuração de resultado.
 *
 * @namespace siagrob1.controller.accountingSettings
 */
export default class Main extends CommonController {
  onInit(): void {
    this.getView().setModel(new JSONModel({}), "settings");
    this.getRouter().getRoute("accountingSettings").attachPatternMatched(() => void this.load());
  }

  private model(): JSONModel {
    return this.getView().getModel("settings") as JSONModel;
  }

  private async load() {
    this.setBusy(true);
    try {
      const result = await sendJson("GET", ServerRoutes.accountingSettingsGet);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      const data = odataValue<AccountingSettings>(result.data);
      this.model().setData({
        CutoverDate: data?.CutoverDate ? data.CutoverDate.substring(0, 10) : null,
        DefaultResultClosingAccountCode: data?.DefaultResultClosingAccountCode ?? null,
        ClosingFrequency: data?.ClosingFrequency ?? "Monthly",
      });
    } finally {
      this.setBusy(false);
    }
  }

  async onSave() {
    const data = this.model().getData() as AccountingSettings;
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.accountingSettingsSave, {
        CutoverDate: data.CutoverDate || null,
        DefaultResultClosingAccountCode: data.DefaultResultClosingAccountCode || null,
        ClosingFrequency: FREQUENCY[data.ClosingFrequency] ?? FREQUENCY.Monthly,
      });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Configurações contábeis gravadas.");
      await this.load();
    } finally {
      this.setBusy(false);
    }
  }
}
