import * as $ from 'jquery';
import { TruckDriver } from "siagrob1/types/TruckDriver";
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
import CommonController from "../common/CommonController";
import Fragment from 'sap/ui/core/Fragment';
import TableSelectDialog from 'sap/m/TableSelectDialog';
import Device from 'sap/ui/Device';
import Context from 'sap/ui/model/odata/v4/Context';
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import ODataListBinding from 'sap/ui/model/odata/v4/ODataListBinding';
import { Input$ValueHelpRequestEvent } from 'sap/m/Input';
import { QualityAttrib } from 'siagrob1/types/QualityAttrib';
import Table from 'sap/ui/table/Table';
import ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import MessageBox from 'sap/m/MessageBox';
import DialogHelper from 'siagrob1/dialogs/DialogHelper';
import MessageToast from 'sap/m/MessageToast';

/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class GenericController extends CommonController {
  
  storageAddressesSelectDialog: TableSelectDialog;
  
  async onCancel() {
     if(!await DialogHelper.confirmDialog("Confirma cancelar ticket ?"))
      return;

    const context = this.getView().getBindingContext();
    if (context) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/WeighingTicketsCancel(...)");
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio criado com sucesso.");
          this.navToTicketsList();
        })
        .finally(() => this.setBusy(false));
    }
  }
  
  navToTicketsList() {
    this.navTo("weighingTickets");
  }

  onNavToTicketList(){
    const oModel = this.getView().getModel() as ODataModel;
    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

    this.navToTicketsList();
  }

  onAddQualityInspection() {
    const oTable = this.byId(
      "weighingTicketQualityInspectionTable"
    ) as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveQualityInspection() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId(
      "weighingTicketQualityInspectionTable"
    ) as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }
  
  async openStorageAddressesValueHelp(e: Input$ValueHelpRequestEvent) {
    this.storageAddressesSelectDialog ??= await Fragment.load({
      name: 'siagrob1.dialogs.fragments.StorageAddressesSelectDialog',
      controller: this,
      id: this.getView().getId(),
    }) as TableSelectDialog;
  
    if (Device.system.desktop) {
      this.storageAddressesSelectDialog.addStyleClass("sapUiSizeCompact");
    }

    if (this.getView().indexOfDependent(this.storageAddressesSelectDialog) < 0){
      this.getView().addDependent(this.storageAddressesSelectDialog);
    }

    this.storageAddressesSelectDialog.attachConfirm(ev => {
        const oContext = ev
                  .getParameter("selectedItem")
                  .getBindingContext() as Context;
      
        e.getSource().setValue((oContext.getProperty("Code")));
    });
    this.storageAddressesSelectDialog.attachSearch(ev => {
        const value = ev.getParameter("value");
        const aFilters: Filter[] = [];
        
        aFilters.push(new Filter('Description', FilterOperator.Contains, value))
        

        const oFilters = new Filter({
          filters: aFilters,
          and: false,
        });
        
        (ev.getSource().getBinding("items") as ODataListBinding).filter(oFilters);
      });  
  
      this.storageAddressesSelectDialog.open("");
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
        success: ((data: BusinessPartner) => resolve(data.CardName)),
        error: (err => reject(new Error(err.responseText)))
      });
    });
  }

  async formatProcessingCostDescription(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.processingCosts}('${key}')`)
      
      return data?.Description;
    } finally {
      this.setBusy(false);
    }

  }

   async formatStorageAddressDescription(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.storageAddresses}('${key}')`)
      
      return data?.Description;
    } finally {
      this.setBusy(false);
    }

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
