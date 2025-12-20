import CommonController from "siagrob1/controller/common/CommonController";
import { BusinessPartner } from "siagrob1/types/BusinessPartner";

export abstract class BaseController extends CommonController {
  
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
    
}
