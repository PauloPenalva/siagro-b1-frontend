import CommonController from "siagrob1/controller/common/CommonController";
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
import { localIsoDate } from "siagrob1/helpers/DateHelpers";

type AdjustmentForm = {
  Key?: string;
  DocNumber: string;
  BranchCode: string;
  AdjustmentDate: string;
  Direction: "In" | "Out";
  ItemCode: string;
  ItemName: string;
  Quantity: number | string;
  TotalValue: number | string;
  UnitOfMeasureCode: string;
  Reason: string;
};

/**
 * Ajustes manuais do estoque fiscal (Registro Kardex), entrada ou saída por filial + produto, com motivo obrigatório
 * (só STANDALONE; o servidor recusa fora do modo e em mês fechado). Mesmo padrão do saldo inicial: diálogo com
 * JSONModel gravando pelo modelo OData; decimais como Number (Double) e data ao meio-dia UTC. O enum Direction
 * trafega pelo nome ("In"/"Out").
 *
 * @namespace siagrob1.controller.fiscalStockAdjustments
 */
export default class Main extends CommonController {
  private adjustmentDialog: Dialog;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "adjustment");
    this.getRouter().getRoute("fiscalStockAdjustments").attachPatternMatched(() => this.onRefresh());
  }

  private table(): Table {
    return this.byId("adjustmentsTable") as Table;
  }

  onRefresh(): void {
    (this.table().getBinding("rows") as ODataListBinding)?.refresh();
  }

  private selected(): Context | undefined {
    const i = this.table().getSelectedIndex();
    return i < 0 ? undefined : (this.table().getContextByIndex(i) as Context);
  }

  directionText(direction: string): string {
    if (direction === "In") return "Entrada";
    if (direction === "Out") return "Saída";
    return direction ?? "";
  }

  async onCreate() {
    await this.openDialog({
      DocNumber: "", BranchCode: "", AdjustmentDate: localIsoDate(new Date()), Direction: "Out",
      ItemCode: "", ItemName: "", Quantity: 0, TotalValue: 0, UnitOfMeasureCode: "", Reason: "",
    });
  }

  async onEdit() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione um ajuste para editar.");
      return;
    }

    await this.openDialog({
      Key: ctx.getProperty("Key") as string,
      DocNumber: (ctx.getProperty("DocNumber") as string) ?? "",
      BranchCode: ctx.getProperty("BranchCode") as string,
      AdjustmentDate: localIsoDate(new Date(ctx.getProperty("AdjustmentDate") as string)),
      Direction: ctx.getProperty("Direction") as "In" | "Out",
      ItemCode: ctx.getProperty("ItemCode") as string,
      ItemName: (ctx.getProperty("ItemName") as string) ?? "",
      Quantity: Number(ctx.getProperty("Quantity")),
      TotalValue: Number(ctx.getProperty("TotalValue")),
      UnitOfMeasureCode: (ctx.getProperty("UnitOfMeasureCode") as string) ?? "",
      Reason: (ctx.getProperty("Reason") as string) ?? "",
    });
  }

  private async openDialog(data: AdjustmentForm) {
    (this.getView().getModel("adjustment") as JSONModel).setData(data);
    this.adjustmentDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.fiscalStockAdjustments.fragments.AdjustmentDialog");
    this.adjustmentDialog.open();
  }

  onCancelAdjustment() {
    this.adjustmentDialog?.close();
  }

  async onConfirmAdjustment() {
    const data = (this.getView().getModel("adjustment") as JSONModel).getData() as AdjustmentForm;

    if (!data.BranchCode) {
      MessageBox.warning("Informe a filial.");
      return;
    }
    if (!data.AdjustmentDate) {
      MessageBox.warning("Informe a data do ajuste.");
      return;
    }
    if (!data.ItemCode) {
      MessageBox.warning("Informe o produto.");
      return;
    }
    if (data.Quantity === "" || data.Quantity == null || !(Number(data.Quantity) > 0)) {
      MessageBox.warning("Informe uma quantidade maior que zero.");
      return;
    }
    if (!/^\d+([.,]\d{1,3})?$/.test(String(data.Quantity).trim())) {
      MessageBox.warning("A quantidade aceita no máximo 3 casas decimais.");
      return;
    }
    if (data.TotalValue === "" || data.TotalValue == null || Number(data.TotalValue) < 0) {
      MessageBox.warning("Informe o valor.");
      return;
    }
    if (!data.Reason?.trim()) {
      MessageBox.warning("Informe o motivo do ajuste.");
      return;
    }

    const model = this.getView().getModel() as ODataModel;
    const groupId = model.getUpdateGroupId();
    const unit = data.UnitOfMeasureCode?.trim().toUpperCase();
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    const payload: Record<string, string | number | null> = {
      BranchCode: data.BranchCode,
      AdjustmentDate: `${data.AdjustmentDate}T12:00:00Z`,
      Direction: data.Direction,
      ItemCode: data.ItemCode,
      Quantity: Number(data.Quantity),
      TotalValue: Number(data.TotalValue),
      // Vazia = o servidor usa a unidade comercial do produto.
      UnitOfMeasureCode: unit ? unit : null,
      Reason: data.Reason.trim(),
    };

    try {
      this.setBusy(true);

      if (data.Key == null) {
        (this.table().getBinding("rows") as ODataListBinding).create(payload, true);
      } else {
        const ctx = this.selected();
        // Sem await: com o grupo diferido a promise do setProperty só resolve DEPOIS do submitBatch.
        Object.entries(payload).forEach(([name, value]) => void ctx.setProperty(name, value));
      }

      await model.submitBatch(groupId);

      if (model.hasPendingChanges(groupId)) {
        // A mensagem do servidor já foi mostrada pelo handler global; desfaz para não reenviar.
        model.resetChanges(groupId);
        return;
      }

      this.adjustmentDialog.close();
      MessageToast.show("Ajuste gravado.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione um ajuste para excluir.");
      return;
    }

    if (!(await confirmDialog("Deseja realmente excluir o ajuste selecionado ?", "Excluir ajuste ?"))) {
      return;
    }

    const model = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await ctx.delete("$auto");
      await model.submitBatch(model.getUpdateGroupId());
      MessageToast.show("Ajuste excluído.");
    } finally {
      this.setBusy(false);
    }
  }
}
