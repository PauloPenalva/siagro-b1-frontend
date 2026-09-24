/**
 * Placa do veículo (GAC-1190), que é também a chave do cadastro. É a mesma regra do
 * `TruckPlateRules` do backend: maiúsculas, sem espaço nem hífen, no padrão antigo (ABC1234) ou
 * Mercosul (ABC1D23). O campo limitava a 7 caracteres sem validar nada, e "CUD 1H57" digitado com
 * espaço foi gravado como "CUD 1H5".
 */

export const INVALID_PLATE_MESSAGE = "Placa inválida. Use o formato ABC1234 ou ABC1D23.";

const PLATE_PATTERN = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks está desligado no tsconfig, mas a assinatura documenta o contrato real: o campo nasce vazio.
export function normalizePlate(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- idem.
export function isValidPlate(value: string | null | undefined): boolean {
  return PLATE_PATTERN.test(normalizePlate(value));
}
