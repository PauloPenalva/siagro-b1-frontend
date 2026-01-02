
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageToast from "sap/m/MessageToast";

/**
 * @namespace siagrob1.controller.shipmentReleases
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("shipmentReleases")
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
    const oBinding = this.getView().byId("tableShipmentReleases").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as any;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key;
      const value = filterData[filterKey];

      if (!value) return;

      if (filterKey == "Status") {
        filters.push(`${filterKey} eq '${value}'`)
      } else if (filterKey == "MarketType") {
        filters.push(`PurchaseContract/MarketType eq '${value}'`)
      } else if (filterKey == "ReleaseDateFrom"){
        filters.push(`ReleaseDate ge ${value}`)
      } else if (filterKey == "ReleaseDateTo"){
        filters.push(`ReleaseDate le ${value}`)
      } else if (filterKey == "DeliveryEndDateFrom"){
        filters.push(`PurchaseContract/DeliveryEndDate ge ${value}`)
      } else if (filterKey == "DeliveryEndDateTo"){
        filters.push(`PurchaseContract/DeliveryEndDate le ${value}`)
      } else if (filterKey == "StandardCashFlowDateFrom"){
        filters.push(`PurchaseContract/StandardCashFlowDate ge ${value}`)
      } else if (filterKey == "StandardCashFlowDateTo"){
        filters.push(`PurchaseContract/StandardCashFlowDate le ${value}`)
      } else if (filterKey == "Code"){
        filters.push(`contains(PurchaseContract/Code,'${value}')`)
      } else if (filterKey == "CardCode"){
        filters.push(`contains(PurchaseContract/CardCode,'${value}')`)
      } else if (filterKey == "ItemCode"){
        filters.push(`contains(PurchaseContract/ItemCode,'${value}')`)
      } else {
        filters.push(`contains(${filterKey},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

		oBinding.changeParameters({
      $filter: filterParam
    });
  }

  async onActivate() {
    const oTable = this.byId("tableShipmentReleases") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (oContext) {
      const sId = oContext.getProperty("Key") as string;

      if (await DialogHelper.confirmDialog("Ativar entrega ?")) {
        const model = this.getModel() as ODataModel;
        const action = model.bindContext("/ShipmentReleasesApprovation(...)")
        action.setParameter("Key", sId);

        this.setBusy(true);
        void action.invoke()
          .then(() => {
            MessageToast.show("Liberação ativada com sucesso.")
            this.refreshData();
          })
          .finally(() => this.setBusy(false));

      }
      return;
    }

    MessageBox.warning("Selecione um registro.");
  }

  async onCancel() {
    const oTable = this.byId("tableShipmentReleases") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (oContext) {
      const sId = oContext.getProperty("Key") as string;

      if (await DialogHelper.confirmDialog("Cancelar entrega ?")) {
        const model = this.getModel() as ODataModel;
        const action = model.bindContext("/ShipmentReleasesCancelation(...)")
        action.setParameter("Key", sId);

        this.setBusy(true);
        void action.invoke()
          .then(() => {
            MessageToast.show("Liberação cancelada com sucesso.")
            this.refreshData();
          })
          .finally(() => this.setBusy(false));

      }
      return;
    }

    MessageBox.warning("Selecione um registro.");
  }


	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableShipmentReleases") as Table;
		
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

  private refreshData() {
    const oTable = this.byId("tableShipmentReleases") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
}
