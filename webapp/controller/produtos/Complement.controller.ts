import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { ValueState } from "sap/ui/core/library";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { BaseController } from "./BaseController";

/** Formulário da tela, no model JSON "complement" — não é uma entidade do model OData. */
type ComplementForm = {
  ItemCode?: string,
  ItemName?: string,
  CommercialUnitOfMeasureCode?: string,
  CommercialFactor?: number,
}

/**
 * @namespace siagrob1.controller.produtos
 */
export default class Complement extends BaseController {

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "complement");
    this.getRouter().getRoute("produtosComplement")
      .attachPatternMatched((ev) => void this.routeMatched(ev));
  }

  private async routeMatched(ev: Route$MatchedEvent): Promise<void> {
    const { id } = ev.getParameter("arguments") as { id: string };
    const model = this.getModel("complement") as JSONModel;

    model.setData({ ItemCode: id });

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
      [new Filter("Locked", FilterOperator.EQ, "N")]);

    if (!ctx) {
      return;
    }

    (this.getModel("complement") as JSONModel).setProperty(
      "/CommercialUnitOfMeasureCode", ctx.getProperty("Code") as string);
  }

  /** Zera os dois campos: e a unica forma de voltar a exibir em KG, ja que a unidade e valueHelpOnly. */
  onClear(): void {
    const model = this.getModel("complement") as JSONModel;
    model.setProperty("/CommercialUnitOfMeasureCode", null);
    model.setProperty("/CommercialFactor", null);

    const factor = this.byId("commercialFactor") as Input;
    factor.setValue("");
    factor.setValueState(ValueState.None);
  }

  /**
   * Le o fator direto do Input, nao do model: com `sap.ui.model.type.Float`, apagar o campo lanca
   * ParseException, o binding fica em erro e o model MANTEM o valor anterior. Pelo model, limpar o
   * campo gravaria silenciosamente o numero velho de volta.
   */
  private readFactor(): number {
    const raw = (this.byId("commercialFactor") as Input).getValue().trim();

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
    const factor = this.readFactor();

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

    const oModel = this.getModel() as ODataModel;
    const action = oModel.bindContext(this.api.itemsSetComplement);
    action.setParameter("ItemCode", itemCode);
    // JSON.stringify omite undefined, e um parametro do EDM que nao chega derruba a action com
    // 500 de corpo vazio — por isso null explicito, nunca undefined.
    action.setParameter("CommercialUnitOfMeasureCode", uom);
    action.setParameter("CommercialFactor", factor);

    this.setBusy(true);
    try {
      await action.invoke();
      model.setProperty("/CommercialUnitOfMeasureCode", uom);
      model.setProperty("/CommercialFactor", factor);
      (this.byId("commercialFactor") as Input).setValueState(ValueState.None);
      MessageToast.show("Complemento salvo com sucesso.", { closeOnBrowserNavigation: false });
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.onNavBack();
  }
}
