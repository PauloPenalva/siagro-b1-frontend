import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import BaseController from "../BaseController";
import models from "../../model/models"
import { Estado } from "siagrob1/types/Estado";
import EstadoValueHelp from "siagrob1/valueHelpers/EstadoValueHelp";

/**
 * @namespace siagrob1.controller.veiculo
 */
export default class VeiculoBaseController extends BaseController {


  async ufValueHelpResquest(ev: Input$ValueHelpRequestEvent) {
      const obj = await EstadoValueHelp.open(
        "estadoValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.Key);
      }
    }

  async formatSiglaUf(sCodigo: string): Promise<string> {
        if (sCodigo) {
          const sPath = `/odata/States/${sCodigo}?$select=Abbreviation`;
          const cq = 
            await models.requestModel(sPath) as Estado
          
          return cq.Abbreviation;
        }
      }
  
}
