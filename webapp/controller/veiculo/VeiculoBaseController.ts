import { Input$LiveChangeEvent } from "sap/m/Input";
import InputBase, { InputBase$ChangeEvent } from "sap/m/InputBase";
import { Select$ChangeEvent } from "sap/m/Select";
import { ValueState } from "sap/ui/core/library";
import Context from "sap/ui/model/odata/v4/Context";
import { INVALID_PLATE_MESSAGE, isValidPlate, normalizePlate } from "siagrob1/helpers/PlateHelpers";
import CommonController from "../common/CommonController";

/**
 * @namespace siagrob1.controller.veiculo
 */
export default class VeiculoBaseController extends CommonController {

  /**
   * Enquanto digita, só limpa o erro: acusar placa inválida a cada tecla marcaria em vermelho
   * toda placa ainda pela metade.
   */
  onPlateLiveChange(ev: Input$LiveChangeEvent): void {
    if (isValidPlate(ev.getParameter("value"))) {
      ev.getSource().setValueState(ValueState.None);
    }
  }

  /**
   * Ao sair do campo: maiúsculas, sem espaço nem hífen, e acusa o que não for placa (GAC-1190).
   * Normaliza aqui, e não no liveChange: o `setValue` durante a digitação atualiza o último valor
   * do InputBase, o `change` deixa de disparar ao sair do campo, e "CUD 1H5" passava sem aviso.
   */
  onPlateChange(ev: InputBase$ChangeEvent): void {
    const input = ev.getSource();
    input.setValue(normalizePlate(ev.getParameter("value")));
    this.validatePlate(input);
  }

  /** Reboque não tem rodado: ao virar reboque, o rodado é apagado (o backend recusaria). */
  onKindChange(ev: Select$ChangeEvent): void {
    const context = ev.getSource().getBindingContext() as Context;

    if (context && ev.getSource().getSelectedKey() === "Trailer") {
      void context.setProperty("WheelType", null);
    }
  }

  /** Voltar a "Próprio" limpa os dados do proprietário terceiro. */
  onOwnerTypeChange(ev: Select$ChangeEvent): void {
    const context = ev.getSource().getBindingContext() as Context;

    if (context && ev.getSource().getSelectedKey() === "Own") {
      void context.setProperty("OwnerCardCode", null);
      void context.setProperty("OwnerRntrc", null);
      void context.setProperty("OwnerKind", null);
    }
  }

  protected validatePlate(input = this.byId("plateInput") as InputBase): boolean {
    if (isValidPlate(input.getValue())) {
      input.setValueState(ValueState.None);
      return true;
    }

    input.setValueState(ValueState.Error);
    input.setValueStateText(input.getValue() ? INVALID_PLATE_MESSAGE : "Campo obrigatório");
    return false;
  }
}
