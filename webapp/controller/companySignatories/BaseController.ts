import MessageBox from "sap/m/MessageBox";
import Form from "sap/ui/layout/form/Form";
import JSONModel from "sap/ui/model/json/JSONModel";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { SIGNATORY_ROLE_OPTIONS } from "siagrob1/model/contractDrafts";
import AppBaseController from "../BaseController";

/** Id do `sap.ui.layout.form.Form` do fragment, compartilhado por inclusão e edição. */
const FORM_ID = "formCompanySignatory";

/**
 * Base das telas de Signatários da Empresa.
 *
 * ⚠️ `AppBaseController.validateForm`/`clearStates` NÃO servem aqui: fazem `getContent()`, que
 * só existe em `SimpleForm`. Este formulário é `Form` + `ColumnLayout` (recomendação da SAP para
 * formulário novo, já adotada em Contas Financeiras), então a varredura vem de
 * `helpers/FormValidation`.
 */
export abstract class BaseController extends AppBaseController {

  /** Os 13 atos do provedor no Select de Papel, numa só lista derivada do mapa de rótulos. */
  protected setRoleOptions(): void {
    this.getView().setModel(new JSONModel({ roles: SIGNATORY_ROLE_OPTIONS }), "options");
  }

  protected clearFormStates(): void {
    clearFieldStates(this.byId(FORM_ID) as Form);
  }

  protected validateSignatory(): boolean {
    if (validateRequiredFields(this.byId(FORM_ID) as Form)) {
      return true;
    }

    MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");

    return false;
  }
}
