import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import Sorter from "sap/ui/model/Sorter";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { MarketInstrument } from "siagrob1/types/MarketInstrument";
import { MarketDestination, MarketLookups } from "siagrob1/types/MarketPricing";
import { curveInstrumentsOf, fxInstrumentsOf, priceInstrumentsOf } from "siagrob1/helpers/MarketPricingHelpers";

/**
 * Listas de apoio (instrumentos e destinos ativos) que alimentam os Selects das telas de preço.
 * Carregadas ANTES de ligar o formulário: Select com `selectedKey` do modelo OData e itens que
 * chegam depois renderiza vazio.
 */
export const EMPTY_LOOKUPS: MarketLookups = {
  instruments: [], priceInstruments: [], curveInstruments: [], fxInstruments: [], destinations: [], loaded: false,
};

async function requestAll<T>(model: ODataModel, path: string, select: string, sorters: Sorter[], filters: Filter[]): Promise<T[]> {
  const binding = model.bindList(path, undefined, sorters, filters, { $select: select });
  const contexts = await binding.requestContexts(0, 1000);
  return contexts.map((context) => context.getObject() as T);
}

export async function loadMarketLookups(model: ODataModel, withInstruments = true, withDestinations = true): Promise<MarketLookups> {
  const active = [new Filter("Active", FilterOperator.EQ, true)];
  const instruments = withInstruments
    ? await requestAll<MarketInstrument>(model, "/MarketInstruments", "Code,Description,Type,QuoteUnit,CurveDays,Active",
      [new Sorter("GroupName"), new Sorter("SortOrder")], active)
    : [];
  const destinations = withDestinations
    ? await requestAll<MarketDestination>(model, "/MarketDestinations", "Id,Name,Active", [new Sorter("Name")], active)
    : [];
  return {
    instruments,
    priceInstruments: priceInstrumentsOf(instruments),
    curveInstruments: curveInstrumentsOf(instruments),
    fxInstruments: fxInstrumentsOf(instruments),
    destinations,
    loaded: true,
  };
}

/**
 * Grava o que está pendente no update group. `created` é o contexto transiente de uma inclusão:
 * se o POST falhar (o erro já foi mostrado pelo handler global de mensagens), o pendente é
 * descartado para não derrubar o próximo Salvar. Devolve `true` quando gravou.
 */
export async function saveMarketChanges(model: ODataModel, created?: Context): Promise<boolean> {
  const groupId = model.getUpdateGroupId();
  const createdPromise = created?.created();
  // O erro de criação também chega pelo submitBatch/handler global: aqui só se evita a rejeição solta.
  void createdPromise?.catch((): void => undefined);
  try {
    await model.submitBatch(groupId);
    await createdPromise;
  } catch {
    // segue para a checagem de pendências
  }
  if (model.hasPendingChanges(groupId)) {
    model.resetChanges(groupId);
    return false;
  }
  return true;
}
