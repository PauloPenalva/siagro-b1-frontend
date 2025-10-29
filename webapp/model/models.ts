import JSONModel from "sap/ui/model/json/JSONModel";
import BindingMode from "sap/ui/model/BindingMode";

import Device from "sap/ui/Device";
import Control from "sap/ui/core/Control";
import MessageBox from "sap/m/MessageBox";


export default {
	createDeviceModel: () => {
		const oModel = new JSONModel(Device);
		oModel.setDefaultBindingMode(BindingMode.OneWay);
		return oModel;
	},

  requestModel: async (
      sUrl: string, 
      oControl?: Control, 
      oParameters?: Record<string, object>, 
      sType?: string,  
      mHeaders?: Record<string, object>
    ): Promise<Record<string, object>> => {
    const oModel = new JSONModel();
    try {
      oModel.attachRequestSent(() => oControl?.setBusy(true));
      oModel.attachRequestCompleted(() => oControl?.setBusy(false));
      oModel.attachRequestFailed(() => oControl?.setBusy(false));
      await oModel.loadData(sUrl, oParameters, true, sType, false, true, mHeaders);
      
      const oRecord = <Record<string, object>> JSON.parse(oModel.getJSON());
      
      oModel.destroy();

      return oRecord;
    } catch(err) {
      const error = err as JQueryXHR
      MessageBox.error(error.responseText);
    }
  }
};
