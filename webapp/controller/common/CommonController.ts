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
        ['Code', 'Name'],
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
    DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ['CardCode', 'CardName'])
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
} 
