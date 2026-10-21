/** Dimensão gerencial (1 a 5) como o servidor devolve. Aceita PascalCase e camelCase. */
export interface AccountingDimension {
	Number?: number;
	Name?: string;
	Active?: boolean;
	Role?: string;
	number?: number;
	name?: string;
	active?: boolean;
	role?: string;
}

export interface DimensionItem {
	Number: number;
	Name: string;
	Active: boolean;
	Role: string;
}

export interface DimsModelData {
	items: DimensionItem[];
	/** Resumo da dimensão ativa com papel Parceiro (campo "Padrão de ..." no cadastro do parceiro). */
	partner?: { exists: boolean; number: number; label: string };
}
