import BaseController from "../BaseController";
import Table from "sap/m/Table";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import { STATE_CODES } from "siagrob1/helpers/StateCodes";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";

/**
 * ICMS por UF (só STANDALONE — o menu some nos outros modos): alíquota interna, FCP e regra da base do
 * DIFAL de cada UF de destino. Lista editável direto na linha; o Salvar envia o lote. A UF de uma linha
 * existente é imutável (a chave; o servidor recusa o PATCH).
 *
 * @namespace siagrob1.controller.icmsStateSettings
 */
export default class Main extends BaseController {

  onInit(): void {
    this.getView().setModel(new JSONModel(STATE_CODES), "stateCodes");
    this.getRouter().getRoute("icmsStateSettings").attachPatternMatched(() => this.onRefresh());
  }

  private table(): Table {
    return this.byId("icmsStateSettingsTable") as Table;
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

  /** Linha nova: a UF é escolhida aqui e só aqui; o servidor recusa trocá-la depois. */
  onCreate(): void {
    (this.table().getBinding("items") as ODataListBinding).create(
      { StateCode: null, InternalRate: null, FcpRate: 0, DifalBaseRule: "Single" }, true, true);
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

      MessageToast.show("ICMS por UF gravado.");
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

    if (!(await confirmDialog("Deseja realmente excluir a UF selecionada ?", "Excluir UF ?"))) {
      return;
    }

    try {
      this.setBusy(true);
      await ctx.delete("$auto");
      MessageToast.show("UF excluída.");
    } finally {
      this.setBusy(false);
    }
  }
}
