import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import BaseController from "../BaseController";
import ParceiroNegocioValueHelp from "siagrob1/valueHelpers/ParceiroNegocioValueHelp";
import models from "../../model/models"
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import { Item } from "siagrob1/types/Items";
import ProdutoValueHelp from "siagrob1/valueHelpers/ProdutoValueHelp";
import ArmazemValueHelp from "siagrob1/valueHelpers/ArmazemValueHelp";
import TabelaCustoValueHelp from "siagrob1/valueHelpers/TabelaCustoValueHelp";
import { TabelaCusto } from "siagrob1/types/TabelaCusto";
import { Armazem } from "siagrob1/types/Armazem";

/**
 * @namespace siagrob1.controller.loteArmazenagem
 */
export default class LoteArmazenagemBaseController extends BaseController {


  async bpValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
      const obj = await ParceiroNegocioValueHelp.open(
        "parceiroNegocioValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.CardCode.toString());
      }
  }


  async produtoValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
      const obj = await ProdutoValueHelp.open(
        "produtoValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.ItemCode.toString());
      }
    }
  
  async armazemValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
      const obj = await ArmazemValueHelp.open(
        "armazemValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.Code);
      }
    }

  async tabelaCustoValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
      const obj = await TabelaCustoValueHelp.open(
        "TabelaCustoValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.Key);
      }
    }

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

    async formatTabelaCustoDescricao(sId: string): Promise<string> {
        if (sId) {
          const sPath = `/odata/ProcessingCosts/${sId}?$select=Description`;
          const cq = 
            await models.requestModel(sPath) as TabelaCusto
          
          return cq.Description;
        }
      }
}
