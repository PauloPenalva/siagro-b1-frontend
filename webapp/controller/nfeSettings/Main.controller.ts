import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import { Button$PressEvent } from "sap/m/Button";
import { RadioButton$SelectEvent } from "sap/m/RadioButton";
import MessageToast from "sap/m/MessageToast";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import Fragment from "sap/ui/core/Fragment";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  certificateDaysToExpire, certificateState, environmentCode, readFileAsBase64,
} from "siagrob1/helpers/NfeHelpers";
import { NfeSeries, NfeSeriesRow, buildSeriesSavePayload } from "siagrob1/helpers/NfeSeriesHelpers";

const CERTIFICATE_FRAGMENT = "siagrob1.view.nfeSettings.fragments.CertificateDialog";

type Settings = {
  BranchCode: string;
  Environment: string;
  DefaultSeries: number;
  SeriesList: NfeSeriesRow[];
  HasCertificate: boolean;
  CertificateSubject?: string;
  CertificateTaxId?: string;
  CertificateValidUntil?: string;
  ServerKeyConfigured: boolean;
};

/**
 * Configuração da NF-e por filial (spec §7.2) — só STANDALONE (menu StandaloneOnly; o servidor
 * recusa nos demais modos). Tudo por actions/functions lidas com fetch: o certificado vai em
 * base64, como o anexo do contrato.
 *
 * @namespace siagrob1.controller.nfeSettings
 */
export default class Main extends CommonController {
  private certificateDialog: Dialog;
  private certificateFile: File;

  onInit(): void {
    this.getView().setModel(new JSONModel({ loaded: false }), "nfe");
    this.getRouter().getRoute("nfeSettings").attachPatternMatched(() => this.reset());
  }

  private model(): JSONModel {
    return this.getView().getModel("nfe") as JSONModel;
  }

  private reset() {
    this.model().setData({ loaded: false });
  }

  async onPickBranch(ev: Input$ValueHelpRequestEvent) {
    const oContext = await DialogHelper.openTableSelectDialog(
      this, "BranchsSelectDialog", ["Code", "BranchName", "ShortName", "TaxId"]);

    if (!oContext) {
      return;
    }

    const code = oContext.getProperty("Code") as string;
    ev.getSource().setValue(code);
    // Zera as configurações da filial anterior: se a leitura falhar, nada dela pode ser salvo na nova.
    this.model().setData({ loaded: false, BranchCode: code });
    await this.load(code);
  }

  private async load(branchCode: string) {
    this.setBusy(true);
    try {
      const result = await sendJson("GET", `${ServerRoutes.branchNfeSettingsGet}(BranchCode='${encodeURIComponent(branchCode)}')`);
      if (!result.ok) {
        this.model().setData({ loaded: false, BranchCode: branchCode });
        MessageBox.error(result.message);
        return;
      }

      this.show(odataValue<Settings>(result.data));
    } finally {
      this.setBusy(false);
    }
  }

  private show(settings: Settings) {
    const days = certificateDaysToExpire(settings.CertificateValidUntil, new Date());
    const until = settings.CertificateValidUntil ? new Date(settings.CertificateValidUntil).toLocaleDateString("pt-BR") : "";

    this.model().setData({
      ...settings,
      SeriesList: ((settings.SeriesList ?? []) as NfeSeries[]).map((row) => ({ ...row, isNew: false })),
      loaded: true,
      certificateState: certificateState(days),
      certificateText: !settings.HasCertificate
        ? "Nenhum certificado enviado"
        : days === undefined ? "Validade não informada"
          : days < 0 ? `Vencido em ${until}` : `${until} (${days} dias para vencer)`,
    });
  }

  onAddSeries() {
    const row: NfeSeriesRow = { Series: "" as unknown as number, Description: "", NextNumber: 1, IsUsed: false, isNew: true };
    this.model().setProperty("/SeriesList", [...(this.model().getProperty("/SeriesList") as NfeSeriesRow[]), row]);
  }

  /** Só tira a linha do modelo; o servidor valida (série usada, padrão) ao salvar. */
  onDeleteSeries(ev: Button$PressEvent) {
    const row = ev.getSource().getBindingContext("nfe").getObject() as NfeSeriesRow;
    const list = (this.model().getProperty("/SeriesList") as NfeSeriesRow[]).filter((r) => r !== row);
    this.model().setProperty("/SeriesList", list);
  }

  onSelectDefaultSeries(ev: RadioButton$SelectEvent) {
    if (!ev.getParameter("selected")) {
      return;
    }
    const row = ev.getSource().getBindingContext("nfe").getObject() as NfeSeriesRow;
    this.model().setProperty("/DefaultSeries", Number(row.Series));
  }

  async onSave() {
    const data = this.model().getData() as Settings;
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.branchNfeSettingsSave, {
        BranchCode: data.BranchCode,
        Environment: environmentCode(data.Environment),
        DefaultSeries: Number(data.DefaultSeries),
        ...buildSeriesSavePayload(data.SeriesList ?? []),
      });

      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      this.show(odataValue<Settings>(result.data));
      MessageToast.show("Configuração da NF-e gravada.");
    } finally {
      this.setBusy(false);
    }
  }

  async onOpenCertificate() {
    this.model().setProperty("/certificatePassword", "");
    this.certificateFile = undefined;
    this.certificateDialog ??= await DialogHelper.createDialog(this, CERTIFICATE_FRAGMENT);
    // O diálogo é reaproveitado: sem limpar o FileUploader, ele mostraria o arquivo da vez anterior.
    const fragmentId = this.getView().getId() + "_" + CERTIFICATE_FRAGMENT;
    (Fragment.byId(fragmentId, "nfeCertificateFile") as FileUploader)?.clear();
    this.certificateDialog.open();
  }

  onCertificateFileChange(ev: FileUploader$ChangeEvent) {
    const files = ev.getParameter("files") as unknown as File[];
    this.certificateFile = files?.length > 0 ? files[0] : undefined;
  }

  /** Esc também fecha o diálogo: a senha não pode ficar no modelo. */
  onCertificateAfterClose() {
    this.model().setProperty("/certificatePassword", "");
  }

  onCloseCertificate() {
    this.model().setProperty("/certificatePassword", "");
    this.certificateDialog?.close();
  }

  async onUploadCertificate() {
    const data = this.model().getData() as Settings & { certificatePassword: string };

    if (!this.certificateFile || !data.certificatePassword) {
      MessageBox.warning("Escolha o arquivo .pfx e informe a senha.");
      return;
    }

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.branchNfeSettingsUploadCertificate, {
        BranchCode: data.BranchCode,
        Pfx: await readFileAsBase64(this.certificateFile),
        Password: data.certificatePassword,
      });

      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      this.certificateDialog.close();
      this.show(odataValue<Settings>(result.data));
      MessageToast.show("Certificado enviado.");
    } finally {
      this.model().setProperty("/certificatePassword", "");
      this.setBusy(false);
    }
  }

  async onTestConnection() {
    const data = this.model().getData() as Settings;
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.branchNfeSettingsTestConnection, { BranchCode: data.BranchCode });

      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      const status = odataValue<{ StatusCode: number; Reason: string }>(result.data);
      const text = `${status.StatusCode} - ${status.Reason}`;
      if (status.StatusCode === 107) {
        MessageBox.success(text);
      } else {
        MessageBox.warning(text);
      }
    } finally {
      this.setBusy(false);
    }
  }
}
