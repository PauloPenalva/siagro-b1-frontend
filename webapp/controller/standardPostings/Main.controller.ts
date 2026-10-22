import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import { Link$PressEvent } from "sap/m/Link";
import { CONTEXT_TEXT, loadCatalog, loadConfigured } from "./StandardPostingApi";

/**
 * Lista dos códigos de lançamento padrão (catálogo fixo) com a situação da configuração de cada um.
 * @namespace siagrob1.controller.standardPostings
 */
export default class Main extends CommonController {
  onInit(): void {
    this.getView().setModel(new JSONModel({ Rows: [] }), "lp");
    this.getRouter().getRoute("standardPostings").attachPatternMatched(() => void this.onRefresh());
  }

  async onRefresh(): Promise<void> {
    this.setBusy(true);
    try {
      const [catalog, configured] = await Promise.all([loadCatalog(), loadConfigured()]);
      const byCode = new Map(configured.map((p) => [p.Code, p]));
      const rows = catalog.map((c) => {
        const p = byCode.get(c.Code);
        return {
          Code: c.Code,
          Description: c.Description,
          ContextText: CONTEXT_TEXT[c.Context] ?? c.Context,
          Reverses: c.Reverses ?? "",
          LineCount: p?.Lines?.length ?? 0,
          StatusText: !p ? "Não configurado" : p.Active ? "Ativo" : "Inativo",
        };
      });
      (this.getView().getModel("lp") as JSONModel).setProperty("/Rows", rows);
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  onOpen(ev: Link$PressEvent): void {
    const code = ev.getSource().getBindingContext("lp").getProperty("Code") as string;
    this.navTo("standardPostingsEdit", { code });
  }
}
