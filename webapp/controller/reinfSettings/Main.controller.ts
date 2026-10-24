import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  odataString, pascalKeys, reinfRegistrationState, reinfRegistrationText,
} from "siagrob1/helpers/ReinfHelpers";

type Contributor = { TaxIdRoot: string; Name: string; HasSettings: boolean };

type Settings = {
  TaxIdRoot: string;
  BranchCode: string;
  BranchName: string;
  LoadedFor: string;
  Environment: string;
  TaxClassification: string;
  KeepsBookkeeping: boolean;
  PayrollRelief: boolean;
  FineExemptionAgreement: boolean;
  CompanySituation: string;
  ContactName: string;
  ContactCpf: string;
  ContactPhone: string;
  ContactEmail: string;
  ValidFrom: string;
  ClosingResponsibleName: string;
  ClosingResponsibleCpf: string;
  ClosingResponsiblePhone: string;
  ClosingResponsibleEmail: string;
  RegistrationStatus: number;
  RegistrationStatusText: string;
  RegistrationStatusState: string;
  RegistrationReceipt: string;
  Exists: boolean;
  /** Gravou depois do R-1000 aceito: falta reenviar. */
  NeedsResend: boolean;
};

const TEXT_KEYS = [
  "BranchCode", "TaxClassification", "ContactName", "ContactCpf", "ContactPhone", "ContactEmail", "ValidFrom",
  "ClosingResponsibleName", "ClosingResponsibleCpf", "ClosingResponsiblePhone", "ClosingResponsibleEmail",
  "RegistrationReceipt",
] as const;

/** ReinfRegistrationStatus.Accepted */
const REGISTRATION_ACCEPTED = 2;

/**
 * Parâmetros da EFD-Reinf por raiz de CNPJ (só STANDALONE) e envio do cadastro do contribuinte (R-1000).
 *
 * @namespace siagrob1.controller.reinfSettings
 */
export default class Main extends CommonController {
  onInit(): void {
    this.getView().setModel(new JSONModel(Main.blank("")), "settings");
    this.getView().setModel(new JSONModel({ items: [] }), "contributors");
    this.getRouter().getRoute("reinfSettings")?.attachPatternMatched(() => void this.loadContributors());
  }

  private static blank(root: string): Settings {
    return {
      TaxIdRoot: root, BranchCode: "", BranchName: "", LoadedFor: "", Environment: "2", TaxClassification: "",
      KeepsBookkeeping: true, PayrollRelief: false, FineExemptionAgreement: false, CompanySituation: "",
      ContactName: "", ContactCpf: "", ContactPhone: "", ContactEmail: "", ValidFrom: "",
      ClosingResponsibleName: "", ClosingResponsibleCpf: "", ClosingResponsiblePhone: "", ClosingResponsibleEmail: "",
      RegistrationStatus: 0, RegistrationStatusText: reinfRegistrationText(0), RegistrationStatusState: "None",
      RegistrationReceipt: "", Exists: false, NeedsResend: false,
    };
  }

  private model(): JSONModel {
    return this.getView().getModel("settings") as JSONModel;
  }

  private async loadContributors(): Promise<void> {
    const result = await sendJson("GET", ServerRoutes.reinfContributors);
    if (!result.ok) {
      MessageBox.error(result.message ?? "Erro ao carregar os contribuintes.");
      return;
    }
    const items = odataCollection<unknown>(result.data).map((c) => pascalKeys<Contributor>(c));
    (this.getView().getModel("contributors") as JSONModel).setData({ items });
  }

  /** Trocar o contribuinte carrega os parâmetros dele (sem gravação: padrões do backend). */
  async onContributorChange(): Promise<void> {
    const root = (this.model().getProperty("/TaxIdRoot") as string) ?? "";
    if (!root) {
      this.model().setData(Main.blank(""));
      return;
    }
    await this.load(root);
  }

  private async load(root: string): Promise<void> {
    this.setBusy(true);
    try {
      const result = await sendJson("GET", `${ServerRoutes.reinfSettingsGet}(taxIdRoot=${odataString(root)})`);
      if (!result.ok) {
        MessageBox.error(result.message ?? "Erro ao carregar os parâmetros.");
        return;
      }
      this.apply(root, pascalKeys<Record<string, unknown>>(odataValue<unknown>(result.data)), false);
    } finally {
      this.setBusy(false);
    }
  }

