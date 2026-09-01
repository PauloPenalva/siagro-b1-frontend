import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import JSONModel from "sap/ui/model/json/JSONModel";
import TableSelectDialog, { TableSelectDialog$ConfirmEvent } from "sap/m/TableSelectDialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import RequestModel from "siagrob1/model/RequestModel";


/**
 * @namespace siagrob1.controller.ownershipTransfers
 */
export abstract class BaseController extends CommonController {
  private _dialog: TableSelectDialog;

  /**
   * Só o lote de destino classificado como estoque próprio em nosso poder habilita
   * o vínculo de contrato de compra. Aceita o índice numérico (o assistente lê os
   * lotes de um JSON model alimentado por DTO) e o nome do enum (binding OData).
   */
  protected isOwnStockLot(ownershipType: string | number): boolean {
    return ownershipType === "OwnedInOurCustody" || ownershipType === 0;
  }

  /**
   * Liga/desliga o campo de contrato e explica o porquê quando desligado — sem a
   * mensagem, um campo cinza sem motivo aparente vira chamado de suporte.
   */
  protected setContractEnabled(enabled: boolean) {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/contractEnabled", enabled);
    uiModel.setProperty(
      "/contractHint",
      enabled
        ? ""
        : "Disponível apenas quando o lote de destino é estoque próprio em nosso poder."
    );
  }

  /**
   * Códigos dos armazéns marcados como próprios no complemento cadastral, que é
   * quem restringe os contratos ofertados no value help.
   *
   * Lido uma vez por sessão da tela: é cadastro, não muda entre duas aberturas do
   * diálogo, e a chamada extra atrasaria o clique do usuário.
   */
  private _ownWarehouseCodes: string[];

  private async getOwnWarehouseCodes(): Promise<string[]> {
    if (this._ownWarehouseCodes) {
      return this._ownWarehouseCodes;
    }

    const oModel = this.getModel() as ODataModel;
    const func = oModel.bindContext(this.api.warehousesGetOwnComplements);

    await func.invoke();

    // Função que devolve coleção: o objeto do contexto é o envelope `{ value: [...] }`.
    const result = func.getBoundContext().getObject() as
      { value?: { WarehouseCode: string }[] };

    this._ownWarehouseCodes = (result?.value ?? []).map((x) => x.WarehouseCode);

    return this._ownWarehouseCodes;
  }

  /**
   * Value help do contrato de compra.
   *
   * Não usa o `applyValueHelp` genérico porque o campo tem duas colunas: o Input
   * mostra `PurchaseContractCode` (legível) mas quem vale para o servidor é
   * `PurchaseContractKey` (GUID). O helper genérico grava a descrição com group
   * id `null` de propósito — bom para descrição desnormalizada, mas a CHAVE
   * precisa entrar no batch, então ela é gravada aqui no update group padrão.
   *
   * Os filtros são aplicados na abertura, e não no XML, porque dependem da
   * transferência (o produto só é conhecido depois que os lotes são escolhidos) e
   * do cadastro (a lista de armazéns próprios vem do servidor).
   *
   * Quem qualifica o contrato é o ARMAZÉM PRÓPRIO, não o lote: a lista traz os
   * contratos cujo local de entrega é um armazém com `IsOwn` no complemento
   * cadastral, de qualquer armazém próprio — não só o do lote de origem. Mesmo
   * critério do guard de confirmação, que olha o complemento do armazém.
   *
   * A busca do diálogo é por número do contrato, código ou nome do fornecedor.
   */
  async openPurchaseContractValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oInput = ev.getSource();
    const oTarget = oInput.getBindingContext() as Context;

    if (!oTarget) {
      return;
    }

    const sItemCode = oTarget.getProperty("ItemCode") as string;

    if (!sItemCode) {
      MessageBox.warning("Selecione o produto.");
      return;
    }

    const aOwnWarehouses = await this.getOwnWarehouseCodes();

    // Falha fechada, mesma convenção do cadastro e do guard de confirmação: sem
    // armazém próprio não existe contrato elegível, então não abre o diálogo — uma
    // lista vazia deixaria o usuário procurando o filtro errado.
    if (aOwnWarehouses.length === 0) {
      MessageBox.warning(
        "Nenhum armazém está marcado como próprio no complemento cadastral. " +
        "Configure em Armazéns > Complemento antes de vincular um contrato."
      );
      return;
    }

    const oSelected = await DialogHelper.openTableSelectDialog(
      this,
      "PurchaseContractsSelectDialog",
      ["Code", "CardCode", "CardName", "DeliveryLocationName"],
      [
        new Filter("ItemCode", FilterOperator.EQ, sItemCode),
        // Local de entrega do contrato = um armazém próprio. Ambos são código de
        // parceiro-armazém, mesmo domínio.
        new Filter({
          filters: aOwnWarehouses.map(
            (code) => new Filter("DeliveryLocationCode", FilterOperator.EQ, code)
          ),
          and: false,
        }),
      ]
    );

    // Cancelar resolve undefined: não mexer no que já estava preenchido.
    if (!oSelected) {
      return;
    }

