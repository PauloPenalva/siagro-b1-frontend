import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CommonController from "../common/CommonController";

/** Formulário da tela, no model JSON "complement" — não é uma entidade do model OData. */
type ComplementForm = {
  WarehouseCode?: string,
  WarehouseName?: string,
  IsParticipant?: boolean,
  IsOwn?: boolean,
  Notes?: string,
}

/**
 * @namespace siagrob1.controller.armazem
 */
export default class Complement extends CommonController {

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "complement");
    this.getRouter().getRoute("armazensComplement")
      .attachPatternMatched((ev) => void this.routeMatched(ev));
  }

  private async routeMatched(ev: Route$MatchedEvent): Promise<void> {
    const { id } = ev.getParameter("arguments") as { id: string };
    const model = this.getModel("complement") as JSONModel;

    model.setData({ WarehouseCode: id });

    this.setBusy(true);
    try {
      const [warehouse, complement] = await Promise.all([
        this.readWarehouse(id),
        this.readComplement(id),
      ]);

      // Armazém sem registro de complemento equivale aos dois flags em NÃO.
      model.setData({
        WarehouseCode: id,
        WarehouseName: warehouse?.Name,
        IsParticipant: complement?.IsParticipant ?? false,
        IsOwn: complement?.IsOwn ?? false,
        Notes: complement?.Notes ?? "",
      } as ComplementForm);
    } finally {
      this.setBusy(false);
    }
  }

  private async readWarehouse(code: string): Promise<{ Name?: string }> {
    const oModel = this.getModel() as ODataModel;
    const ctx = oModel.bindContext(`/Warehouses('${code}')`);

    return await ctx.requestObject() as { Name?: string };
  }

  /** Devolve undefined quando o armazém ainda não tem complemento — não é erro, é o caso comum. */
  private async readComplement(code: string): Promise<ComplementForm> {
    const oModel = this.getModel() as ODataModel;
    const func = oModel.bindContext(this.api.warehousesGetComplement);
    func.setParameter("WarehouseCode", code);

    await func.invoke();

    return func.getBoundContext().getObject() as ComplementForm;
  }

  async onSave(): Promise<void> {
    const model = this.getModel("complement") as JSONModel;
    const code = model.getProperty("/WarehouseCode") as string;
    const isParticipant = !!model.getProperty("/IsParticipant");
    const isOwn = !!model.getProperty("/IsOwn");
    // Vazio vai como null, e não como "": o serviço trata os dois igual, mas null é o que o GET
    // devolve depois, então a tela e o banco ficam com o mesmo valor sem precisar recarregar.
    const notes = ((model.getProperty("/Notes") as string) || "").trim() || null;

    const oModel = this.getModel() as ODataModel;
    const action = oModel.bindContext(this.api.warehousesSetComplement);
    action.setParameter("WarehouseCode", code);
    // JSON.stringify omite undefined, e um parametro do EDM que nao chega derruba a action com
    // 500 de corpo vazio — por isso booleano explicito, nunca undefined.
    action.setParameter("IsParticipant", isParticipant);
    action.setParameter("IsOwn", isOwn);
    action.setParameter("Notes", notes);

    this.setBusy(true);
    try {
      await action.invoke();
      MessageToast.show("Complemento salvo com sucesso.", { closeOnBrowserNavigation: false });
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.onNavBack();
  }
}
