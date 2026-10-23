import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";

type Settings = {
  BranchCode: string;
  BranchName: string;
  /** Filial cujos dados estão na tela; "Salvar" só vale quando é a filial atual. */
  LoadedFor: string;
  /** "Annual" ou "Quarterly". */
  AssessmentForm: string;
  MainCnae: string;
  LegalEntityQualification: string;
  NatureCode: string;
  PreviousEcfHash: string;
};

type Partner = {
  Id: string;
  Name: string;
  TaxId: string;
  Qualification: string;
  VotingCapitalPercent: number;
  TotalCapitalPercent: number;
  CountryCode: string;
};

type PartnersState = { items: Partner[]; totalPercent: number; balanced: boolean; totalText: string; loaded: boolean };

/**
 * Parâmetros da ECF (Lucro Real) por filial (só STANDALONE): forma de apuração, CNAE, natureza jurídica e
 * qualificação da PJ, mais o quadro societário (Y600) da filial.
 *
 * @namespace siagrob1.controller.ecfSettings
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
        this.partnersModel().setData(Main.emptyPartners());
      }
    });
    this.getView().setModel(model, "settings");
    this.getView().setModel(new JSONModel(Main.emptyPartners()), "partners");
    this.getView().setModel(new JSONModel(Main.blankPartner()), "partner");
  }

  private static blank(branchCode: string, branchName: string): Settings {
    return {
      BranchCode: branchCode,
      BranchName: branchName,
      LoadedFor: "",
      AssessmentForm: "Annual",
      MainCnae: "",
      LegalEntityQualification: "01",
      NatureCode: "2062",
      PreviousEcfHash: "",
    };
  }

  private static emptyPartners(): PartnersState {
    return { items: [], totalPercent: 0, balanced: true, totalText: "", loaded: false };
  }

  private static blankPartner(): Partner {
    return {
      Id: "",
      Name: "",
      TaxId: "",
      Qualification: "",
      VotingCapitalPercent: 0,
      TotalCapitalPercent: 0,
      CountryCode: "105",
    };
  }

  private model(): JSONModel {
    return this.getView().getModel("settings") as JSONModel;
  }

  private partnersModel(): JSONModel {
    return this.getView().getModel("partners") as JSONModel;
  }

  private partnerModel(): JSONModel {
    return this.getView().getModel("partner") as JSONModel;
  }

  /** Carrega os parâmetros e o quadro societário da filial escolhida (o value help só preenche o código). */
  async onLoad(): Promise<void> {
    const branchCode = (this.model().getProperty("/BranchCode") as string)?.trim();
    if (!branchCode) {
      MessageBox.warning("Informe a filial.");
      return;
    }
    const branchName = this.model().getProperty("/BranchName") as string;

    this.setBusy(true);
    try {
      const result = await sendJson("GET", `${ServerRoutes.ecfSettingsGet}(branchCode='${encodeURIComponent(branchCode.replace(/'/g, "''"))}')`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      const data = odataValue<Record<string, unknown>>(result.data) ?? {};
      const loaded = { ...Main.blank(branchCode, branchName), LoadedFor: branchCode } as Settings;
      if (typeof data.AssessmentForm === "string" && data.AssessmentForm) loaded.AssessmentForm = data.AssessmentForm;
      for (const key of ["MainCnae", "LegalEntityQualification", "NatureCode", "PreviousEcfHash"] as const) {
        const value = data[key];
        if (typeof value === "string" && value !== "") loaded[key] = value;
      }
      this.model().setData(loaded);
      await this.loadPartners(branchCode);
    } finally {
      this.setBusy(false);
    }
  }

  private async loadPartners(branchCode: string): Promise<boolean> {
    const filter = encodeURIComponent(`BranchCode eq '${branchCode.replace(/'/g, "''")}'`);
    const result = await sendJson("GET", `${ServerRoutes.ecfPartners}?$filter=${filter}&$orderby=Name`);
    if (!result.ok) {
      MessageBox.error(result.message);
      return false;
    }
    const items = odataCollection<Partner>(result.data);
    const totalPercent = Math.round(items.reduce((sum, p) => sum + (Number(p.TotalCapitalPercent) || 0), 0) * 100) / 100;
    this.partnersModel().setData({ items, totalPercent, balanced: items.length === 0 || totalPercent === 100, totalText: `Soma do capital total: ${totalPercent.toFixed(2).replace(".", ",")}%${items.length === 0 || totalPercent === 100 ? "" : " (deve fechar 100%)"}`, loaded: true } as PartnersState);
    return true;
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
      AssessmentForm: data.AssessmentForm || "Annual",
      MainCnae: data.MainCnae?.trim() || null,
      LegalEntityQualification: data.LegalEntityQualification?.trim() || "01",
      NatureCode: data.NatureCode?.trim() || "2062",
      PreviousEcfHash: data.PreviousEcfHash?.trim() || null,
    };

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.ecfSettingsSave, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Parâmetros da ECF gravados.");
    } finally {
      this.setBusy(false);
    }
  }

  private partnerDialog(): Dialog {
    return this.byId("partnerDialog") as Dialog;
  }

  private loadedBranch(): string {
    const data = this.model().getData() as Settings;
    if (!data.LoadedFor || data.LoadedFor !== data.BranchCode?.trim()) {
      MessageBox.warning("Clique em Carregar para a filial escolhida antes de editar o quadro societário.");
      return null;
    }
    return data.LoadedFor;
  }

  onAddPartner(): void {
    if (!this.loadedBranch()) return;
    this.partnerModel().setData(Main.blankPartner());
    this.partnerDialog().setTitle("Novo sócio");
    this.partnerDialog().open();
  }

  onEditPartner(event: { getSource(): { getBindingContext(name: string): { getObject(): Partner } } }): void {
    if (!this.loadedBranch()) return;
    const partner = event.getSource().getBindingContext("partners").getObject();
    this.partnerModel().setData({ ...partner });
    this.partnerDialog().setTitle("Editar sócio");
    this.partnerDialog().open();
  }

  onCancelPartner(): void {
    this.partnerDialog().close();
  }

  async onSavePartner(): Promise<void> {
    const branchCode = this.loadedBranch();
    if (!branchCode) return;
    const p = this.partnerModel().getData() as Partner;
    const payload = {
      BranchCode: branchCode,
      Name: p.Name?.trim() ?? "",
      TaxId: (p.TaxId ?? "").replace(/\D/g, ""),
      Qualification: p.Qualification?.trim() ?? "",
      VotingCapitalPercent: Number(p.VotingCapitalPercent) || 0,
      TotalCapitalPercent: Number(p.TotalCapitalPercent) || 0,
      CountryCode: p.CountryCode?.trim() || "105",
    };

    this.setBusy(true);
    try {
      const result = p.Id
        ? await sendJson("PATCH", `${ServerRoutes.ecfPartners}(${p.Id})`, payload)
        : await sendJson("POST", ServerRoutes.ecfPartners, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      this.partnerDialog().close();
      await this.loadPartners(branchCode);
      MessageToast.show("Sócio gravado.");
    } finally {
      this.setBusy(false);
    }
  }

  onDeletePartner(event: { getSource(): { getBindingContext(name: string): { getObject(): Partner } } }): void {
    const partner = event.getSource().getBindingContext("partners").getObject();
    MessageBox.confirm(`Excluir o sócio ${partner.Name}?`, {
      actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
      emphasizedAction: MessageBox.Action.DELETE,
      onClose: (action: string) => {
        if (action === "DELETE") void this.deletePartner(partner);
      },
    });
  }

  private async deletePartner(partner: Partner): Promise<void> {
    this.setBusy(true);
    try {
      const result = await sendJson("DELETE", `${ServerRoutes.ecfPartners}(${partner.Id})`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      await this.loadPartners((this.model().getProperty("/LoadedFor") as string) ?? "");
      MessageToast.show("Sócio excluído.");
    } finally {
      this.setBusy(false);
    }
  }
}
