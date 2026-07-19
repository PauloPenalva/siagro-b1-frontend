import JSONModel from "sap/ui/model/json/JSONModel";
import * as jQuery from "jquery";

export default class RequestModel extends JSONModel{
  
  constructor(oContent?: object){
    super();
    if (oContent) {
      this.setData(oContent)
    }
  }

  request(
    serverUrl: string,
    typeProtocol: string,
    oData: object | string,
    contType = "application/json",
    typeData = "json",
    asyncRequest = true,
    aCache = false,
    aProcessDate = false
  ) {
      return jQuery.ajax(serverUrl, {
          type: typeProtocol,
          data: oData,
          contentType: contType,
          dataType: typeData,
          async: asyncRequest,
          cache: aCache,
          processData: aProcessDate,
      });
  }

  /**
   * O default é `unknown` de propósito: obriga quem chama a declarar o formato
   * esperado, em vez de espalhar `any` pelo código.
   */
  get<T = unknown>(serverUrl: string) {
    return jQuery.get(serverUrl) as JQuery.jqXHR<T>;
  }

  post(serverUrl: string, oDataBody?: object | string) {
    const dataModel = oDataBody ? JSON.stringify(oDataBody) : this.getJSON();
    return this.request(serverUrl, "POST", dataModel);
  }

  put(serverUrl: string, typeData = "json") {
    const dataModel = JSON.stringify(this.getData());
    return this.request(serverUrl, "PUT", dataModel, "application/json", typeData);
  }

  delete(serverUrl:string, typeData = "json") {
    const dataModel = JSON.stringify(this.getData());
    return this.request(serverUrl, "DELETE", dataModel, "application/json", typeData);
  }

  patch(serverUrl:string) {
    const dataModel = this.getJSON();
    return this.request(serverUrl, "PATCH", dataModel);
  }

  formData(serverUrl:string, formData: FormData) {
    return this.request(serverUrl, "POST", formData);
  }

  getPromise(serverUrl: string) {
    return new Promise((resolve, reject) => {
        this.get(serverUrl)
            .done(resolve)
            .fail(reject);
    });
  }

}
