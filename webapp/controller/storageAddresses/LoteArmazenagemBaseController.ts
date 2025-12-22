import models from "../../model/models"
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import { Item } from "siagrob1/types/Items";
import { TabelaCusto } from "siagrob1/types/TabelaCusto";
import { Armazem } from "siagrob1/types/Armazem";
import CommonController from "../common/CommonController";

/**
 * @namespace siagrob1.controller.loteArmazenagem
 */
export default class LoteArmazenagemBaseController extends CommonController {


  async formatRazaoSocialBP(sId: string): Promise<string> {
        //const oInput = <Input> this.byId("parceiroNegocioRazaoSocial") 
        if (sId) {
          const sPath = `/odata/BusinessPartners/${sId}`;
          const cq = 
            //await models.requestModel(sPath, oInput) as ParceiroNegocio
            await models.requestModel(sPath) as BusinessPartner
          
          return cq.CardName;
        }
      }
  async formatProdutoDescricao(sId: string): Promise<string> {
        //const oInput = <Input> this.byId("parceiroNegocioRazaoSocial") 
        if (sId) {
          const sPath = `/odata/Items/${sId}`;
          const cq = 
            //await models.requestModel(sPath, oInput) as ParceiroNegocio
            await models.requestModel(sPath) as Item
          
          return cq.ItemName;
        }
      }
  
    async formatArmazemDescricao(sId: string): Promise<string> {
        if (sId) {
          const sPath = `/odata/Warehouses/${sId}?$select=Name`;
          const cq = 
            await models.requestModel(sPath) as Armazem
          
          return cq.Name;
        }
      }
}
