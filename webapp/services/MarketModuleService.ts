import ServerRoutes from "siagrob1/model/ServerRoutes";

/** Tempo-limite da sonda: as telas de contrato esperam por ela na primeira visita. */
const PROBE_TIMEOUT_MS = 4000;

/** Resposta definitiva da sessão (só 200 ou 404); `undefined` = ainda não se sabe. */
let known: boolean = undefined;
/** Sonda em voo (compartilhada por quem chamar enquanto ela não volta). */
let inFlight: Promise<boolean> | undefined;

async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(ServerRoutes.marketModule, { method: "GET", signal: controller.signal });
    if (response.status === 200) known = true;
    else if (response.status === 404) known = false;
    return response.status === 200;
  } catch {
    // Tempo esgotado ou rede: conta como desligado AGORA, mas a próxima chamada tenta de novo.
    return false;
  } finally {
    clearTimeout(timer);
    inFlight = undefined;
  }
}

/**
 * Diz se o módulo Mercado está ligado no servidor (`GET /market/module`: 200 = ligado, 404 = desligado).
 * Só 200 e 404 ficam guardados para a sessão; tempo esgotado (4 s), erro de rede ou outro status
 * respondem `false` sem diálogo e a próxima chamada sonda de novo.
 */
const MarketModuleService = {
  isEnabled(): Promise<boolean> {
    if (known !== undefined) return Promise.resolve(known);
    return (inFlight ??= probe());
  },

  /** Resposta definitiva já conhecida (sem esperar), ou `undefined`. */
  knownState(): boolean {
    return known;
  },
};

export default MarketModuleService;
