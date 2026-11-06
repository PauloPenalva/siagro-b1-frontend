import ServerRoutes from "siagrob1/model/ServerRoutes";

/** Tempo-limite da sonda: as telas de contrato esperam por ela na primeira visita. */
const PROBE_TIMEOUT_MS = 4000;
/** Depois de uma sonda sem resposta definitiva, não sondar de novo por este tempo (responde "desligado"). */
const RETRY_AFTER_MS = 60000;

/** Resposta definitiva da sessão (só 200 ou 404); `undefined` = ainda não se sabe. */
let known: boolean = undefined;
/** Sonda em voo (compartilhada por quem chamar enquanto ela não volta). */
let inFlight: Promise<boolean> | undefined;
/** Instante (relógio abaixo) antes do qual não se sonda de novo, depois de um estouro/falha. */
let retryAt = 0;
/** Relógio injetável (testes). */
let now: () => number = () => Date.now();

async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(ServerRoutes.marketModule, { method: "GET", signal: controller.signal });
    if (response.status === 200) known = true;
    else if (response.status === 404) known = false;
    else retryAt = now() + RETRY_AFTER_MS;
    return response.status === 200;
  } catch {
    // Tempo esgotado ou rede: desligado AGORA; nova sonda só depois de RETRY_AFTER_MS (cada visita a uma
    // tela de contrato esperaria até 4 s de novo).
    retryAt = now() + RETRY_AFTER_MS;
    return false;
  } finally {
    clearTimeout(timer);
    inFlight = undefined;
  }
}

/**
 * Diz se o módulo Mercado está ligado no servidor (`GET /market/module`: 200 = ligado, 404 = desligado).
 * Só 200 e 404 ficam guardados para a sessão; tempo esgotado (4 s), erro de rede ou outro status
 * respondem `false` sem diálogo, e por 60 s as chamadas respondem `false` na hora, sem sondar.
 */
const MarketModuleService = {
  isEnabled(): Promise<boolean> {
    if (known !== undefined) return Promise.resolve(known);
    if (inFlight !== undefined) return inFlight;
    if (now() < retryAt) return Promise.resolve(false);
    return (inFlight = probe());
  },

  /** Resposta definitiva já conhecida (sem esperar), ou `undefined`. */
  knownState(): boolean {
    return known;
  },

  /** Só para testes: zera o estado da sessão e, opcionalmente, troca o relógio. */
  resetForTests(clock?: () => number): void {
    known = undefined;
    inFlight = undefined;
    retryAt = 0;
    now = clock ?? ((): number => Date.now());
  },
};

export default MarketModuleService;
