/**
 * GAC-1223: no módulo de Armazenagem o depositante é sempre um FORNECEDOR. Vale para o romaneio
 * de armazenagem (entrada, saída e quebra técnica) e para o ticket de pesagem, cujo parceiro tem
 * de ser o dono do lote.
 *
 * Compra, venda e os demais tipos (transbordo, ajuste…) ficam fora: ali o parceiro não é o
 * depositante do lote e pode ser cliente.
 */
const SUPPLIER_ONLY_TRANSACTION_TYPES = new Set(["Receipt", "Shipment", "QualityLoss"]);

/**
 * `true` quando o parceiro do romaneio só pode ser fornecedor. Tipo ainda não escolhido conta
 * como armazenagem — é o caso comum na tela de inclusão.
 */
export function isSupplierOnlyTransaction(transactionType: string): boolean {
	return !transactionType || SUPPLIER_ONLY_TRANSACTION_TYPES.has(transactionType);
}
