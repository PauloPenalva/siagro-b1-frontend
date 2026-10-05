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
  cbsRate: number | string;
  ibsStateRate: number | string;
  ibsMunicipalRate: number | string;
};

/**
 * Alíquotas de IBS/CBS por vigência (só STANDALONE — o botão que traz até aqui some em SAPB1, e
 * o servidor recusa fora do modo). Inclusão e edição por diálogo com JSONModel, gravando pelo
 * modelo OData: `StartDate` é Edm.Date, então vai como "yyyy-MM-dd", sem fuso.
 *
 * @namespace siagrob1.controller.ibsCbsRates
 */
export default class Main extends BaseController {
  private rateDialog: Dialog;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "rate");
    this.getRouter().getRoute("ibsCbsRates").attachPatternMatched(() => this.onRefresh());
  }

  private table(): Table {
    return this.byId("ibsCbsRatesTable") as Table;
  }

  onRefresh(): void {
    (this.table().getBinding("rows") as ODataListBinding)?.refresh();
  }

  private selected(): Context | undefined {
    const i = this.table().getSelectedIndex();
    return i < 0 ? undefined : (this.table().getContextByIndex(i) as Context);
  }

  async onCreate() {
    await this.openDialog({ startDate: "", cbsRate: 0, ibsStateRate: 0, ibsMunicipalRate: 0 });
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
      cbsRate: Number(ctx.getProperty("CbsRate")),
      ibsStateRate: Number(ctx.getProperty("IbsStateRate")),
      ibsMunicipalRate: Number(ctx.getProperty("IbsMunicipalRate")),
    });
  }

  private async openDialog(data: RateForm) {
    (this.getView().getModel("rate") as JSONModel).setData(data);
    this.rateDialog ??= await DialogHelper.createDialog(this, "siagrob1.view.ibsCbsRates.fragments.RateDialog");
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
      CbsRate: Number(data.cbsRate),
      IbsStateRate: Number(data.ibsStateRate),
      IbsMunicipalRate: Number(data.ibsMunicipalRate),
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
