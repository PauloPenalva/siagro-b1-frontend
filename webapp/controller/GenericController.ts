import BaseController from "./BaseController";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Context from "sap/ui/model/odata/v4/Context";

import RequestModel from "siagrob1/model/RequestModel";
import MessageBox from "sap/m/MessageBox";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import formatter from "siagrob1/model/formatter";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * @namespace siagrob1.controller
 */
export default abstract class GenericController extends BaseController {

  api = { ...ServerRoutes }

  formatter = { ...formatter };

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

  openBusinessPartnersValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.open(this, "BusinessPartnersSelectDialog", ['CardCode', 'CardName'])
      .then((oContext: Context) => {
        const value = oContext.getProperty("CardCode") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openItemValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.open(this, "ItemsSelectDialog", ["ItemCode","ItemName"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("ItemCode") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openUnitsOfMeasureValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.open(this, "UnitsOfMeasureSelectDialog", ["Code","Description"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openHarvestSeasonsValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.open(this, "HarvestSeasonsSelectDialog", ["Code","Name"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openWarehouseValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.open(this, "WarehousesSelectDialog", ["Code","Name", "TaxId"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openTaxesValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.open(this, "TaxesSelectDialog", ["Code","Name"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }

  openQualityAttribsValueHelp(ev: Input$ValueHelpRequestEvent) {
    DialogHelper.open(this, "QualityAttribsSelectDialog", ["Code","Name"])
      .then((oContext: Context) => {
        const value = oContext.getProperty("Code") as string;
        ev.getSource().setValue(value);
      })
      .catch(err => {
        throw err;
      });
  }
} 