    oInput.setValue(oSelected.getProperty("Code") as string);
    await oTarget.setProperty("PurchaseContractKey", oSelected.getProperty("Key"));
  }

  /**
   * Limpa o vínculo quando o destino deixa de ser estoque próprio. As duas colunas
   * saem juntas — código órfão sem chave confundiria a tela.
   */
  protected async clearPurchaseContract(oTarget: Context) {
    if (!oTarget?.getProperty("PurchaseContractKey")) {
      return;
    }

    await oTarget.setProperty("PurchaseContractKey", null);
    await oTarget.setProperty("PurchaseContractCode", null);
  }

  async openStorageAddressesListValueHelp(ev: Input$ValueHelpRequestEvent) {
    const aContexts = await this._openStorageAddressesList();

    if (!aContexts.length) {
      return;
    }

    ev.getSource().setValue(aContexts[0].getProperty("Code") as string);
  }

  /**
   * Abre o diálogo de saldos por lote e resolve com os contextos escolhidos.
   *
   * Resolve com lista vazia quando não há o que escolher (sem contexto ou sem
   * produto), em vez de ficar pendurada.
   */
  private async _openStorageAddressesList(): Promise<Context[]> {
    const view = this.getView();
    const ctx = view.getBindingContext();

    if (!ctx) return [];

    const itemCode = ctx.getProperty("ItemCode") as string;

    if (!itemCode) {
      MessageBox.warning("Selecione o produto.");
      return [];
    }

    this._dialog ??= await Fragment.load({
      name: "siagrob1.view.ownershipTransfers.fragments.StorageAddressesBalanceDialog",
      controller: this,
      id: view.getId(),
    }) as TableSelectDialog;

    if (view.indexOfDependent(this._dialog) < 0) {
      view.addDependent(this._dialog);
    }

    // Registrado antes do open para não perder o confirm; a promise só é
    // aguardada no fim.
    const pSelection = new Promise<Context[]>((resolve) => {
      const fnConfirm = (oEvent: TableSelectDialog$ConfirmEvent) => {
        this._dialog.detachConfirm(fnConfirm);
        resolve(oEvent.getParameter("selectedContexts") as Context[]);
      };

      this._dialog.attachConfirm(fnConfirm);
    });

    const requestModel = new RequestModel();

    this.setBusy(true);
    try {
      const results = await requestModel.get<object>(
        `${this.api.storageAddressesBalance}(Code='${itemCode}')`
      );

      const viewModel = this.getModel("viewModel") as JSONModel;
      viewModel.setData(results);
    } finally {
      this.setBusy(false);
    }

    this._dialog.open(undefined);

    return pSelection;
  }


  private createColumnConfig() {
        const aCols: Column[] = [];

        aCols.push({
          label: "Status",
          property: "TransactionStatus",
          type: EdmType.Enumeration,
        });

        aCols.push({
          label: "Codigo",
          property: "Code",
          type: EdmType.String,
        });
        
        aCols.push({
          label: "Tipo",
          property: "TransactionType",
          type: EdmType.Enumeration,
          valueMap: {
            "Purchase": "Compra",
            "PurchaseReturn": "Dev.Compra",
            "PurchaseQtyComplement": "Compl.Qtd.",
            "PurchasePriceComplement": "Compl.Preço",
            "SalesShipment": "Saída para Venda",
            "SalesShipmentReturn": "Dev.Venda"
          }
        });

        aCols.push({
          label: "Emissão",
          property: "TransactionDate",
          type: EdmType.Date,
        });

        aCols.push({
          label: "Placa",
          property: "TruckCode",
          type: EdmType.String
        });

        aCols.push({
          label: "Documento",
          property: "InvoiceNumber",
          type: EdmType.String
        });
  
        aCols.push({
          label: "Qtd.Documento",
          property: "InvoiceQty",
          type: EdmType.Number,
          scale: 3,
          delimiter: true
        });

        aCols.push({
          label: "Peso Bruto",
          property: "GrossWeight",
          type: EdmType.Number,
          scale: 3,
          delimiter: true,
        });

        aCols.push({
          label: "Peso Liquido",
          property: "NetWeight",
          type: EdmType.Number,
          scale: 3,
          delimiter: true
        });

        aCols.push({
          label: "Armazem",
          property: "WarehouseCode",
          type: EdmType.String
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
          label: "Chave NF-e",
          property: "ChaveNFe",
          type: EdmType.String,
        });

        return aCols;
      }
  
    onExcel() {
      const table = this.byId("storageTransactionsTable") as Table;
      const binding = table.getBinding("rows") as ODataListBinding
      const cols = this.createColumnConfig();
     
      const setting: SpreadsheetSettings = {
        dataSource: binding,
        fileName: 'Romaneios de Movimentação.xlsx',
        workbook: {
          columns: cols,
          hierarchyLevel: "Level",
          context: {
            sheetName: 'Romaneios de Movimentação'
          }
        }
      };
  
      const oSheet = new Spreadsheet(setting);
      void oSheet.build().finally(function() {
        oSheet.destroy();
      });
    }
}
