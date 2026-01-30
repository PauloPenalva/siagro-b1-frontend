import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import CommonController from "../common/CommonController";
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import { Item } from "siagrob1/types/Items";
import { UnitOfMeasure } from "siagrob1/types/UnitOfMeasure";
import { HarvestSeason } from "siagrob1/types/HarvestSeason";
import { Warehouse } from "siagrob1/types/Warehouse";
import { Taxes } from "siagrob1/types/Taxes";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";
import { LogisticRegion } from "siagrob1/types/LogisticRegion";
import { Agent } from "siagrob1/types/Agent";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default abstract class SalesContractsBaseController extends CommonController {
  
  onAddBroker() {
    const oTable = this.byId("purchaseContractsBrokersTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveBroker() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractsBrokersTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }
  
  onAddTax() {
    const oTable = this.byId("purchaseContractsTaxesTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveTax() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractsTaxesTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddPriceFixation() {
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({
      "Status": "Pending"
    }, false, true, false);
  }

  onRemovePriceFixation() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractPriceFixationsTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  onAddQualityParameter() {
    const oTable = this.byId("purchaseContractQualityParameterTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveQualityParameter() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("purchaseContractQualityParameterTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  async formatAgentName(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<Agent>(`${this.api.agents}(${key})`)
      
      return data?.Name;
    } finally {
      this.setBusy(false);
    }

  }

  async formatLogisticRegionName(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<LogisticRegion>(`${this.api.logisticRegions}('${key}')`)
      
      return data?.Name;
    } finally {
      this.setBusy(false);
    }

  }

  async formatBusinessPartnerName(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')`)
      
      return data?.CardName;
    } finally {
      this.setBusy(false);
    }

  }

  async formatItemName(key: string){
    if (!key){
      return null;
    }

    const data = await this.getResource<Item>(`${this.api.items}('${key}')`)
    return data?.ItemName;
  }

  async formatUnitOfMeasureDescription(key: string) {
     if (!key){
      return null;
    }

    const data = await this.getResource<UnitOfMeasure>(`${this.api.unitsOfMeasure}('${key}')`)
    return data?.Description;
  }

  async formatHarvestSeasonName(key: string) {
     if (!key){
      return null;
    }

    const data = await this.getResource<HarvestSeason>(`${this.api.harvestSeasons}('${key}')`)
    return data?.Name;
  }

  async formatWarehouseName(key: string) {
     if (!key){
      return null;
    }

    const data = await this.getResource<Warehouse>(`${this.api.warehouses}('${key}')`)
    return data?.Name;
  }

  async formatTaxName(key: string) {
     if (!key){
      return null;
    }

    const data = await this.getResource<Taxes>(`${this.api.taxes}('${key}')`)
    return data?.Name;
  }

  async formatTaxRate(key: string) {
     if (!key){
      return null;
    }

    const data = await this.getResource<Taxes>(`${this.api.taxes}('${key}')`)
    return this.formatter.formatDecimal(data?.Rate);
  }

   async formatQualityAttribName(key: string) {
     if (!key){
      return null;
    }

    const data = await this.getResource<QualityAttrib>(`${this.api.qualityAttrib}('${key}')`)
    return data?.Name;
  }

  async onWithdrawApproval() {
    const oView = this.getView();
    const oContext = oView.getBindingContext() as Context;
    if (!oContext) {
      return;
    }
    const bConfirm = await confirmDialog("Retirar contrato da aprovação ?");
    if (bConfirm) {
    
      const key = oContext.getProperty("Key") as string;
      const sUrl = `${this.api.salesContractsWithdrawApproval}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () => { 
          oContext.refresh();
        },
        error: err => {
          this.setBusy(false);
          MessageBox.error(err.responseJSON?.error?.message);
        },
      })
      .done(() => this.setBusy(false))
    }
  }

  async onSendToApproval() {
    const oView = this.getView();
    const oContext = oView.getBindingContext() as Context;
    if (!oContext) {
      return;
    }
    const bConfirm = await confirmDialog("Enviar contrato para aprovação ?");
    if (bConfirm) {
    
      const key = oContext.getProperty("Key") as string;
      const sUrl = `${this.api.salesContractsSendToApproval}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () => { 
          oContext.refresh();
        },
        error: err => {
          this.setBusy(false);
          MessageBox.error(err.responseJSON?.error?.message);
        },
      })
      .done(() => this.setBusy(false))
    }
  }

   getInvoices(key: string){
      const oView = this.getView();
      const invoicesModel = new JSONModel();
      const oModel = this.getModel() as ODataModel;
      const funcImport = oModel.bindContext("/SalesContractsGetAllocationsByContract(...)");
      funcImport.setParameter("SalesContractKey", key);
  
      oView.setModel(invoicesModel, "invoicesModel");
  
      this.setBusy(true);
      funcImport.invoke()
        .then(() => {
          const resultContext = funcImport.getBoundContext();
          const viewModel = this.getModel("invoicesModel") as JSONModel
          viewModel.setData(resultContext.getObject() as object);
        })
        .finally(() => this.setBusy(false))
    }
}
