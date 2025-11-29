import StringType  from "sap/ui/model/odata/type/String";
import ValidateException from "sap/ui/model/ValidateException";

export class ContractType extends StringType {
  private _mStatusMap: Map<string, string>;

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

      this._mStatusMap = new Map<string, string>([
        ['Fixed', '0'],
        ['ToBeDetermined','1']
      ]);
  }

  override formatValue(sValue: string, sTargetType: string): string {
    if (!sValue) return sValue;

    if (sTargetType !== "string") {
      return super.formatValue(sValue, sTargetType) as string;
    }

    this._mStatusMap[sValue];

    return (this._mStatusMap[sValue] || sValue) as string;
  }

  override parseValue(sValue: string, sSourceType: string): string {
    if (!sValue) return sValue;

    return this._mTextToValue.get(sValue) || sValue;
  }

  override validateValue(sValue: string): void {
    super.validateValue(sValue);

    if (sValue && !this._mValueToText.has(sValue)) {
      const validValues = Array.from(this._mValueToText.keys());
      throw new ValidateException(
        `Tipo de contrato "${sValue}" inválido. Valores: ${validValues.join(", ")}`
      );
    }
  }
   
  override validateValue(sValue: string): void {
     const validValues = Array.from(this._mStatusMap.keys());
      if (sValue && !validValues.includes(sValue)) {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw new ValidateException(
              `Status "${sValue}" não é válido. Valores permitidos: ${validValues.join(", ")}`
          );
      }
  }
}
