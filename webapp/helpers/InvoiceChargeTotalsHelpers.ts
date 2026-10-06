/**
 * Frete, seguro, desconto e outras despesas da linha dos documentos de entrada e de saída (spec 2026-10-05 §10): o total
 * geral da linha (coluna "Total"), a seção "Totais" do Detail e o total da barra da grade, somados NO CLIENTE —
 * `GrandTotal` é [NotMapped] e não existe num documento em digitação.
 *
 * Puro para poder ser testado sem view; as duas entidades de linha têm os mesmos campos.
 */
import { toNumber } from "siagrob1/helpers/PurchaseInvoiceDraftHelpers";

/** Valor como chega do modelo: Edm.Decimal vem em string (IEEE754Compatible), o digitado vem em número. */
type Amount = number | string;

/** Campos da linha que o total geral lê. */
export type ChargeLine = {
	Quantity: Amount;
	UnitPrice: Amount;
	FreightValue: Amount;
	InsuranceValue: Amount;
	DiscountValue: Amount;
	OtherExpensesValue: Amount;
};

/** Linha da seção "Totais". */
export type ChargeTotalRow = { Label: string; Value: number; Emphasized: boolean };

/** Seção "Totais" do documento: as somas e as linhas na ordem da spec. */
export type ChargeTotals = {
	items: number;
	freight: number;
	insurance: number;
	otherExpenses: number;
	discount: number;
	grandTotal: number;
	rows: ChargeTotalRow[];
};

/** Campos das linhas que a seção precisa no `$select` (o Detail monta o $select das linhas à mão). */
export const LINE_CHARGES_SELECT = "Quantity,UnitPrice,FreightValue,InsuranceValue,DiscountValue,OtherExpensesValue";

/** Arredonda em centavos; o EPSILON tira o ruído do ponto flutuante (0,1 + 0,2). */
function cents(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Total dos itens da linha (o vProd): quantidade × preço, em centavos — como o `Total` do servidor. */
export function lineItemsTotal(quantity: unknown, unitPrice: unknown): number {
	return cents(toNumber(quantity) * toNumber(unitPrice));
}

/** Total geral da linha (spec D2): itens + frete + seguro + outras despesas − desconto. */
export function lineGrandTotal(
	quantity: unknown, unitPrice: unknown, freight: unknown, insurance: unknown, discount: unknown, otherExpenses: unknown,
): number {
	return cents(lineItemsTotal(quantity, unitPrice) + toNumber(freight) + toNumber(insurance) +
		toNumber(otherExpenses) - toNumber(discount));
}

/** Valor em pt-BR com 2 casas ("1.234,50"); indefinido vira "0,00". */
export function formatAmount(value: number): string {
	return (value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formatter da coluna "Total" da grade: seis partes, todas com `targetType: 'any'`. */
export function formatLineGrandTotal(
	quantity: unknown, unitPrice: unknown, freight: unknown, insurance: unknown, discount: unknown, otherExpenses: unknown,
): string {
	return formatAmount(lineGrandTotal(quantity, unitPrice, freight, insurance, discount, otherExpenses));
}

/**
 * Lê os campos da linha pelo `getProperty` do contexto, e não pelo `getObject()`: na inclusão o `getObject()` da linha
 * transiente ainda volta undefined, e a linha recém-digitada sumiria do total.
 */
export function chargeLineOf(context: { getProperty(path: string): unknown }): ChargeLine {
	return {
		Quantity: context.getProperty("Quantity") as Amount,
		UnitPrice: context.getProperty("UnitPrice") as Amount,
		FreightValue: context.getProperty("FreightValue") as Amount,
		InsuranceValue: context.getProperty("InsuranceValue") as Amount,
		DiscountValue: context.getProperty("DiscountValue") as Amount,
		OtherExpensesValue: context.getProperty("OtherExpensesValue") as Amount,
	};
}

/** Seção "Totais" do documento, na ordem da spec; linha nula (rascunho recém-criado) é ignorada. */
export function summarizeInvoiceCharges(allLines: ChargeLine[]): ChargeTotals {
	const lines = allLines.filter((line) => !!line);
	const sum = (pick: (line: ChargeLine) => number) => cents(lines.reduce((total, line) => total + pick(line), 0));

	const items = sum((line) => lineItemsTotal(line.Quantity, line.UnitPrice));
	const freight = sum((line) => toNumber(line.FreightValue));
	const insurance = sum((line) => toNumber(line.InsuranceValue));
	const otherExpenses = sum((line) => toNumber(line.OtherExpensesValue));
	const discount = sum((line) => toNumber(line.DiscountValue));
	const grandTotal = cents(items + freight + insurance + otherExpenses - discount);

	return {
		items, freight, insurance, otherExpenses, discount, grandTotal,
		rows: [
			{ Label: "Total dos itens", Value: items, Emphasized: false },
			{ Label: "Frete", Value: freight, Emphasized: false },
			{ Label: "Seguro", Value: insurance, Emphasized: false },
			{ Label: "Outras despesas", Value: otherExpenses, Emphasized: false },
			{ Label: "(−) Desconto", Value: discount, Emphasized: false },
			{ Label: "Total geral", Value: grandTotal, Emphasized: true },
		],
	};
}
