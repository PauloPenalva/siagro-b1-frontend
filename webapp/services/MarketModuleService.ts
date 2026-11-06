import ServerRoutes from "siagrob1/model/ServerRoutes";

let enabledPromise: Promise<boolean> | undefined;

async function probe(): Promise<boolean> {
  try {
    const response = await fetch(ServerRoutes.marketModule, { method: "GET" });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Diz se o módulo Mercado está ligado no servidor (`GET /market/module`: 200 = ligado, 404 = desligado).
 * Uma única sonda por sessão: o resultado (promessa) fica guardado. Qualquer outra falha conta como
 * desligado, sem diálogo de erro — as telas de contrato só ganham a seção "Mercado" quando é `true`.
 */
const MarketModuleService = {
  isEnabled(): Promise<boolean> {
    return (enabledPromise ??= probe());
  },
};

export default MarketModuleService;
