import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { CompanyTestConnectionResult } from "siagrob1/types/Company";

export abstract class BaseController extends CommonController {

  /** Flags da tela: o código só é editável no cadastro novo (é a chave que sessões, perfis e jobs carregam). */
  protected setScreenModel(codeEditable: boolean): void {
    this.getView().setModel(new JSONModel({ codeEditable }), "screen");
  }

  /**
   * Testa a string digitada no servidor. No cadastro novo o contexto é transitório e não manda o
   * código; na edição manda, para o servidor fundir a senha mascarada com a gravada.
   */
  async onTestConnection(): Promise<void> {
    const oContext = this.getView().getBindingContext() as Context;
    const connectionString = oContext?.getProperty("ConnectionString") as string;

    if (!connectionString) {
      MessageBox.warning("Informe a string de conexão.");
      return;
    }

    const code = oContext.isTransient() ? null : (oContext.getProperty("Code") as string);
    const oModel = this.getModel() as ODataModel;
    const action = oModel.bindContext(ServerRoutes.companiesTestConnection);

    action.setParameter("Code", code);
    action.setParameter("ConnectionString", connectionString);

    try {
      this.setBusy(true);

      await action.invoke();

      const result = action.getBoundContext().getObject() as CompanyTestConnectionResult;
      const details = [
        ...[
          result.Server ? `Servidor: ${result.Server}` : "",
          result.Database ? `Banco: ${result.Database}` : ""
        ].filter(Boolean),
        ...(result.PendingMigrations?.length ? ["", "Migrations pendentes:", ...result.PendingMigrations] : [])
      ].join("\n");

      if (result.Success) {
        MessageBox.success(`${result.Message}\n\n${details}`, { title: "Testar conexão" });
      } else {
        MessageBox.error(`${result.Message}\n\n${details}`, { title: "Testar conexão" });
      }
    } catch (error) {
      MessageBox.error("Falha ao testar a conexão: " + ((error as Error)?.message ?? ""));
    } finally {
      this.setBusy(false);
    }
  }
}
