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
import { BusinessPartner } from "siagrob1/types/BusinessPartner";
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
   * O caminho declarado é relativo à linha. Por padrão a origem no diálogo é o
   * **último segmento** do caminho: `CardName` lê `CardName` e `QualityAttrib/Name`
   * lê `Name`.
   *
   * Quando o nome da coluna de destino difere do nome no registro escolhido,
   * declare a origem depois de `:` — `destino:origem`. É o caso das colunas que
   * renomeiam o campo: `AgentName:Name` grava em `AgentName` lendo `Name` do
   * `Agent`, e `DeliveryLocationName:Name` faz o mesmo a partir do `Warehouse`.
   * Sem isso a leitura devolve `undefined` e o campo fica em branco em registro
   * novo (não há valor do servidor para mascarar o erro).
   *
   * Aceita mais de um caminho separado por vírgula (`Tax/Name,Tax/Rate`), para
   * quando a mesma escolha alimenta várias colunas da tela.
   *
   * Telas montadas sobre JSON model (o Input do código binda algo como
   * `viewModel>/StorageTransaction/WarehouseCode`) não têm contexto OData; nesse
   * caso a gravação vai para o **irmão** do caminho do código no mesmo model —
   * a mesma ideia do caso OData, onde o caminho é relativo à linha.
   */
  private async applyValueHelpDescription(oInput: Input, oSelected: Context) {
    const sDescriptionPaths = oInput.data("descriptionProperty") as string;

    if (!sDescriptionPaths) {
      return;
    }

    const oTarget = oInput.getBindingContext();

    if (!oTarget?.isA("sap.ui.model.odata.v4.Context")) {
      this.applyValueHelpDescriptionToJsonModel(oInput, oSelected, sDescriptionPaths);
      return;
    }

    await Promise.all(
      sDescriptionPaths
        .split(",")
        .map((sEntry) => sEntry.trim())
        .filter(Boolean)
        .map((sEntry) => {
          const [sPath, sSource] = sEntry.split(":").map((s) => s.trim());
          const sSourceProperty = sSource || sPath.split("/").pop();

          return (oTarget as Context).setProperty(
            sPath,
            oSelected.getProperty(sSourceProperty),
            null
          );
        })
    );
  }

  /**
   * Variante para telas em JSON model, onde não há contexto OData.
   *
   * O caminho do Input do código é absoluto (`/StorageTransaction/WarehouseCode`);
   * a descrição é gravada no irmão dele (`/StorageTransaction/WarehouseName`).
   */
  private applyValueHelpDescriptionToJsonModel(
    oInput: Input,
    oSelected: Context,
    sDescriptionPaths: string
  ) {
    const oValueBinding = oInput.getBinding("value");
    const oModel = oValueBinding?.getModel() as JSONModel;

    if (!oModel?.isA("sap.ui.model.json.JSONModel")) {
      return;
    }

    const sCodePath = oValueBinding.getPath();
    const sParentPath = sCodePath.slice(0, sCodePath.lastIndexOf("/"));

    sDescriptionPaths
      .split(",")
      .map((sEntry) => sEntry.trim())
      .filter(Boolean)
      .forEach((sEntry) => {
        const [sPath, sSource] = sEntry.split(":").map((s) => s.trim());
        const sSourceProperty = sSource || sPath.split("/").pop();

        oModel.setProperty(
          `${sParentPath}/${sPath}`,
          oSelected.getProperty(sSourceProperty)
        );
      });
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
          .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')?$expand=Addresses($filter=AdresType eq 'S')`)
        
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
          .getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')?$expand=Addresses($filter=AdresType eq 'S')`)
        
        return data?.Addresses[0]?.State
      } finally {
        this.setBusy(false);
      }
  
    }

} 
