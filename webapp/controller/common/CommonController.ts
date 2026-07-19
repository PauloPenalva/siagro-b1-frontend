import BaseController from "../BaseController";
import Input, { Input$ValueHelpRequestEvent } from "sap/m/Input";
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
import Dialog from "sap/m/Dialog";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { DocNumberInfo } from "siagrob1/types/DocNumberInfo";

/**
 * @namespace siagrob1.controller
 */
export default abstract class CommonController extends BaseController {

  api = { ...ServerRoutes }

  formatter = { ...formatter };

  reportDialog: Dialog;

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

  async getDocNumberInfoByTransaction(transaction: string): Promise<DocNumberInfo[]>{
    const oModel = this.getModel() as ODataModel;
    const func = oModel.bindContext("/DocNumberGetInfoByTransaction(...)");
    func.setParameter("Transaction", transaction);

    await func.invoke();
    const resultContext = func.getBoundContext();
    
    return resultContext.getObject() as DocNumberInfo[];
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

  async onOpenReportReportViewerDialog() {
    this.reportDialog ??= await DialogHelper.createDialog(this, "siagrob1.view.reports.fragments.ReportViewer");
    this.reportDialog?.open();
  }

  onCloseReportViewerDialog() {
    this.reportDialog?.close();
  }

  /**
   * Abre um value help e aplica a propriedade escolhida ao Input de origem.
   *
   * Cancelar resolve com `undefined`, e nesse caso o valor atual é preservado.
   *
   * Quando o Input declara `<core:CustomData key="descriptionProperty" .../>`, a
   * descrição correspondente também é gravada na entidade - assim o campo de nome
   * ao lado acompanha a troca sem precisar de um formatter que vai ao servidor.
   */
  private async applyValueHelp(
    ev: Input$ValueHelpRequestEvent,
    name: string,
    filters: string[],
    property: string,
    defaultFilters: Filter[] = []
  ) {
    const oContext = await DialogHelper.openTableSelectDialog(this, name, filters, defaultFilters);

    if (!oContext) {
      return;
    }

    const oInput = ev.getSource();
    oInput.setValue(oContext.getProperty(property) as string);

    await this.applyValueHelpDescription(oInput, oContext);
  }

  /**
   * Copia a descrição do registro selecionado para a entidade bound.
   *
   * A gravação usa `null` como group ID: a descrição é desnormalizada
   * (`CardName`) ou vem de uma propriedade de navegação (`QualityAttrib/Name`),
   * e em ambos os casos quem manda é o servidor - `null` impede que ela entre
   * no PATCH e mantém a tela coerente até a próxima leitura.
   *
   * O caminho declarado é relativo à linha; o último segmento é o nome da
   * propriedade no registro escolhido no diálogo. Assim `CardName` lê `CardName`
   * e `QualityAttrib/Name` lê `Name`.
   */
  private async applyValueHelpDescription(oInput: Input, oSelected: Context) {
    const sDescriptionPath = oInput.data("descriptionProperty") as string;

    if (!sDescriptionPath) {
      return;
    }

    const oTarget = oInput.getBindingContext();

    if (!oTarget?.isA("sap.ui.model.odata.v4.Context")) {
      return;
    }

    const sSourceProperty = sDescriptionPath.split("/").pop();

    await (oTarget as Context).setProperty(
      sDescriptionPath,
      oSelected.getProperty(sSourceProperty),
      null
    );
  }

  openProcessingCostsListValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "ProcessingCostsListSelectDialog", ['Code', 'Description'], "Code");
  }

  openTruckDriversValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "TruckDriversSelectDialog", ['Code', 'Name'], "Code");
  }

  openTrucksValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "TrucksSelectDialog", ['Code', 'Model'], "Code");
  }

  openBranchsValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "BranchsSelectDialog", ['Code', 'BranchName', 'ShortName', 'TaxId'], "Code");
  }

  openSalesContractsDocTypesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "SalesContractsDocTypesSelectDialog", ['Code', 'Name', 'Serie'], "Code");
  }

  openDocTypesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "DocTypesSelectDialog", ['Code', 'Name', 'Serie'], "Code");
  }

  openStatesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "StatesSelectDialog", ['Code', 'Name', 'Abbreviation'], "Code");
  }

  openAgentsValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "AgentsSelectDialog", ['Name'], "Code",
      [ new Filter("Inactive", FilterOperator.EQ, "N") ]);
  }

  openLogisticRegionsValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "LogisticRegionsSelectDialog", ['Code', 'Name'], "Code");
  }

  openBusinessPartnersValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "BusinessPartnersSelectDialog", ['CardCode', 'CardName', 'CardFName'], "CardCode");
  }

  openSuppliersValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "SuppliersSelectDialog", ['CardCode', 'CardName', 'CardFName'], "CardCode",
      [ new Filter("CardType", FilterOperator.EQ, 'S') ]);
  }

  openCostumersValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "CostumersSelectDialog", ['CardCode', 'CardName', 'CardFName'], "CardCode",
      [ new Filter("CardType", FilterOperator.EQ, 'C') ]);
  }

  openItemValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "ItemsSelectDialog", ["ItemCode", "ItemName"], "ItemCode");
  }

  openUnitsOfMeasureValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "UnitsOfMeasureSelectDialog", ["Code", "Description"], "Code",
      [ new Filter("Locked", FilterOperator.EQ, "N") ]);
  }

  openHarvestSeasonsValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "HarvestSeasonsSelectDialog", ["Code", "Name"], "Code");
  }

  openWarehouseValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"], "Code");
  }

  openTaxesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "TaxesSelectDialog", ["Code", "Name"], "Code");
  }

  openQualityAttribsValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "QualityAttribsSelectDialog", ["Code", "Name"], "Code");
  }

  openProcessingServicesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "ProcessingServicesSelectDialog", ["Code", "Description"], "Code");
  }

  openStorageAddressesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "StorageAddressesSelectDialog", ["Description"], "Code");
  }

  openMenuItemsValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "MenuItemsSelectDialog", ["Title", "Key"], "Key");
  }

  openPermissionsValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "PermissionsSelectDialog", ["Description", "Code"], "Code");
  }

  openRolesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "RolesSelectDialog", ["Description", "Code"], "Code");
  }

  openProfilesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "ProfilesSelectDialog", ["Description", "Code"], "Code");
  }

  async formatItemName(key: string){
    if (!key){
      return null;
    }
  
    const data = await this.getResource<Item>(`${this.api.items}('${key}')`)
    return data?.ItemName;
  }

   async formartCustomerFName(key: string){
      if (!key){
        return null;
      } 
  
      try {
        this.setBusy(true);
        const data = await this
          .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')`)
        
        return data?.CardFName;
      } finally {
        this.setBusy(false);
      }
  
    }

    async formartCustomerTaxId(key: string){
      if (!key){
        return null;
      } 
  
      try {
        this.setBusy(true);
        const data = await this
          .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')`)
        
        return data?.TaxId;
      } finally {
        this.setBusy(false);
      }
  
    }

    async formartCustomerCity(key: string){
      if (!key){
        return null;
      } 
  
      try {
        this.setBusy(true);
        const data = await this
          .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')?$expand=Addresses($filter=AdresType eq \'S\')`)
        
        return data?.Addresses[0]?.City
      } finally {
        this.setBusy(false);
      }
  
    }

     async formartCustomerState(key: string){
      if (!key){
        return null;
      } 
  
      try {
        this.setBusy(true);
        const data = await this
          .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')?$expand=Addresses($filter=AdresType eq \'S\')`)
        
        return data?.Addresses[0]?.State
      } finally {
        this.setBusy(false);
      }
  
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

  async formatParentMenuTitle(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.menuItems}('${key}')`)
      
      return data?.Title;
    } finally {
      this.setBusy(false);
    }
  }

  async formatPermissionName(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.permissions}('${key}')`)
      
      return data?.Description;
    } finally {
      this.setBusy(false);
    }
  }

  async formatRoleDescription(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.roles}('${key}')`)
      
      return data?.Description;
    } finally {
      this.setBusy(false);
    }
  }

  async formatProfileDescription(key: string){
    if (!key){
      return null;
    } 

    try {
      this.setBusy(true);
      const data = await this
        .getResource<any>(`${this.api.profiles}('${key}')`)
      
      return data?.Description;
    } finally {
      this.setBusy(false);
    }
  }

} 
