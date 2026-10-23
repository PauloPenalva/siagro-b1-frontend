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
  BookNumber: number;
  HasNire: boolean;
  Nire: string;
  /** yyyy-MM-dd ou vazio. */
  ConstitutiveActsDate: string;
  LargeCompany: boolean;
  ReferentialPlanCode: string;
  SignerName: string;
  SignerCpf: string;
  SignerQualificationCode: string;
  SignerEmail: string;
  SignerPhone: string;
  AccountantCrcSequence: string;
  /** yyyy-MM-dd ou vazio. */
  AccountantCrcValidUntil: string;
};

const TEXT_KEYS = [
  "Nire", "ReferentialPlanCode", "SignerName", "SignerCpf", "SignerQualificationCode", "SignerEmail",
  "SignerPhone", "AccountantCrcSequence",
] as const;
const DATE_KEYS = ["ConstitutiveActsDate", "AccountantCrcValidUntil"] as const;

/**
 * Parâmetros da ECD (SPED Contábil) por filial (só STANDALONE): livro, NIRE, porte, plano referencial,
 * signatário e contabilista (J930). Filial sem gravação volta com os padrões do backend.
 *
 * @namespace siagrob1.controller.ecdSettings
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
      BookNumber: 1,
      HasNire: false,
      Nire: "",
      ConstitutiveActsDate: "",
      LargeCompany: false,
      ReferentialPlanCode: "1",
      SignerName: "",
      SignerCpf: "",
      SignerQualificationCode: "203",
      SignerEmail: "",
      SignerPhone: "",
      AccountantCrcSequence: "",
      AccountantCrcValidUntil: "",
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
      const result = await sendJson("GET", `${ServerRoutes.ecdSettingsGet}(branchCode='${encodeURIComponent(branchCode.replace(/'/g, "''"))}')`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      const data = odataValue<Record<string, unknown>>(result.data) ?? {};
      const loaded = { ...Main.blank(branchCode, branchName), LoadedFor: branchCode } as Settings;
      if (typeof data.BookNumber === "number") loaded.BookNumber = data.BookNumber;
      loaded.HasNire = data.HasNire === true;
      loaded.LargeCompany = data.LargeCompany === true;
      for (const key of TEXT_KEYS) {
        const value = data[key];
        if (typeof value === "string" && value !== "") loaded[key] = value;
      }
      // O backend devolve data/hora ("2020-01-31T00:00:00Z"): o DatePicker só quer o dia.
      for (const key of DATE_KEYS) {
        const value = data[key];
        loaded[key] = typeof value === "string" ? value.slice(0, 10) : "";
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

    // O backend recusa payload sem qualquer chave: todas seguem, as opcionais vazias como null.
    const payload: Record<string, unknown> = {
      BranchCode: data.BranchCode.trim(),
      BookNumber: Number(data.BookNumber) || 1,
      HasNire: data.HasNire,
      Nire: data.HasNire ? data.Nire || null : null,
      ConstitutiveActsDate: Main.toDateTime(data.ConstitutiveActsDate),
      LargeCompany: data.LargeCompany,
      ReferentialPlanCode: data.ReferentialPlanCode ?? "1",
      SignerName: data.SignerName ?? "",
      SignerCpf: data.SignerCpf ?? "",
      SignerQualificationCode: data.SignerQualificationCode || "203",
      SignerEmail: data.SignerEmail ?? "",
      SignerPhone: data.SignerPhone || null,
      AccountantCrcSequence: data.AccountantCrcSequence || null,
      AccountantCrcValidUntil: Main.toDateTime(data.AccountantCrcValidUntil),
    };

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.ecdSettingsSave, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Parâmetros da ECD gravados.");
    } finally {
      this.setBusy(false);
    }
  }

  /** Dia escolhido como data/hora UTC à meia-noite (formato que o OData aceita; o backend usa só o dia). */
  private static toDateTime(day: string): string {
    return day ? `${day}T00:00:00Z` : null;
  }
}
