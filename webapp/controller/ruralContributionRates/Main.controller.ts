import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";

type RateForm = {
  key?: number;
  startDate: string;
  scheme: string;
  inssRate: number | string;
  ratRate: number | string;
  senarRate: number | string;
};

/**
 * Alíquotas da contribuição social do produtor rural (INSS, RAT e SENAR) por vigência e regime (só STANDALONE — o botão que traz até aqui some em SAPB1, e
 * o servidor recusa fora do modo). Inclusão e edição por diálogo com JSONModel, gravando pelo
 * modelo OData: `StartDate` é Edm.Date, então vai como "yyyy-MM-dd", sem fuso.
 *
 * @namespace siagrob1.controller.ruralContributionRates
 */
export default class Main extends BaseController {
  private rateDialog: Dialog;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "rate");
    this.getRouter().getRoute("ruralContributionRates").attachPatternMatched(() => this.onRefresh());
  }

  private table(): Table {
    return this.byId("ruralContributionRatesTable") as Table;
  }

  onRefresh(): void {
    (this.table().getBinding("rows") as ODataListBinding)?.refresh();
  }

  private selected(): Context | undefined {
    const i = this.table().getSelectedIndex();
    return i < 0 ? undefined : (this.table().getContextByIndex(i) as Context);
  }

  async onCreate() {
    await this.openDialog({ startDate: "", scheme: "Standard", inssRate: 0, ratRate: 0, senarRate: 0 });
  }

  async onEdit() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione uma vigência para editar.");
      return;
    }

    await this.openDialog({
      key: ctx.getProperty("Key") as number,
      startDate: ctx.getProperty("StartDate") as string,
      scheme: ctx.getProperty("Scheme") as string,
      inssRate: Number(ctx.getProperty("InssRate")),
      ratRate: Number(ctx.getProperty("RatRate")),
      senarRate: Number(ctx.getProperty("SenarRate")),
    });
  }

  private async openDialog(data: RateForm) {
    (this.getView().getModel("rate") as JSONModel).setData(data);
    this.rateDialog ??= await DialogHelper.createDialog(this, "siagrob1.view.ruralContributionRates.fragments.RateDialog");
    this.rateDialog.open();
  }

  onCancelRate() {
    this.rateDialog?.close();
  }

  async onConfirmRate() {
    const data = (this.getView().getModel("rate") as JSONModel).getData() as RateForm;

    if (!data.startDate) {
      MessageBox.warning("Informe o início da vigência.");
      return;
    }

    const model = this.getView().getModel() as ODataModel;
    const groupId = model.getUpdateGroupId();
    const payload: Record<string, string | number> = {
      StartDate: data.startDate,
      Scheme: data.scheme,
      InssRate: Number(data.inssRate),
      RatRate: Number(data.ratRate),
      SenarRate: Number(data.senarRate),
    };

    try {
      this.setBusy(true);

      if (data.key == null) {
        (this.table().getBinding("rows") as ODataListBinding).create(payload, true);
      } else {
        const ctx = this.selected();
        // Sem await: com o grupo diferido a promise do setProperty só resolve DEPOIS do
        // submitBatch, e esperá-la antes trava a tela.
        Object.entries(payload).forEach(([name, value]) => void ctx.setProperty(name, value));
      }

      await model.submitBatch(groupId);

      if (model.hasPendingChanges(groupId)) {
        // A mensagem do servidor já foi mostrada pelo handler global; desfaz para não reenviar.
        model.resetChanges(groupId);
        return;
      }

      this.rateDialog.close();
      MessageToast.show("Alíquotas gravadas.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione uma vigência para excluir.");
      return;
    }

    if (!(await confirmDialog("Deseja realmente excluir a vigência selecionada ?", "Excluir vigência ?"))) {
      return;
    }

    const model = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await ctx.delete("$auto");
      await model.submitBatch(model.getUpdateGroupId());
      MessageToast.show("Vigência excluída.");
    } finally {
      this.setBusy(false);
    }
  }
}
