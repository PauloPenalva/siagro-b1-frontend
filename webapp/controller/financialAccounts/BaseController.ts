import Input from "sap/m/Input";
import Select from "sap/m/Select";
import { ValueState } from "sap/ui/core/library";
import Form from "sap/ui/layout/form/Form";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * Base das telas de Conta Financeira. Os value helps genéricos (filial, conta contábil) já
 * vivem no CommonController e não devem ser reimplementados aqui.
 *
 * ⚠️ `BaseController.validateForm` do projeto NÃO serve para estas telas: ele faz
 * `oForm.getContent()`, que só existe em `sap.ui.layout.form.SimpleForm`. Um
 * `sap.ui.layout.form.Form` expõe `getFormContainers()` e estouraria em runtime. Como a
 * recomendação da SAP é usar `Form` + `ColumnLayout` em formulário novo, a validação dos
 * obrigatórios fica aqui, percorrendo a hierarquia certa.
 */
export abstract class BaseController extends CommonController {

  /** Valida os campos `required` de um `sap.ui.layout.form.Form`. */
  protected validateFinancialForm(sFormId: string): boolean {
    const oForm = this.byId(sFormId) as Form;
    let bValid = true;

    if (!oForm) return false;

    oForm.getFormContainers().forEach((oContainer) => {
      oContainer.getFormElements().forEach((oElement) => {
        oElement.getFields().forEach((oField) => {
          if (oField instanceof Input && oField.getRequired()) {
            const sValue = (oField.getValue() ?? "").trim();
            oField.setValueState(sValue ? ValueState.None : ValueState.Error);
            if (!sValue) {
              oField.setValueStateText("Campo obrigatório");
              bValid = false;
            }
          }

          if (oField instanceof Select && oField.getRequired()) {
            const sKey = oField.getSelectedKey();
            oField.setValueState(sKey ? ValueState.None : ValueState.Error);
            if (!sKey) {
              oField.setValueStateText("Campo obrigatório");
              bValid = false;
            }
          }
        });
      });
    });

    return bValid;
  }
}
