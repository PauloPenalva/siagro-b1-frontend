import BaseController from "../BaseController";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import TruckDriverValueHelp from "siagrob1/valueHelpers/TruckDriverlueHelp";
import TruckValueHelp from "siagrob1/valueHelpers/TruckValueHelp";
import * as $ from 'jquery';
import { TruckDriver } from "siagrob1/types/TruckDriver";
import ParceiroNegocioValueHelp from "siagrob1/valueHelpers/ParceiroNegocioValueHelp";
import { ParceiroNegocio } from "siagrob1/types/ParceiroNegocio";
import ProdutoValueHelp from "siagrob1/valueHelpers/ProdutoValueHelp";
import { Produto } from "siagrob1/types/Produto";

/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class GenericController extends BaseController {
  
  
  async truckValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
    const obj = await TruckValueHelp.open("truckValueHelp", this.getView());
    if (obj) {
      ev.getSource().setValue(obj.Key);
    }
  }

  async truckDriverValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
    const obj = await TruckDriverValueHelp.open("truckDriverValueHelp", this.getView());
    if (obj) {
      ev.getSource().setValue(obj.Key);
    }
  }

  async costumerValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
    const obj = await ParceiroNegocioValueHelp.open("customerValueHelp", this.getView());
    if (obj) {
      ev.getSource().setValue(obj.CardCode);
    }
  }

  async itemValueHelpRequest(ev: Input$ValueHelpRequestEvent) {
    const obj = await ProdutoValueHelp.open("itemValueHelp", this.getView());
    if (obj) {
      ev.getSource().setValue(obj.ItemCode);
    }
  }

  async formatTruckDriverName(sKey: string) {
    if (!sKey) 
      return new Promise(resolve => resolve(""));
    
    return new Promise((resolve, reject) => {
      $.ajax(`/odata/TruckDrivers('${sKey}')?$select=Name`,{
        method: 'GET',
        contentType: 'application/json',
        success: ((data: TruckDriver) => resolve(data.Name)),
        error: (err => reject(new Error(err.responseText)))
      });
    });
  }

  async formatCustomerName(sKey: string) {
    if (!sKey) 
      return new Promise(resolve => resolve(""));
    
    return new Promise((resolve, reject) => {
      $.ajax(`/odata/BusinessPartners('${sKey}')?$select=CardName`,{
        method: 'GET',
        contentType: 'application/json',
        success: ((data: ParceiroNegocio) => resolve(data.CardName)),
        error: (err => reject(new Error(err.responseText)))
      });
    });
  }

  async formatItemName(sKey: string) {
    if (!sKey) 
      return new Promise(resolve => resolve(""));
    
    return new Promise((resolve, reject) => {
      $.ajax(`/odata/Items('${sKey}')?$select=ItemName`,{
        method: 'GET',
        contentType: 'application/json',
        success: ((data: Produto) => resolve(data.ItemName)),
        error: (err => reject(new Error(err.responseText)))
      });
    });
  }
}
