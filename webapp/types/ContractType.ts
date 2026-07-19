import StringType  from "sap/ui/model/odata/type/String";
import ValidateException from "sap/ui/model/ValidateException";

/**
 * Tipo OData para o enum `ContractType` do backend (`Fixed` / `ToBeDetermined`).
 *
 * Faz a tradução nos dois sentidos: exibe o texto de negócio e devolve ao modelo o
 * valor do enum. Os textos são os mesmos de `formatter.formatContractType` - se um
 * mudar, mude o outro.
 */
export class ContractType extends StringType {
  private _mValueToText: Map<string, string>;
  private _mTextToValue: Map<string, string>;

  constructor(
        oFormatOptions?: {
          parseKeepsEmptyString?: boolean;
        },
        oConstraints?: {
          isDigitSequence?: string | boolean;
          maxLength?: string | number;
          nullable?: string | boolean;
        }
    ) {
      super(oFormatOptions, oConstraints);

      this._mValueToText = new Map<string, string>([
        ['Fixed', 'FIX - Preço Fixo'],
        ['ToBeDetermined', 'PAF - Preço a Fixar']
      ]);

      this._mTextToValue = new Map<string, string>(
        Array.from(this._mValueToText, ([sValue, sText]) => [sText, sValue])
      );
  }

  override formatValue(sValue: string, sTargetType: string): string {
    if (!sValue) return sValue;

    if (sTargetType !== "string") {
      return super.formatValue(sValue, sTargetType) as string;
    }

    return this._mValueToText.get(sValue) ?? sValue;
  }

  override parseValue(sValue: string, sSourceType: string): string {
    if (!sValue) return sValue;

    return this._mTextToValue.get(sValue) ?? (super.parseValue(sValue, sSourceType));
  }

  override validateValue(sValue: string): void {
    super.validateValue(sValue);

    if (sValue && !this._mValueToText.has(sValue)) {
      const aValidValues = Array.from(this._mValueToText.keys());
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw new ValidateException(
        `Tipo de contrato "${sValue}" inválido. Valores permitidos: ${aValidValues.join(", ")}`
      );
    }
  }
}
