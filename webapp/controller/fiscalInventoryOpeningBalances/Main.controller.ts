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

type BalanceForm = {
  Key?: string;
  BranchCode: string;
  ItemCode: string;
  ItemName: string;
  BalanceDate: string;
  Quantity: number | string;
  TotalValue: number | string;
  UnitOfMeasureCode: string;
};

/**
 * Saldo inicial do estoque fiscal (Kardex Fiscal), um lançamento por filial + produto (só STANDALONE; o servidor
 * recusa fora do modo). Inclusão e edição por diálogo com JSONModel, gravando pelo modelo OData. As decimais vão
 * como Number (Double) — o OData não aceita Decimal editável como texto — e a data como meio-dia UTC, para o
 * dia não mudar com o fuso.
 *
 * @namespace siagrob1.controller.fiscalInventoryOpeningBalances
 */
export default class Main extends CommonController {
  private balanceDialog: Dialog;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "balance");
    this.getRouter().getRoute("fiscalInventoryOpeningBalances").attachPatternMatched(() => this.onRefresh());
  }

  private table(): Table {
    return this.byId("openingBalancesTable") as Table;
  }

  onRefresh(): void {
    (this.table().getBinding("rows") as ODataListBinding)?.refresh();
  }

  private selected(): Context | undefined {
    const i = this.table().getSelectedIndex();
    return i < 0 ? undefined : (this.table().getContextByIndex(i) as Context);
  }

  /** Custo unitário = valor total ÷ quantidade (somente leitura). */
  unitCost(quantity: number | string, totalValue: number | string): string {
    const qty = Number(quantity);
    const total = Number(totalValue);
    if (!Number.isFinite(qty) || !Number.isFinite(total) || qty === 0) return "";
    return (total / qty).toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  }

  async onCreate() {
    await this.openDialog({
      BranchCode: "", ItemCode: "", ItemName: "", BalanceDate: localIsoDate(new Date()),
      Quantity: 0, TotalValue: 0, UnitOfMeasureCode: "",
    });
  }

  async onEdit() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione um saldo para editar.");
      return;
    }

    await this.openDialog({
      Key: ctx.getProperty("Key") as string,
      BranchCode: ctx.getProperty("BranchCode") as string,
      ItemCode: ctx.getProperty("ItemCode") as string,
      ItemName: (ctx.getProperty("ItemName") as string) ?? "",
      BalanceDate: localIsoDate(new Date(ctx.getProperty("BalanceDate") as string)),
      Quantity: Number(ctx.getProperty("Quantity")),
      TotalValue: Number(ctx.getProperty("TotalValue")),
      UnitOfMeasureCode: (ctx.getProperty("UnitOfMeasureCode") as string) ?? "",
    });
  }

  private async openDialog(data: BalanceForm) {
    (this.getView().getModel("balance") as JSONModel).setData(data);
    this.balanceDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.fiscalInventoryOpeningBalances.fragments.BalanceDialog");
    this.balanceDialog.open();
  }

  onCancelBalance() {
    this.balanceDialog?.close();
  }

  async onConfirmBalance() {
    const data = (this.getView().getModel("balance") as JSONModel).getData() as BalanceForm;

    if (!data.BranchCode) {
      MessageBox.warning("Informe a filial.");
      return;
    }
    if (!data.ItemCode) {
      MessageBox.warning("Informe o produto.");
      return;
    }
    if (data.Quantity === "" || data.Quantity == null) {
      MessageBox.warning("Informe a quantidade.");
      return;
    }
    if (data.TotalValue === "" || data.TotalValue == null) {
      MessageBox.warning("Informe o valor.");
      return;
    }
    if (!data.BalanceDate) {
      MessageBox.warning("Informe a data do saldo.");
      return;
    }

    const model = this.getView().getModel() as ODataModel;
    const groupId = model.getUpdateGroupId();
    const unit = data.UnitOfMeasureCode?.trim().toUpperCase();
    // null explícito: unidade vazia limpa o campo e o servidor assume a comercial do produto.
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    const payload: Record<string, string | number | null> = {
      BranchCode: data.BranchCode,
      ItemCode: data.ItemCode,
      BalanceDate: `${data.BalanceDate}T12:00:00Z`,
      Quantity: Number(data.Quantity),
      TotalValue: Number(data.TotalValue),
      // Vazia = o servidor usa a unidade comercial do produto.
      UnitOfMeasureCode: unit ? unit : null,
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

      this.balanceDialog.close();
      MessageToast.show("Saldo inicial gravado.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione um saldo para excluir.");
      return;
    }

    if (!(await confirmDialog("Deseja realmente excluir o saldo inicial selecionado ?", "Excluir saldo inicial ?"))) {
      return;
    }

    const model = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await ctx.delete("$auto");
      await model.submitBatch(model.getUpdateGroupId());
      MessageToast.show("Saldo inicial excluído.");
    } finally {
      this.setBusy(false);
    }
  }
}
