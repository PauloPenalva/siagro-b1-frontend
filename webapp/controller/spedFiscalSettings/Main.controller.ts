import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";

type Settings = {
  BranchCode: string;
  BranchName: string;
  /** Filial cujos dados estão na tela; "Salvar" só vale quando é a filial atual. */
  LoadedFor: string;
  Profile: string;
  ActivityType: string;
  AccountantName: string;
  AccountantCpf: string;
  AccountantCrc: string;
  AccountantCnpj: string;
  AccountantZipCode: string;
  AccountantStreet: string;
  AccountantNumber: string;
  AccountantComplement: string;
  AccountantDistrict: string;
  AccountantPhone: string;
  AccountantEmail: string;
  AccountantMunicipalityCode: string;
  IcmsRevenueCode: string;
  IcmsDueDay: number;
};

const OPTIONAL_TEXT = [
  "AccountantCnpj", "AccountantZipCode", "AccountantStreet", "AccountantNumber", "AccountantComplement",
  "AccountantDistrict", "AccountantPhone", "AccountantEmail", "AccountantMunicipalityCode",
] as const;

/**
 * Parâmetros do SPED Fiscal por filial (só STANDALONE): perfil, atividade, contabilista (registro 0100) e
 * recolhimento do ICMS (registro E116). Filial sem gravação volta com os padrões do backend.
 *
 * @namespace siagrob1.controller.spedFiscalSettings
 */
export default class Main extends CommonController {
  onInit(): void {
    const model = new JSONModel(Main.blank("", ""));
    // O value help usa setValue (sem `change`): trocar a filial zera o formulário para não gravar A sob B.
    model.attachPropertyChange((event) => {
      if (event.getParameter("path") !== "/BranchCode") return;
      const data = model.getData() as Settings;
      if (data.BranchCode?.trim() !== data.LoadedFor) {
        model.setData(Main.blank(data.BranchCode, data.BranchName));
      }
    });
    this.getView().setModel(model, "settings");
  }

  private static blank(branchCode: string, branchName: string): Settings {
    return {
      BranchCode: branchCode,
      BranchName: branchName,
      LoadedFor: "",
      Profile: "A",
      ActivityType: "1",
      AccountantName: "",
      AccountantCpf: "",
      AccountantCrc: "",
      AccountantCnpj: "",
      AccountantZipCode: "",
      AccountantStreet: "",
      AccountantNumber: "",
      AccountantComplement: "",
      AccountantDistrict: "",
      AccountantPhone: "",
      AccountantEmail: "",
      AccountantMunicipalityCode: "",
      IcmsRevenueCode: "",
      IcmsDueDay: 10,
    };
  }

  private model(): JSONModel {
    return this.getView().getModel("settings") as JSONModel;
  }

  /** Carrega os parâmetros da filial escolhida (o value help só preenche o código). */
  async onLoad(): Promise<void> {
    const branchCode = (this.model().getProperty("/BranchCode") as string)?.trim();
    if (!branchCode) {
      MessageBox.warning("Informe a filial.");
      return;
    }
    const branchName = this.model().getProperty("/BranchName") as string;

    this.setBusy(true);
    try {
      const result = await sendJson("GET", `${ServerRoutes.spedFiscalSettingsGet}(branchCode='${encodeURIComponent(branchCode.replace(/'/g, "''"))}')`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      const data = odataValue<Record<string, string | number>>(result.data) ?? {};
      const blank = Main.blank(branchCode, branchName);
      const loaded: Record<string, string | number> = { ...blank, LoadedFor: branchCode };
      for (const key of Object.keys(blank)) {
        if (key === "BranchCode" || key === "BranchName" || key === "LoadedFor") continue;
        const value = data[key];
        if (value !== null && value !== undefined) loaded[key] = key === "ActivityType" ? String(value) : value;
      }
      this.model().setData(loaded);
    } finally {
      this.setBusy(false);
    }
  }

  async onSave(): Promise<void> {
    const data = this.model().getData() as Settings;
    if (!data.BranchCode?.trim()) {
      MessageBox.warning("Informe a filial.");
      return;
    }
    if (data.BranchCode.trim() !== data.LoadedFor) {
      MessageBox.warning("Clique em Carregar para a filial escolhida antes de salvar.");
      return;
    }

    const payload: Record<string, unknown> = {
      BranchCode: data.BranchCode.trim(),
      Profile: data.Profile,
      ActivityType: Number(data.ActivityType),
      AccountantName: data.AccountantName ?? "",
      AccountantCpf: data.AccountantCpf ?? "",
      AccountantCrc: data.AccountantCrc ?? "",
      IcmsRevenueCode: data.IcmsRevenueCode ?? "",
      IcmsDueDay: Number(data.IcmsDueDay) || 10,
    };
    for (const key of OPTIONAL_TEXT) payload[key] = data[key] || null;

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.spedFiscalSettingsSave, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Parâmetros do SPED Fiscal gravados.");
    } finally {
      this.setBusy(false);
    }
  }
}
