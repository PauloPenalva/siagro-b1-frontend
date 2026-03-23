import { Address } from "./Addresses";

export type BusinessPartner = {
  CardCode?: string,
  CardName?: string,
  TaxId?: string,
  CardFName?: string,
  Addresses?: Address[];
}
