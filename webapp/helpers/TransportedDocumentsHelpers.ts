import { formatAmount } from "siagrob1/helpers/InvoiceChargeTotalsHelpers";

/** Tolerância do aviso de ICMS: diferença de até 1 centavo é arredondamento, não divergência. */
const ICMS_TOLERANCE = 0.01;

/**
 * Chave de acesso digitada ou colada: tira espaços (e qualquer outro caractere que não seja dígito, como os pontos
 * que alguns portais colocam). Devolve "" se sobrar algo diferente de 44 dígitos.
 */
export function normalizeAccessKey(text: string): string {
	const digits = (text ?? "").replace(/\D/g, "");
	return digits.length === 44 ? digits : "";
}

type IcmsLine = { CstIcms?: string; IcmsValue?: number | string };

/**
 * Aviso quando o ICMS do XML do CT-e diverge do calculado pela natureza da linha: CST diferente ou valor diferente
 * em mais de 1 centavo. Vazio quando o XML não trouxe CST (nada a comparar) ou quando não há linha.
 */
export function cteIcmsWarning(cteCst?: string, cteValue?: number | string, line?: IcmsLine): string {
	if (!cteCst || !line) return "";

	const xmlValue = Number(cteValue ?? 0);
	const lineValue = Number(line.IcmsValue ?? 0);
	const lineCst = line.CstIcms ?? "";

	if (cteCst === lineCst && Math.abs(xmlValue - lineValue) <= ICMS_TOLERANCE) return "";

	return `O ICMS do XML do CT-e (CST ${cteCst}, R$ ${formatAmount(xmlValue)}) difere do calculado pela natureza ` +
		`(CST ${lineCst || "-"}, R$ ${formatAmount(lineValue)}). Confira a natureza da linha.`;
}
