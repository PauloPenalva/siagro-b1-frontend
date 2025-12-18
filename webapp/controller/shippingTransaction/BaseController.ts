import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import { Item } from "siagrob1/types/Items";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";
import { TruckDriver } from "siagrob1/types/TruckDriver";
import { UnitOfMeasure } from "siagrob1/types/UnitOfMeasure";
import { Warehouse } from "siagrob1/types/Warehouse";
import CommonController from "../common/CommonController";

export abstract class BaseController extends CommonController {
  
  async formatDriverName(key: string) {
      if (!key) {
        return null;
      }
  
      try {
        this.setBusy(true);
        const data = await this.getResource<TruckDriver>(
          `${this.api.truckDrivers}('${key}')`
        );
  
        return data?.Name;
      } finally {
        this.setBusy(false);
      }
    }
  
    async formatBusinessPartnerName(key: string) {
      if (!key) {
        return null;
      }
  
      try {
        this.setBusy(true);
        const data = await this.getResource<BusinessPartner>(
          `${this.api.businessPartners}('${key}')`
        );
  
        return data?.CardName;
      } finally {
        this.setBusy(false);
      }
    }
  
    async formatItemName(key: string) {
      if (!key) {
        return null;
      }
  
      const data = await this.getResource<Item>(`${this.api.items}('${key}')`);
      return data?.ItemName;
    }
  
    async formatUnitOfMeasureDescription(key: string) {
      if (!key) {
        return null;
      }
  
      const data = await this.getResource<UnitOfMeasure>(
        `${this.api.unitsOfMeasure}('${key}')`
      );
      return data?.Description;
    }
  
    async formatWarehouseName(key: string) {
      if (!key) {
        return null;
      }
  
      const data = await this.getResource<Warehouse>(
        `${this.api.warehouses}('${key}')`
      );
      return data?.Name;
    }
  
    async formatQualityAttribName(key: string) {
      if (!key) {
        return null;
      }
  
      const data = await this.getResource<QualityAttrib>(
        `${this.api.qualityAttrib}('${key}')`
      );
      return data?.Name;
    }
}
