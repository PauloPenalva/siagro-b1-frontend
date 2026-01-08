import models from "../../model/models"
import { Estado } from "siagrob1/types/Estado";
import CommonController from "../common/CommonController";

/**
 * @namespace siagrob1.controller.veiculo
 */
export default class VeiculoBaseController extends CommonController {

  async formatSiglaUf(sCodigo: string): Promise<string> {
        if (sCodigo) {
          const sPath = `/odata/States('${sCodigo}')?$select=Abbreviation`;
          const cq = 
            await models.requestModel(sPath) as Estado
          
          return cq.Abbreviation;
        }
      }
  
}
