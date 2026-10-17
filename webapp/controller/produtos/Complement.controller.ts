import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { ValueState } from "sap/ui/core/library";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import { unlockedUnitsOfMeasureFilter } from "siagrob1/helpers/FilterHelpers";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import Table from "sap/m/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { STATE_CODES } from "siagrob1/helpers/StateCodes";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { BaseController } from "./BaseController";

/** Formulário da tela, no model JSON "complement" — não é uma entidade do model OData. */
type ComplementForm = {
  ItemCode?: string,
  ItemName?: string,
  CommercialUnitOfMeasureCode?: string,
  CommercialFactor?: number,
  TaxableUnitOfMeasureCode?: string,
  TaxableFactor?: number,
  ControlsRoyalties?: boolean,
}

/**
 * @namespace siagrob1.controller.produtos
 */
export default class Complement extends BaseController {

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "complement");
    this.getView().setModel(new JSONModel(STATE_CODES), "stateCodes");
    void this.refreshStandaloneFlag();
    this.getRouter().getRoute("produtosComplement")
      .attachPatternMatched((ev) => void this.routeMatched(ev));
  }

  private async routeMatched(ev: Route$MatchedEvent): Promise<void> {
    const { id } = ev.getParameter("arguments") as { id: string };
    const model = this.getModel("complement") as JSONModel;

    model.setData({ ItemCode: id });
    this.loadStateRates(id);

    this.setBusy(true);
    try {
      const [item, complement] = await Promise.all([
        this.readItem(id),
        this.readComplement(id),
      ]);

      model.setData({
        ItemCode: id,
        ItemName: item?.ItemName,
        CommercialUnitOfMeasureCode: complement?.CommercialUnitOfMeasureCode,
        CommercialFactor: complement?.CommercialFactor,
        TaxableUnitOfMeasureCode: complement?.TaxableUnitOfMeasureCode,
        TaxableFactor: complement?.TaxableFactor,
        ControlsRoyalties: !!complement?.ControlsRoyalties,
      } as ComplementForm);
    } finally {
      this.setBusy(false);
    }
  }

  private async readItem(itemCode: string): Promise<{ ItemName?: string }> {
    const oModel = this.getModel() as ODataModel;
    const ctx = oModel.bindContext(`/Items('${itemCode}')`);

    return await ctx.requestObject() as { ItemName?: string };
  }

  /** Devolve undefined quando o item ainda não tem complemento — não é erro, é o caso comum. */
  private async readComplement(itemCode: string): Promise<ComplementForm> {
    const oModel = this.getModel() as ODataModel;
    const func = oModel.bindContext(this.api.itemsGetComplement);
    func.setParameter("ItemCode", itemCode);

    await func.invoke();

    return func.getBoundContext().getObject() as ComplementForm;
  }

  /**
   * Escreve direto no model JSON via `setProperty`, em vez de reaproveitar
   * `openUnitsOfMeasureValueHelp`/`applyValueHelp` (que escreve pelo `BindingContext` do Input) —
   * o campo está num model JSON solto, sem contexto de entidade, e sem essa gravação explícita a
   * seleção do diálogo não persiste.
   */
  async onCommercialUnitOfMeasureValueHelp(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(
      this, "UnitsOfMeasureSelectDialog", ["Code", "Description"],
      [unlockedUnitsOfMeasureFilter()]);

    if (!ctx) {
      return;
    }

    (this.getModel("complement") as JSONModel).setProperty(
      "/CommercialUnitOfMeasureCode", ctx.getProperty("Code") as string);
  }

  /** Zera a UoM comercial e a unidade tributavel: e a unica forma de voltar a exibir em KG, ja que a unidade comercial e valueHelpOnly. */
  onClear(): void {
    const model = this.getModel("complement") as JSONModel;
    model.setProperty("/CommercialUnitOfMeasureCode", null);
    model.setProperty("/CommercialFactor", null);

    const factor = this.byId("commercialFactor") as Input;
    factor.setValue("");
    factor.setValueState(ValueState.None);

    model.setProperty("/TaxableUnitOfMeasureCode", null);
    model.setProperty("/TaxableFactor", null);

    const taxableFactor = this.byId("taxableFactor") as Input;
    taxableFactor.setValue("");
    taxableFactor.setValueState(ValueState.None);
  }

  /**
   * Le um fator direto do Input, nao do model: com `sap.ui.model.type.Float`, apagar o campo lanca
   * ParseException, o binding fica em erro e o model MANTEM o valor anterior. Pelo model, limpar o
   * campo gravaria silenciosamente o numero velho de volta.
   */
  private readFactor(inputId: string): number {
    const raw = (this.byId(inputId) as Input).getValue().trim();

    if (!raw) {
      return null;
    }

    // pt-BR: ponto e separador de milhar, virgula e decimal.
    return Number(raw.replace(/\./g, "").replace(",", "."));
  }

  async onSave(): Promise<void> {
    const model = this.getModel("complement") as JSONModel;
    const itemCode = model.getProperty("/ItemCode") as string;
    const uom = ((model.getProperty("/CommercialUnitOfMeasureCode") as string) || "").trim() || null;
    const factor = this.readFactor("commercialFactor");

    // Meio preenchido nao converte nada e ainda deixa a tela mentindo (sigla comercial ao lado de
    // preco em KG). Ou os dois, ou nenhum.
    if ((uom === null) !== (factor === null)) {
      MessageBox.warning("Informe a unidade e o fator, ou use Limpar para voltar a exibir em KG.");
      return;
    }

    if (factor !== null && !(factor > 0)) {
      MessageBox.warning("O fator deve ser um numero maior que zero.");
      return;
    }

    const taxableUom = ((model.getProperty("/TaxableUnitOfMeasureCode") as string) || "").trim().toUpperCase() || null;
    const taxableFactor = this.readFactor("taxableFactor");

    if ((taxableUom === null) !== (taxableFactor === null)) {
      MessageBox.warning("Informe a unidade tributável e o fator juntos, ou deixe os dois em branco.");
      return;
    }

    if (taxableFactor !== null && !(taxableFactor > 0)) {
      MessageBox.warning("O fator da unidade tributável deve ser maior que zero.");
      return;
    }

    const oModel = this.getModel() as ODataModel;
    const action = oModel.bindContext(this.api.itemsSetComplement);
    action.setParameter("ItemCode", itemCode);
    // JSON.stringify omite undefined, e um parametro do EDM que nao chega derruba a action com
    // 500 de corpo vazio — por isso null explicito, nunca undefined.
    action.setParameter("CommercialUnitOfMeasureCode", uom);
    action.setParameter("CommercialFactor", factor);
    action.setParameter("ControlsRoyalties", !!model.getProperty("/ControlsRoyalties"));
    action.setParameter("TaxableUnitOfMeasureCode", taxableUom);
    action.setParameter("TaxableFactor", taxableFactor);

    this.setBusy(true);
    try {
      await action.invoke();
      model.setProperty("/CommercialUnitOfMeasureCode", uom);
      model.setProperty("/CommercialFactor", factor);
      model.setProperty("/TaxableUnitOfMeasureCode", taxableUom);
      model.setProperty("/TaxableFactor", taxableFactor);
      (this.byId("commercialFactor") as Input).setValueState(ValueState.None);
      (this.byId("taxableFactor") as Input).setValueState(ValueState.None);
      MessageToast.show("Complemento salvo com sucesso.", { closeOnBrowserNavigation: false });
    } finally {
      this.setBusy(false);
    }
  }

  private stateRatesTable(): Table {
    return this.byId("itemStateRatesTable") as Table;
  }

  /** Filtra a tabela pelo produto da rota. A binding nasce suspensa (sem ItemCode ela traria tudo). */
  private loadStateRates(itemCode: string): void {
    const oModel = this.getModel() as ODataModel;
    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    const binding = this.stateRatesTable().getBinding("items") as ODataListBinding;
    binding.filter(new Filter("ItemCode", FilterOperator.EQ, itemCode));
    if (binding.isSuspended()) {
      binding.resume();
    } else {
      binding.refresh();
    }
  }

  /** Linha nova: ItemCode vem da tela; FCP e alíquota vazios herdam a UF. */
  onStateRateCreate(): void {
    const itemCode = (this.getModel("complement") as JSONModel).getProperty("/ItemCode") as string;
    (this.stateRatesTable().getBinding("items") as ODataListBinding).create(
      { ItemCode: itemCode, StateCode: null, InternalRate: null, FcpRate: null }, true, true);
  }

  async onStateRatesSave(): Promise<void> {
    const oModel = this.getModel() as ODataModel;
    const groupId = oModel.getUpdateGroupId();

    if (!oModel.hasPendingChanges(groupId)) {
      MessageToast.show("Nada a gravar.");
      return;
    }

    this.setBusy(true);
    try {
      await oModel.submitBatch(groupId);

      if (oModel.hasPendingChanges(groupId)) {
        // A mensagem do servidor já foi mostrada pelo handler global; as linhas com erro continuam editáveis.
        return;
      }

      MessageToast.show("Alíquotas por UF gravadas.");
      (this.stateRatesTable().getBinding("items") as ODataListBinding).refresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onStateRateDelete(): Promise<void> {
    const ctx = this.stateRatesTable().getSelectedItem()?.getBindingContext() as Context | undefined;
    if (!ctx) {
      MessageBox.alert("Selecione uma linha para excluir.");
      return;
    }

    if (!(await confirmDialog("Deseja realmente excluir a alíquota da UF selecionada ?", "Excluir alíquota ?"))) {
      return;
    }

    this.setBusy(true);
    try {
      await ctx.delete("$auto");
      MessageToast.show("Alíquota excluída.");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.onNavBack();
  }
}
