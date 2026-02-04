import BaseController from "../BaseController";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Context from "sap/ui/model/odata/v4/Context";

import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import formatter from "siagrob1/model/formatter";
import RequestModel from "siagrob1/model/RequestModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Item } from "siagrob1/types/Items";
import { Agent } from "siagrob1/types/Agent";
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import { HarvestSeason } from "siagrob1/types/HarvestSeason";
import { LogisticRegion } from "siagrob1/types/LogisticRegion";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";
import { Taxes } from "siagrob1/types/Taxes";
import { UnitOfMeasure } from "siagrob1/types/UnitOfMeasure";
import { Warehouse } from "siagrob1/types/Warehouse";

/**
 * @namespace siagrob1.controller
 */
export default abstract class CommonController extends BaseController {

  api = { ...ServerRoutes }

  formatter = { ...formatter };

  createFilterModel() {
    const filterModel = new JSONModel();
    this.getView().setModel(filterModel, "filter");
  }

  clearFilters() {
    this.createFilterModel();
  } 

  bindElement(path: string, parameters:object = undefined) {
    this.getView().bindElement({
      path,
      parameters,
      events: {
        dataRequested: () => this.setBusy(true), 
        dataReceived: () => this.setBusy(false),
      }
    })
  }

  async getResource<T>(resourceUrl: string) {
    if (!resourceUrl) {
      throw new Error("resource url is required.")
    }

    try{
      const requestModel = new RequestModel();
      return await requestModel
        .get(resourceUrl) as T    
    } catch(error) {
      const err = error as JQueryXHR;
      if (err.responseText) {
        MessageBox.error(err.responseText);
      } else {
        MessageBox.error(`${resourceUrl}\n${err.status} - ${err.statusText}`)
      }
    }
  }

  openProcessingCostsListValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "ProcessingCostsListSelectDialog", ['Code', 'Description'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openTruckDriversValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "TruckDriversSelectDialog", ['Code', 'Name'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openTrucksValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "TrucksSelectDialog", ['Code', 'Model'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openSalesContractsDocTypesValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "SalesContractsDocTypesSelectDialog", ['Code', 'Name', 'Serie'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openDocTypesValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "DocTypesSelectDialog", ['Code', 'Name', 'Serie'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

   openStatesValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "StatesSelectDialog", ['Code', 'Name', 'Abbreviation'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openAgentsValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(
        this, 
        "AgentsSelectDialog", 
        ['Name'],
        [ new Filter("Inactive", FilterOperator.EQ, "N") ]
      )
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openLogisticRegionsValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "LogisticRegionsSelectDialog", ['Code', 'Name'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openBusinessPartnersValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ['CardCode', 'CardName', 'CardFName'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("CardCode") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openSuppliersValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(
        this, 
        "SuppliersSelectDialog", 
        ['CardCode', 'CardName', 'CardFName'],
        [ new Filter("CardType", FilterOperator.EQ, 'S')]
      )
      .then((oContext: Context) => {
        const value = oContext.getProperty("CardCode") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }
  
  openCostumersValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(
        this, 
        "CostumersSelectDialog", 
        ['CardCode', 'CardName', 'CardFName'],
        [ new Filter("CardType", FilterOperator.EQ, 'C')]
      )
      .then((oContext: Context) => {
        const value = oContext.getProperty("CardCode") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openItemValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "ItemsSelectDialog", ["ItemCode","ItemName"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("ItemCode") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openUnitsOfMeasureValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(
        this, 
        "UnitsOfMeasureSelectDialog", 
        ["Code","Description"],
        [ 
          new Filter("Locked", FilterOperator.EQ, "N") 
        ]
      )
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openHarvestSeasonsValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "HarvestSeasonsSelectDialog", ["Code","Name"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openWarehouseValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "WarehousesSelectDialog", ["Code","Name", "TaxId"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openTaxesValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "TaxesSelectDialog", ["Code","Name"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openQualityAttribsValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "QualityAttribsSelectDialog", ["Code","Name"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openProcessingServicesValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.openTableSelectDialog(this, "ProcessingServicesSelectDialog", ["Code","Description"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  async formatItemName(key: string){
    if (!key){
      return null;
    }
  
    const data = await this.getResource<Item>(`${this.api.items}('${key}')`)
    return data?.ItemName;
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
