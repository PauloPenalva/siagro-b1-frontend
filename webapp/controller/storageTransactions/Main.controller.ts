
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CommonController from "../common/CommonController";
import { anyOfFilter } from "siagrob1/helpers/FilterHelpers";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";

/**
 * @namespace siagrob1.controller.storageTransactions
 */
export default class Main extends CommonController {

	onInit(): void  {
    this.createFilterModel({ TransactionStatus: [] });
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
    // Status é de múltipla seleção (array): entra como um grupo de `or`, fora do laço dos demais campos.
    const filters: string[] = [
      anyOfFilter("TransactionStatus", filterModel.getProperty("/TransactionStatus") as string[]),
    ].filter(Boolean);

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
    // restritas que as desta. PurchaseDischargeLoss/PurchaseDischargeGain (quebra/sobra de
    // descarga da troca nota) também ficam fora: têm a tela própria "Ajustes de Descarga"
    // e aparecem aqui só ao filtrar pelo Tipo.
    //
    // 3. WarehouseLoss/WarehouseGain (Conferência de Saldo de Armazém, GAC-1164) entram no escopo
    //    para CONSULTA. Cancelar/estornar por esta tela é recusado pelo backend (origem 13).
    filters.push(
      filterData.TransactionType
        ? `TransactionType eq '${filterData.TransactionType}'`
        : `(TransactionType eq 'Receipt' or TransactionType eq 'Shipment' ` +
          `or TransactionType eq 'TechnicalLoss' or TransactionType eq 'SalesShipmentReturn' ` +
          `or TransactionType eq 'WarehouseLoss' or TransactionType eq 'WarehouseGain')`
    );
    
    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];

      if (!value) return;

      // Tipo e Status já viraram condição acima; repetir aqui só duplicaria.
      if (key == "TransactionType" || key == "TransactionStatus") return;

      if (key == "DateFrom") {
        filters.push(`TransactionDate ge ${value}`)
      } else if (key == "DateTo") {
        filters.push(`TransactionDate le ${value}`)
      } else if (key == "StorageAddressCode") {
        // Lote é código exato: `contains` com "44" traria também o 144, o 440...
        filters.push(`StorageAddressCode eq '${value}'`)
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
 
   
  private createColumnConfig(): Column[] {
    const weight = (label: string, property: string): Column =>
      ({ label, property, type: EdmType.Number, scale: 3, delimiter: true });

    return [
      { label: "Filial", property: "Branch/ShortName", type: EdmType.String },
      {
        label: "Status", property: "TransactionStatus", type: EdmType.Enumeration,
        valueMap: {
          Pending: "Pendente", Confirmed: "Confirmado", Cancelled: "Cancelado",
          Invoiced: "Faturado", Returned: "Devolvido",
        },
      },
      { label: "Codigo", property: "Code", type: EdmType.String },
      {
        label: "Tipo", property: "TransactionType", type: EdmType.Enumeration,
        valueMap: {
          Receipt: "Entrada", Shipment: "Saída", TechnicalLoss: "Quebra Técnica",
          SalesShipment: "Venda", SalesShipmentReturn: "Dev.Venda", Purchase: "Compra",
          PurchaseReturn: "Dev.Compra", PurchaseQtyComplement: "Compl.Qtd.",
          PurchasePriceComplement: "Compl.Preço", WarehouseLoss: "Perda Armazém",
          WarehouseGain: "Sobra Armazém", TransshipmentReceipt: "Entrada em Transbordo",
          PurchaseDischargeLoss: "Quebra Descarga", PurchaseDischargeGain: "Sobra Descarga",
        },
      },
      { label: "Emissão", property: "TransactionDate", type: EdmType.Date },
      { label: "Veículo", property: "TruckCode", type: EdmType.String },
      { label: "Documento", property: "InvoiceNumber", type: EdmType.String },
      { label: "Lote", property: "StorageAddressCode", type: EdmType.String },
      weight("Qtd.Documento", "InvoiceQty"),
      weight("Peso Bruto", "GrossWeight"),
      weight("Peso Liquido", "NetWeight"),
      { label: "UM", property: "UnitOfMeasureCode", type: EdmType.String },
      { label: "Armazem", property: "WarehouseCode", type: EdmType.String },
      { label: "Cli/For", property: "CardCode", type: EdmType.String },
      { label: "Nome", property: "CardName", type: EdmType.String },
      { label: "Cod.Produto", property: "ItemCode", type: EdmType.String },
      { label: "Produto", property: "ItemName", type: EdmType.String },
      { label: "Chave NF-e", property: "ChaveNFe", type: EdmType.String },
    ];
  }

  /** O botão "Exportar Excel" já existia na tela, mas sem este método o clique não fazia nada. */
  onExcel(): void {
    const table = this.byId("storageTransactionsTable") as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Romaneios de Movimentação.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        context: { sheetName: "Romaneios" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(() => oSheet.destroy());
  }
}
