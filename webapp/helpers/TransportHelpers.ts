/**
 * Textos e estados dos cadastros de transporte (veículo, conjunto, motorista). Os códigos são os
 * oficiais do CT-e/MDF-e (tpRod, tpCar); o OData v4 entrega os enums pelo nome.
 */

const KIND: Record<string, string> = { Traction: "Tração", Trailer: "Reboque" };

const WHEEL: Record<string, string> = {
	Truck: "01 - Truck",
	Stump: "02 - Toco",
	TractorUnit: "03 - Cavalo mecânico",
	Van: "04 - VAN",
	Utility: "05 - Utilitário",
	Other: "06 - Outros",
};

const BODY: Record<string, string> = {
	NotApplicable: "00 - Não aplicável",
	Open: "01 - Aberta",
	ClosedBox: "02 - Fechada/Baú",
	Bulk: "03 - Graneleira",
	Container: "04 - Porta-container",
	Sider: "05 - Sider",
};

const text = (map: Record<string, string>, value: string): string =>
	value ? map[value] ?? value : "";

export const truckKindText = (value: string): string => text(KIND, value);
export const truckWheelTypeText = (value: string): string => text(WHEEL, value);
export const truckBodyTypeText = (value: string): string => text(BODY, value);

/** Dias de antecedência para o aviso de CNH a vencer. */
const LICENSE_WARNING_DAYS = 30;

/** "yyyy-MM-dd" vira data local (sem o deslocamento de UTC que o `new Date(string)` aplicaria). */
const toLocalDate = (value: string | Date): Date => {
	if (value instanceof Date) {
		return new Date(value.getFullYear(), value.getMonth(), value.getDate());
	}
	const [y, m, d] = value.slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d);
};

/**
 * Estado da validade da CNH: vencida → Error; vence em até 30 dias (inclusive hoje) → Warning;
 * senão → None. Só avisa: o bloqueio na emissão é do CT-e/MDF-e.
 */
export const licenseState = (
	expiresOn: string | Date,
	today: Date = new Date(),
): "Error" | "Warning" | "None" => {
	if (!expiresOn) {
		return "None";
	}
	const days = Math.round((toLocalDate(expiresOn).getTime() - toLocalDate(today).getTime()) / 86_400_000);
	if (days < 0) {
		return "Error";
	}
	return days <= LICENSE_WARNING_DAYS ? "Warning" : "None";
};
