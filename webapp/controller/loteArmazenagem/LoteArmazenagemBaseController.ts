import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import BaseController from "../BaseController";
import ParceiroNegocioValueHelp from "siagrob1/valueHelpers/ParceiroNegocioValueHelp";
import models from "../../model/models"
import { ParceiroNegocio } from "siagrob1/types/ParceiroNegocio";
import { Produto } from "siagrob1/types/Produto";
import ProdutoValueHelp from "siagrob1/valueHelpers/ProdutoValueHelp";
import ArmazemValueHelp from "siagrob1/valueHelpers/ArmazemValueHelp";
import TabelaCustoValueHelp from "siagrob1/valueHelpers/TabelaCustoValueHelp";
import { TabelaCusto } from "siagrob1/types/TabelaCusto";

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
        ev.getSource().setValue(obj.Id.toString());
      }
    }


  async produtoValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
      const obj = await ProdutoValueHelp.open(
        "produtoValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.Id.toString());
      }
    }
  
  async armazemValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
      const obj = await ArmazemValueHelp.open(
        "armazemValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.Id.toString());
      }
    }

  async tabelaCustoValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
      const obj = await TabelaCustoValueHelp.open(
        "TabelaCustoValueHelp",
        this.getView()
      );
      if (obj) {
        ev.getSource().setValue(obj.Id.toString());
      }
    }

  async formatRazaoSocialBP(sId: string): Promise<string> {
        //const oInput = <Input> this.byId("parceiroNegocioRazaoSocial") 
        if (sId) {
          const sPath = `/odata/Participantes/${sId}`;
          const cq = 
            //await models.requestModel(sPath, oInput) as ParceiroNegocio
            await models.requestModel(sPath) as ParceiroNegocio
          
          return cq.RazaoSocial;
        }
      }
  async formatProdutoDescricao(sId: string): Promise<string> {
        //const oInput = <Input> this.byId("parceiroNegocioRazaoSocial") 
        if (sId) {
          const sPath = `/odata/Produtos/${sId}`;
          const cq = 
            //await models.requestModel(sPath, oInput) as ParceiroNegocio
            await models.requestModel(sPath) as Produto
          
          return cq.Descricao;
        }
      }
  
    async formatArmazemDescricao(sId: string): Promise<string> {
        if (sId) {
          const sPath = `/odata/Armazens/${sId}`;
          const cq = 
            await models.requestModel(sPath) as Produto
          
          return cq.Descricao;
        }
      }

    async formatTabelaCustoDescricao(sId: string): Promise<string> {
        if (sId) {
          const sPath = `/odata/TabelasCusto/${sId}`;
          const cq = 
            await models.requestModel(sPath) as TabelaCusto
          
          return cq.Descricao;
        }
      }
}