  private apply(root: string, data: Record<string, unknown>, needsResend: boolean): void {
    const s = Main.blank(root);
    for (const key of TEXT_KEYS) s[key] = (data[key] as string) ?? "";
    s.Environment = String((data.Environment as number) ?? 2);
    s.KeepsBookkeeping = Boolean(data.KeepsBookkeeping);
    s.PayrollRelief = Boolean(data.PayrollRelief);
    s.FineExemptionAgreement = Boolean(data.FineExemptionAgreement);
    s.CompanySituation = data.CompanySituation === null || data.CompanySituation === undefined ? "" : String(data.CompanySituation as number);
    s.RegistrationStatus = Number(data.RegistrationStatus ?? 0);
    s.RegistrationStatusText = reinfRegistrationText(s.RegistrationStatus);
    s.RegistrationStatusState = reinfRegistrationState(s.RegistrationStatus);
    s.Exists = Boolean(data.Exists);
    s.LoadedFor = root;
    s.NeedsResend = needsResend;
    this.model().setData(s);
  }

  async onSave(): Promise<void> {
    const data = this.model().getData() as Settings;
    if (!data.TaxIdRoot || data.LoadedFor !== data.TaxIdRoot) {
      MessageBox.warning("Escolha o contribuinte.");
      return;
    }
    const payload: Record<string, unknown> = {
      TaxIdRoot: data.TaxIdRoot,
      BranchCode: data.BranchCode?.trim() ?? "",
      Environment: Number(data.Environment),
      TaxClassification: data.TaxClassification?.trim() ?? "",
      KeepsBookkeeping: data.KeepsBookkeeping,
      PayrollRelief: data.PayrollRelief,
      FineExemptionAgreement: data.FineExemptionAgreement,
      CompanySituation: data.CompanySituation === "" ? null : Number(data.CompanySituation),
      ContactName: data.ContactName ?? "",
      ContactCpf: data.ContactCpf ?? "",
      ContactPhone: data.ContactPhone || null,
      ContactEmail: data.ContactEmail || null,
      ValidFrom: data.ValidFrom ?? "",
      ClosingResponsibleName: data.ClosingResponsibleName || null,
      ClosingResponsibleCpf: data.ClosingResponsibleCpf || null,
      ClosingResponsiblePhone: data.ClosingResponsiblePhone || null,
      ClosingResponsibleEmail: data.ClosingResponsibleEmail || null,
    };

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.reinfSettingsSave, payload);
      if (!result.ok) {
        MessageBox.error(result.message ?? "Erro ao gravar os parâmetros.");
        return;
      }
      const saved = pascalKeys<Record<string, unknown>>(odataValue<unknown>(result.data) ?? {});
      const merged = { ...payload, RegistrationStatus: data.RegistrationStatus, RegistrationReceipt: data.RegistrationReceipt, ...saved, Exists: true };
      this.apply(data.TaxIdRoot, merged, Number(merged.RegistrationStatus) === REGISTRATION_ACCEPTED);
      MessageToast.show("Parâmetros da EFD-Reinf gravados.");
    } finally {
      this.setBusy(false);
    }
  }

  onSendRegistration(): void {
    const data = this.model().getData() as Settings;
    if (!data.Exists || data.LoadedFor !== data.TaxIdRoot) {
      MessageBox.warning("Salve os parâmetros antes de enviar o R-1000.");
      return;
    }
    MessageBox.confirm("Enviar o cadastro do contribuinte (R-1000) para a Receita?", {
      onClose: (action: string) => {
        if (action === MessageBox.Action.OK.toString()) void this.sendRegistration(data.TaxIdRoot);
      },
    });
  }

  private async sendRegistration(root: string): Promise<void> {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.reinfRegistrationSend, { TaxIdRoot: root });
      if (!result.ok) {
        MessageBox.error(result.message ?? "Erro ao enviar o R-1000.");
        return;
      }
      MessageToast.show("R-1000 enviado.");
    } finally {
      this.setBusy(false);
    }
    await this.load(root);
  }
}
