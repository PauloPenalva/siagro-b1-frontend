/* eslint-disable @typescript-eslint/no-explicit-any */
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import NavContainer, { NavContainer$NavigationFinishedEvent } from "sap/m/NavContainer";
import { Button$PressEvent } from "sap/m/Button";
import ObjectPageLayout from "sap/uxap/ObjectPageLayout";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/m/Table";
import MessageBox from "sap/m/MessageBox";

type routeArgs = {
  "?query": { 
    itemCode: string 
  }
}

/**
 * @namespace siagrob1.controller.ownershipTransfers
 */
export default class Add extends BaseController {

	onInit(): void  {
    this.createFilterModel();
    
    this.getView().setModel(new JSONModel(), "balance");
    this.getView().setModel(new JSONModel(), "destination");
    
		this.getRouter().getRoute("ownershipTransfersNew").attachPatternMatched((ev) => this.newRouteMatched(ev));
	}

  private newRouteMatched(ev: Route$PatternMatchedEvent) {
    const navCon = this.byId("navCon") as NavContainer;
    navCon.to(this.byId("ownershipTransferOriginPage") as ObjectPageLayout);

    const args = ev.getParameter("arguments") as routeArgs;
    
    const query = args["?query"];
    if (query) {
      const key = query?.itemCode;
      const filterModel = this.getModel("filter") as JSONModel;
      filterModel.setData({ItemCode: key});
      
      if (key) {
        this.getStorageAddressesBalance(key)	
      }

      return;
    }

    const viewModel = this.getModel("balance") as JSONModel
    viewModel.setData([]);
  }
  
  
  onNavigationFinished(evt: NavContainer$NavigationFinishedEvent) {
    const fullPageId = evt.getParameter("toId");
    const pageId = fullPageId.split("--")[2];

    switch(pageId){
      case "ownershipTransferOriginPage":
        this.onSearch();
        break;
      case "ownershipTransferDestinationPage":
        this.getDestinationData();
        break;
      case "ownershipTransferConfirmPage":
        this.newOwnershipTransfer();
        break;
      default:
        break;
    }
	}

  newOwnershipTransfer() {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    
		this.resetChanges();

    this.clearStates("ownershipTransferForm");

    const originTable = this.byId("tableStorageAddressesBalance") as Table;
    const destinationTable = this.byId("tableStorageAddressesDestination") as Table;
    const originCtx = originTable.getSelectedItem()?.getBindingContext("balance")
    const destinationCtx = destinationTable.getSelectedItem()?.getBindingContext("destination")

     if (!destinationCtx) {
      this.navBack();
      MessageToast.show("Selecione um item na tabela.");
      
      return;
    }

    const itemCode = originCtx.getProperty("ItemCode") as string;
    const originCode = originCtx.getProperty("Code") as string;
    const destinationCode = destinationCtx.getProperty("Code") as string;

    const oView = this.getView();
		const oModel = this.getView().getModel() as ODataModel;
		const oBinding = oModel.bindList("/OwnershipTransfers")

    this.setBusy(true);
    this.getDocNumberInfoByTransaction("OwnershipTransfer")
      .then(results => {

        const docNumberInfo = results.filter(x => x.Default)[0];

        const oContext = oBinding.create({
          "TransferStatus": "Open",
          "Quantity": 0,
          "StorageAddressOriginCode": originCode,
          "StorageAddressDestinationCode": destinationCode,
          "ItemCode": itemCode,
          "UomCode": "KG",
          "DocNumberKey": docNumberInfo.Key,
        }, false, false, false);

        oView.setBindingContext(oContext);
      })
      .finally(() => this.setBusy(false))
  }

  private getDestinationData(){
    const viewModel = this.getModel("destination") as JSONModel
    viewModel.setData([]);

    const originTable = this.byId("tableStorageAddressesBalance") as Table;
    const ctx = originTable.getSelectedItem()?.getBindingContext("balance")

    if (!ctx) {
      this.navBack();
      MessageToast.show("Selecione um item na tabela.");
      
      return;
    }

    const ignoreCode = ctx.getProperty("Code") as string;
    const itemCode = ctx.getProperty("ItemCode") as string;

    this.getStorageAddressesBalance(itemCode, ignoreCode, "destination");
  }

  handleNav(evt: Button$PressEvent) {
    const navCon = this.byId("navCon") as NavContainer;
    const target = evt.getSource().data("target");
    if (target) {
      navCon.to(this.byId(target) as ObjectPageLayout);
    } else {
      navCon.back();
    }
  }

  navBack(): void {
    const navCon = this.byId("navCon") as NavContainer;
    navCon.back();
  }

  async onSearch() {
    
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as { ItemCode: string };

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key as keyof { ItemCode: string };
      const value = filterData[filterKey];

      if (!value) return;

      this.getStorageAddressesBalance(value);
    });
  }

  private async getStorageAddressesBalance(itemCode: string, ignoreCode: string = "", modelName: string = "balance" ) {
      const model = this.getModel() as ODataModel;
      const func = model.bindContext("/OwnershipTransfersListStorageAddressesBalanceByProduct(...)");
      func.setParameter("ItemCode", itemCode);
      func.setParameter("IgnoreCode", ignoreCode);
  
      this.setBusy(true);
      
      await func.invoke();
      const resultContext = func.getBoundContext();
      const viewModel = this.getModel(modelName) as JSONModel
      viewModel.setData(resultContext.getObject() as object);
  
      this.setBusy(false);   
    }
   
  async onSave() {
    if (!this.validateForm("ownershipTransferForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				this.navToDetail();
			}
		} finally {
			this.setBusy(false);
		}
	}

  private resetChanges(){
    const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}
  }

	onCancel() {
    this.resetChanges();
    this.onNavBack();
	}

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("ownershipTransfersDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
