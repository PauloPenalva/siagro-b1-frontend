import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import Sorter from "sap/ui/model/Sorter";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { MarketInstrument } from "siagrob1/types/MarketInstrument";
import { MarketCounterparty } from "siagrob1/types/MarketHedges";
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

/** Corretoras e bancos com as contas (ativos e inativos: quem filtra é o helper `accountOptions`). */
export async function loadCounterparties(model: ODataModel): Promise<MarketCounterparty[]> {
  const binding = model.bindList("/MarketCounterparties", undefined, [new Sorter("Name")], undefined, {
    $select: "Id,Name,Type,Active",
    $expand: "Accounts($select=Id,Code,Description,Active)",
  });
  const contexts = await binding.requestContexts(0, 1000);
  return contexts.map((context) => context.getObject() as MarketCounterparty);
}

const SETTLE_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeIsTransient(context: Context): boolean {
  try {
    return context.isTransient() === true;
  } catch {
    return false;
  }
}

/**
 * Grava o que está pendente no update group. `created` é o contexto transiente de uma inclusão:
 * se o POST falhar (o erro já foi mostrado pelo handler global de mensagens), o pendente é
 * descartado para não derrubar o próximo Salvar. Devolve `true` quando gravou.
 */
export async function saveMarketChanges(model: ODataModel, created?: Context): Promise<boolean> {
  const groupId = model.getUpdateGroupId();
  const createdPromise = created?.created();
  // `created()` só rejeita quando a criação é cancelada (delete/resetChanges); POST recusado NÃO a rejeita
  // nem a resolve - o contexto segue transiente e o POST é repetido no próximo submitBatch.
  void createdPromise?.catch((): void => undefined);
  try {
    await model.submitBatch(groupId);
  } catch {
    // segue para a checagem de pendências
  }
  if (createdPromise !== undefined) {
    // Dá uma chance de a resposta do POST ser processada; nunca espera sem limite.
    await Promise.race([createdPromise.catch((): void => undefined), delay(SETTLE_MS)]);
  }
  const failedCreate = !!created && safeIsTransient(created);
  if (failedCreate) {
    try {
      await Promise.race([created.delete(), delay(SETTLE_MS)]);
    } catch {
      // rejeição "canceled": criação desfeita
    }
  }
  if (failedCreate || model.hasPendingChanges(groupId)) {
    if (model.hasPendingChanges(groupId)) model.resetChanges(groupId);
    return false;
  }
  return true;
}
