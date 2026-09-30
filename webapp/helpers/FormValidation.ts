import Input from "sap/m/Input";
import Select from "sap/m/Select";
import { ValueState } from "sap/ui/core/library";
import Form from "sap/ui/layout/form/Form";

/**
 * Validação dos campos `required` de um `sap.ui.layout.form.Form`.
 *
 * ⚠️ `BaseController.validateForm` do projeto NÃO serve para estes formulários: ele faz
 * `oForm.getContent()`, que só existe em `sap.ui.layout.form.SimpleForm`. Um `Form` expõe
 * `getFormContainers()` e estouraria em runtime. Como a recomendação da SAP é `Form` +
 * `ColumnLayout` em formulário novo, a varredura correta mora aqui.
 *
 * A mesma lógica está embutida em `controller/financialAccounts/BaseController.ts`, que veio
 * antes deste helper; quem mexer lá pode passar a usar estas funções.
 */

const REQUIRED_MESSAGE = "Campo obrigatório";

function eachField(form: Form, visit: (field: Input | Select) => void): void {
  if (!form) return;

  form.getFormContainers().forEach((container) => {
    container.getFormElements().forEach((element) => {
      element.getFields().forEach((field) => {
        if (field instanceof Input || field instanceof Select) {
          visit(field);
        }
      });
    });
  });
}

/**
 * Marca em vermelho todo campo `required` vazio e devolve se o formulário pode ser gravado.
 * Varre o formulário inteiro: a pessoa vê de uma vez tudo o que falta, não um campo por vez.
 * Formulário ausente reprova — é sintoma de id errado, e deixar salvar seria pior.
 */
export function validateRequiredFields(form: Form): boolean {
  if (!form) return false;

  let valid = true;

  eachField(form, (field) => {
    if (!field.getRequired()) return;

    const filled =
      field instanceof Input ? (field.getValue() ?? "").trim() !== "" : !!field.getSelectedKey();

    field.setValueState(filled ? ValueState.None : ValueState.Error);

    if (!filled) {
      field.setValueStateText(REQUIRED_MESSAGE);
      valid = false;
    }
  });

  return valid;
}

/** Apaga as marcações de erro — chamado ao abrir a tela, para não herdar o vermelho da anterior. */
export function clearFieldStates(form: Form): void {
  eachField(form, (field) => field.setValueState(ValueState.None));
}
