import SapTable from "sap/m/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";

/** Campo do vínculo que aponta o documento cujos CT-e se quer listar. */
export type CteFreightsOwnerField = "SalesInvoiceKey" | "TransportedPurchaseInvoiceKey";

/**
 * Aponta a lista "CT-e de frete" (nasce suspensa) para um documento: CT-e vinculados e não cancelados. O filtro de enum
 * é ESTÁTICO (string no $filter), pois sap.ui.model.Filter não sabe formatar enum.
 */
export function showCteFreights(table: SapTable | undefined, ownerField: CteFreightsOwnerField, documentKey: string): void {
	const binding = table?.getBinding("items") as ODataListBinding;
	if (!binding || !documentKey) return;

	binding.changeParameters({ $filter: `${ownerField} eq ${documentKey} and PurchaseInvoice/InvoiceStatus ne 'Cancelled'` });

	if (binding.isSuspended()) {
		binding.resume();
	} else {
		binding.refresh();
	}
}

/** Documento novo: esvazia a lista do anterior até o filtro deste ser aplicado. */
export function suspendCteFreights(table: SapTable | undefined): void {
	const binding = table?.getBinding("items") as ODataListBinding;
	if (binding && !binding.isSuspended()) binding.suspend();
}
