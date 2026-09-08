
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace siagrob1.controller.storageTransactions
 */
export default class Main extends CommonController {

	onInit(): void  {
    this.createFilterModel();
    this.getRouter().getRoute("storageTransactions")
    .attachPatternMatched(() => this.applyFilters())
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters()
	}

  private applyFilters() {
    const oBinding = this.getView().byId("storageTransactionsTable").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as Record<string, string>;
    const filters: string[] = [];

    // O tipo escolhido pelo usuário É o escopo. Duas correções aqui:
    //
    // 1. O termo fixo precisa de PARÊNTESES. Os filtros são unidos por ` and `, e em OData o
    //    `and` tem precedência sobre o `or` — sem eles a expressão virava
    //    `Receipt or Shipment or (TechnicalLoss and <filtro do usuário>)`, e o filtro "Tipo"
    //    era silenciosamente ignorado para Entrada e Saída.
    // 2. `SalesShipmentReturn` entrou na lista. O Filterbar já oferecia "Dev.Venda", mas o
    //    escopo antigo a tornava inalcançável e a grid voltava sempre vazia — era por isso que
    //    a devolução ao armazém não aparecia em tela nenhuma.
    //
    // Purchase/SalesShipment ficam de fora de propósito: têm telas próprias, com ações mais
    // restritas que as desta.
    filters.push(
      filterData.TransactionType
        ? `TransactionType eq '${filterData.TransactionType}'`
        : `(TransactionType eq 'Receipt' or TransactionType eq 'Shipment' ` +
          `or TransactionType eq 'TechnicalLoss' or TransactionType eq 'SalesShipmentReturn')`
    );
    
    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];

      if (!value) return;

      // Já virou o escopo acima; repetir aqui só duplicaria a condição.
      if (key == "TransactionType") return;

      if (key == "TransactionStatus") {
        filters.push(`${key} eq '${value}'`)
      } else if (key == "DateFrom") {
        filters.push(`TransactionDate ge ${value}`)
      } else if (key == "DateTo") {
        filters.push(`TransactionDate le ${value}`)
      } else {
        filters.push(`contains(${key},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({
      $filter: filterParam
    });
  }

  onCreate() {
		this.navTo("storageTransactionsNew");
	}

	onDetail(): void {
		const oTable = this.byId("storageTransactionsTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("storageTransactionsDetail", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("storageTransactionsTable") as Table;
		
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
    const oTable = this.byId("storageTransactionsTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    
    const oBindingContext = oTable.getContextByIndex(i) as Context;
    const bConfirm = await confirmDialog("Copiar Romaneio ?");
    if (bConfirm) {
    
      const key = oBindingContext.getProperty("Key") as string;
      const model = this.getModel() as ODataModel;

      const action = model.bindContext(this.api.storageTransactionCopy)
      action.setParameter("Key", key);

      this.setBusy(true);
      void action.invoke()
        .then(() => this.refreshData())
        .finally(() => this.setBusy(false));
    }
  }

  private refreshData() {
    const oTable = this.byId("storageTransactionsTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
   
}
