
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import BaseController from "./PurchaseContractsBaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";

type FilterData = {
  Code?: string,
  CardCode?: string,
  ItemCode?: string,
  Status?: string,
  Type?:string,
  DocTypeCode?: string,
  Complement?: string,
  MarketType?: string,
  AgentCode?: string,
}

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default class Main extends BaseController {

  formatter = formatter;

  /** `$filter` corrente da filterbar, reaproveitado pelo binding do export. */
  private currentFilter: string;

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("purchaseContracts")
      .attachPatternMatched(() => this.applyFilters());
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

	onSearch(): void {
    this.applyFilters()
	}

  private applyFilters() {
    const oBinding = this.getView().byId("tablePurchaseContracts").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as FilterData;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key as keyof FilterData;
      const value = filterData[filterKey];

      if (!value) return;

      if (filterKey == "Status" || filterKey == "Type" || filterKey == "MarketType") {
        filters.push(`${filterKey} eq '${value}'`)
      } else if (filterKey == "AgentCode") {
        // Edm.Int32: só dígitos. Number() aceitaria "1e3"/"0x10"/" " e filtraria
        // o agente errado ou zeraria a lista em vez de ignorar o valor inválido.
        if (/^\d+$/.test(value.trim())) filters.push(`AgentCode eq ${Number(value)}`)
      } else {
        filters.push(`contains(${filterKey},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    this.currentFilter = filterParam;

		oBinding.changeParameters({
      $filter: filterParam
    });
  }

  onCreate() {
		this.navTo("purchaseContractsNew");
	}

	onDetail(): void {
		const oTable = this.byId("tablePurchaseContracts") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("purchaseContractsDetail", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tablePurchaseContracts") as Table;
		
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    const oBindingContext = oTable.getContextByIndex(i) as Context;
 
		if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
			try{
				this.setBusy(true)
	
				await oBindingContext.delete("$auto");
	
				await oModel.submitBatch(oModel.getUpdateGroupId())
					
				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					//MessageBox.information("Registro deletado.")
				}
			} finally {
				this.setBusy(false)
			}
		}

	}

  async onCopy() {
    const oTable = this.byId("tablePurchaseContracts") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    
    const oBindingContext = oTable.getContextByIndex(i) as Context;
    const bConfirm = await confirmDialog("Copiar contrato ?");
    if (bConfirm) {
    
      const key = oBindingContext.getProperty("Key") as string;
      const sUrl = `${this.api.purchaseContractsCopy}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () =>  { 
          this.setBusy(false);
          this.refreshData();
        },
        error: err => {
          this.setBusy(false);
          MessageBox.error(err.responseText);
        },
      })
      .done(() => this.setBusy(false))
    }
  }

  private refreshData() {
    const oTable = this.byId("tablePurchaseContracts") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }

  private createColumnConfig() {
    const aCols: Column[] = [];

    aCols.push({
      label: "Filial",
      property: "Branch/ShortName",
      type: EdmType.String,
    });

    aCols.push({
      label: "Status",
      property: "Status",
      type: EdmType.Enumeration,
      valueMap: {
        "Draft": "Rascunho",
        "InApproval": "Em Aprovação",
        "Approved": "Aprovado",
        "Finished": "Finalizado",
        "Rejected": "Rejeitado",
        "Canceled": "Cancelado",
      }
    });

    aCols.push({
      label: "Codigo",
      property: "Code",
      type: EdmType.String,
    });

    aCols.push({
      label: "Tipo de Contrato",
      property: "Type",
      type: EdmType.Enumeration,
      valueMap: {
        "Fixed": "FIX - Preço Fixo",
        "ToBeDetermined": "PAF - Preço a Fixar",
      }
    });

    aCols.push({
      label: "Complemento",
      property: "Complement",
      type: EdmType.String,
    });

    aCols.push({
      label: "Emissão",
      property: "CreationDate",
      type: EdmType.Date,
    });

    aCols.push({
      label: "Inicio Entrega",
      property: "DeliveryStartDate",
      type: EdmType.Date,
    });

    aCols.push({
      label: "Termino Entrega",
      property: "DeliveryEndDate",
      type: EdmType.Date,
    });

    aCols.push({
      label: "Cod.Fornecedor",
      property: "CardCode",
      type: EdmType.String,
    });

    aCols.push({
      label: "Fornecedor",
      property: "CardName",
      type: EdmType.String,
    });

    aCols.push({
      label: "Comprador",
      property: "AgentName",
      type: EdmType.String,
    });

    aCols.push({
      label: "Cod.Produto",
      property: "ItemCode",
      type: EdmType.String,
    });

    aCols.push({
      label: "Produto",
      property: "ItemName",
      type: EdmType.String,
    });

    aCols.push({
      label: "Tipo Mercado",
      property: "MarketType",
      type: EdmType.Enumeration,
      valueMap: {
        "Internal": "Interno",
        "External": "Exportação",
      }
    });

    aCols.push({
      label: "Quantidade",
      property: "TotalVolume",
      type: EdmType.Number,
      scale: 3,
      delimiter: true
    });

    aCols.push({
      label: "Saldo (Físico)",
      property: "AvaiableVolume",
      type: EdmType.Number,
      scale: 3,
      delimiter: true
    });

    aCols.push({
      label: "Un.Med.",
      property: "UnitOfMeasureCode",
      type: EdmType.String,
    });

    return aCols;
  }

  async onExcel() {
    const cols = this.createColumnConfig();

    const setting: SpreadsheetSettings = {
      dataSource: await this.createExportBinding("/PurchaseContracts", cols, "Code", this.currentFilter),
      fileName: 'Contratos de Compra.xlsx',
      workbook: {
        columns: cols,
        hierarchyLevel: "Level",
        context: {
          sheetName: 'Contratos de Compra'
        }
      }
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function() {
      oSheet.destroy();
    });
  }

}
