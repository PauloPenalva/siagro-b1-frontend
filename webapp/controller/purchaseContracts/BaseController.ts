import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import GenericController from "../GenericController";
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import { Item } from "siagrob1/types/Items";
import { UnitOfMeasure } from "siagrob1/types/UnitOfMeasure";
import { HarvestSeason } from "siagrob1/types/HarvestSeason";
import { Warehouse } from "siagrob1/types/Warehouse";
import { Taxes } from "siagrob1/types/Taxes";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default abstract class PurchaseContractsBaseController extends GenericController {
  
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
    oBinding.create({
      "Status": "Pending"
    }, false, true, false);
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

  async formatBusinessPartnerName(key: string){
    if (!key){
      return null;
    }

    const data = await this
      .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')`)
    
    return data?.CardName;
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
}
