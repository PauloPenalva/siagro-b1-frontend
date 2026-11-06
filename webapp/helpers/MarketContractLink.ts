import JSONModel from "sap/ui/model/json/JSONModel";
import Controller from "sap/ui/core/mvc/Controller";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * Vínculo opcional a um contrato nos diálogos do Mercado: compra OU venda (escolher um limpa o outro).
 * O modelo precisa ter `purchaseContractKey/Code` e `salesContractKey/Code` na raiz.
 */
export async function pickPurchaseContract(controller: Controller, model: JSONModel): Promise<void> {
  const picked = await DialogHelper.openTableSelectDialog(controller, "PurchaseContractsApprovedSelectDialog", ["Code", "CardName"]);
  if (!picked) return;
  model.setProperty("/purchaseContractKey", picked.getProperty("Key") as string);
  model.setProperty("/purchaseContractCode", picked.getProperty("Code") as string);
  model.setProperty("/salesContractKey", "");
  model.setProperty("/salesContractCode", "");
}

export async function pickSalesContract(controller: Controller, model: JSONModel): Promise<void> {
  const picked = await DialogHelper.openTableSelectDialog(controller, "SalesContractsSelectDialog", ["Code", "CardName"]);
  if (!picked) return;
  model.setProperty("/salesContractKey", picked.getProperty("Key") as string);
  model.setProperty("/salesContractCode", picked.getProperty("Code") as string);
  model.setProperty("/purchaseContractKey", "");
  model.setProperty("/purchaseContractCode", "");
}

/** Limpar o campo (ícone de limpar) desfaz o vínculo; o campo só aceita escolha pelo value help. */
export function syncContractLink(model: JSONModel): void {
  if (!model.getProperty("/purchaseContractCode")) model.setProperty("/purchaseContractKey", "");
  if (!model.getProperty("/salesContractCode")) model.setProperty("/salesContractKey", "");
}
