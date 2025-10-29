import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import BaseController from "../BaseController";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CaracteristcaQualidadeValueHelp from "siagrob1/valueHelpers/CaracteristicaQualidadeValueHelp";
import formatter from "../../model/formatter";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import ServicosArmazenagemValueHelp from "siagrob1/valueHelpers/ServicosArmazenagemValueHelp";
import "jquery";
import models from "../../model/models";
import { CaracteristcaQualidade } from "siagrob1/types/CaracteristcaQualidade";
import { ServicoArmazenagem } from "siagrob1/types/ServicoArmazenagem";
import Row from "sap/ui/table/Row";

/**
 * @namespace siagrob1.controller.TabelaCusto
 */
export default class TabelaCustoBaseController extends BaseController {
  formatter = { ...formatter };

  onAddDescontoSecagem() {
    (
      this.getView()
        .byId("tableDescontoSecagem")
        .getBinding("rows") as ODataListBinding
    ).create({}, false, true, false);
  }

  onRemoveDescontoSecagem() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("tableDescontoSecagem") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddValorSecagem() {
    (
      this.getView()
        .byId("tableValorSecagem")
        .getBinding("rows") as ODataListBinding
    ).create({}, false, true, false);
  }

  onRemoveValorSecagem() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("tableValorSecagem") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddQualidade() {
    (
      this.getView()
        .byId("tableQualidade")
        .getBinding("rows") as ODataListBinding
    ).create({}, false, true, false);
  }

  onRemoveQualidade() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("tableQualidade") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddServicos() {
    (
      this.getView()
        .byId("tableServicos")
        .getBinding("rows") as ODataListBinding
    ).create({}, false, true, false);
  }

  onRemoveServicos() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("tableServicos") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  async cqValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
    const obj = await CaracteristcaQualidadeValueHelp.open(
      "cq",
      this.getView()
    );
    if (obj) {
      ev.getSource().setValue(obj.Id);
    }
  }

  async servicoValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
    const obj = await ServicosArmazenagemValueHelp.open(
      "servico",
      this.getView()
    );
    if (obj) {
      ev.getSource().setValue(obj.Id);
    }
  }

  async formatDescricaoCaracteristica(sId: string): Promise<string> {
      const oTable = <Table> this.byId("tableQualidade");
      if (sId) {
        const sPath = `/odata/CaracteristicasQualidade/${sId}`;
        const cq = 
          await models.requestModel(sPath, oTable) as CaracteristcaQualidade
        
        return cq.Descricao;
      }
    }

  async formatDescricaoServico(sId: string): Promise<string> {
    const oTable = <Table> this.byId("tableServicos");
    if (sId) {
      const sPath = `/odata/ServicosArmazem/${sId}`;
      const sv = await models.requestModel(sPath, oTable) as ServicoArmazenagem;
    
      return sv.Descricao;
    }
  }

  public validateLineItems(){
    if (!this.validateDescontosSecagem()) {
      MessageBox.alert("Preencha corretamente os descontos de secagem.")
      return false;
    }
    
    if (!this.validateValoresSecagem()) {
      MessageBox.alert("Preencha corretamente os custos de secagem.")
      return false;
    }

    if (!this.validateQualidades()) {
      MessageBox.alert("Preencha corretamente a(s) qualidade(s).")
      return false;
    }
    
    if (!this.validateServicos()) {
      MessageBox.alert("Preencha corretamente o(s) serviço(s).")
      return false;
    }

    return true;
  }

  private validateDescontosSecagem() {
    const oTable = <Table> this.byId("tableDescontoSecagem");
    let bValid = true;
    
    oTable.getRows().forEach((oRow)=>{
      if (oRow instanceof Row) {
        const oContext = oRow.getBindingContext() as Context;
        if (oContext) {
          const nUmidadeDe = <number> oContext.getProperty("UmidadeDe");
          const nUmidadeAte = <number> oContext.getProperty("UmidadeAte");
          const nPercentualDesconto = <number> oContext.getProperty("PercentualDesconto");
          if (nUmidadeDe == null || nUmidadeAte == null || nPercentualDesconto == null) {
               bValid = false;
          }
        }
      }
    });

    return bValid;
  }

  private validateValoresSecagem() {
    const oTable = <Table> this.byId("tableValorSecagem");
    let bValid = true;
    
    oTable.getRows().forEach((oRow)=>{
      if (oRow instanceof Row) {
        const oContext = oRow.getBindingContext() as Context;
        if (oContext) {
          const nUmidadeDe = <number> oContext.getProperty("UmidadeDe");
          const nUmidadeAte = <number> oContext.getProperty("UmidadeAte");
          const nValorCobranca = <number> oContext.getProperty("ValorCobranca");
          if (nUmidadeDe == null || nUmidadeAte == null || nValorCobranca == null) {
               bValid = false;
          }
        }
      }
    });

    return bValid;
  }

  private validateQualidades() {
    const oTable = <Table> this.byId("tableQualidade");
    let bValid = true;
    
    oTable.getRows().forEach((oRow)=>{
      if (oRow instanceof Row) {
        const oContext = oRow.getBindingContext() as Context;
        if (oContext) {
          const sId = <string> oContext.getProperty("CaracteristicaQualidadeId");
          const nTolerancia = <number> oContext.getProperty("Tolerancia");
          const nDesconto = <number> oContext.getProperty("Desconto");
          if (sId == null || nTolerancia == null || nDesconto == null) {
               bValid = false;
          }
        }
      }
    });

    return bValid;
  }

  private validateServicos() {
    const oTable = <Table> this.byId("tableServicos");
    let bValid = true;
    
    oTable.getRows().forEach((oRow)=>{
      if (oRow instanceof Row) {
        const oContext = oRow.getBindingContext() as Context;
        if (oContext) {
          const sId = <string> oContext.getProperty("ServicoId");
          const nTolerancia = <number> oContext.getProperty("Valor");
          const sPontoExecucao = <string> oContext.getProperty("PontoExecucao");
          if (sId == null || nTolerancia == null || sPontoExecucao == null) {
               bValid = false;
          }
        }
      }
    });

    return bValid;
  }

}
