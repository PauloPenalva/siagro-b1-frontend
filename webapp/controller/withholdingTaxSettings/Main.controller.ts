import BaseController from "../BaseController";
import Table from "sap/m/Table";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";

/** Imposto retido: valor do enum `WithholdingTaxType` (Edm.Int32) e o nome mostrado ao usuário. */
const TAX_TYPES = [
  { key: "0", text: "ISS" },
  { key: "1", text: "IRRF" },
  { key: "2", text: "INSS" },
  { key: "3", text: "PIS" },
  { key: "4", text: "COFINS" },
  { key: "5", text: "CSLL" },
];

/**
 * Configuração de Retenções (só STANDALONE — o menu some nos outros modos): credor e dia de vencimento
 * do título gerado para cada imposto retido em compra de serviço. Lista editável direto na linha; o
 * Salvar envia o lote. O imposto de uma linha existente é imutável (o servidor recusa o PATCH).
 *
 * @namespace siagrob1.controller.withholdingTaxSettings
 */
export default class Main extends BaseController {

  onInit(): void {
    // Lista do Select de imposto (linha nova), na ordem do enum.
    this.getView().setModel(new JSONModel(TAX_TYPES), "taxTypes");
    this.getRouter().getRoute("withholdingTaxSettings").attachPatternMatched(() => this.onRefresh());
  }

  formatTaxType(value: number | string): string {
    return TAX_TYPES.find((t) => t.key === String(value))?.text ?? String(value ?? "");
  }

  private table(): Table {
    return this.byId("withholdingTaxSettingsTable") as Table;
  }

  private model(): ODataModel {
    return this.getView().getModel() as ODataModel;
  }

  private selected(): Context | undefined {
    return this.table().getSelectedItem()?.getBindingContext() as Context | undefined;
  }

  onRefresh(): void {
    const model = this.model();
    if (model.hasPendingChanges(model.getUpdateGroupId())) {
      model.resetChanges(model.getUpdateGroupId());
    }
    (this.table().getBinding("items") as ODataListBinding)?.refresh();
  }

  /** Linha nova: o imposto é escolhido aqui e só aqui; o servidor recusa trocá-lo depois. */
  onCreate(): void {
    (this.table().getBinding("items") as ODataListBinding).create(
      { TaxType: null, CardCode: null, CardName: null, DueDay: 10 }, true, true);
  }

  /** Sem filtro de tipo de parceiro: o credor pode ser órgão público ou fornecedor. */
  async onCreditorValueHelp(ev: Input$ValueHelpRequestEvent) {
    const target = ev.getSource().getBindingContext() as Context;
    const selected = await DialogHelper.openTableSelectDialog(
      this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"], []);

    if (!selected) {
      return;
    }

    // Sem await: no update group diferido a Promise só resolve no submit.
    void target.setProperty("CardCode", selected.getProperty("CardCode") as string);
    void target.setProperty("CardName", selected.getProperty("CardName") as string);
  }

  async onSave() {
    const model = this.model();
    const groupId = model.getUpdateGroupId();

    if (!model.hasPendingChanges(groupId)) {
      MessageToast.show("Nada a gravar.");
      return;
    }

    try {
      this.setBusy(true);
      await model.submitBatch(groupId);

      if (model.hasPendingChanges(groupId)) {
        // A mensagem do servidor já foi mostrada pelo handler global; as linhas com erro continuam editáveis.
        return;
      }

      MessageToast.show("Configuração de retenções gravada.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione uma linha para excluir.");
      return;
    }

    if (!(await confirmDialog("Deseja realmente excluir a configuração selecionada ?", "Excluir configuração ?"))) {
      return;
    }

    try {
      this.setBusy(true);
      await ctx.delete("$auto");
      MessageToast.show("Configuração excluída.");
    } finally {
      this.setBusy(false);
    }
  }
}
