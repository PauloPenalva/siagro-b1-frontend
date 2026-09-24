import { FreightCalculationMethod } from "siagrob1/helpers/FreightHelpers";

export type SystemSetup = {
  Code?: string;
  DefaultCurrency?: string;
  DefaultFreightUoM?: string;
  DefaultUoM?: string;
  DefaultFreightCalculationMethod?: FreightCalculationMethod;
  IsActive: boolean;
}
