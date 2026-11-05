import ServerRoutes from "siagrob1/model/ServerRoutes";
import { MarketQuotesPayload } from "siagrob1/types/MarketQuote";

export type MarketLiveHandlers = {
  onData: (payload: MarketQuotesPayload) => void;
  /** `true` quando o EventSource caiu (ele mesmo tenta reconectar); `false` ao reabrir. */
  onConnectionChange?: (disconnected: boolean) => void;
};

/**
 * Cotações ao vivo do módulo Mercado (SSE). Como no `ScaleLiveService`, o EventSource reconecta
 * sozinho mas NÃO fecha sozinho ao sair da tela: quem chama `start` tem de chamar `stop` ao
 * deixar a rota e no onExit. `start` sempre fecha a conexão anterior - nunca há duas abertas.
 */
class MarketLiveService {
  private source?: EventSource;

  public start(handlers: MarketLiveHandlers): void {
    this.stop();

    const source = new EventSource(ServerRoutes.marketQuotesLive);

    source.onopen = (): void => handlers.onConnectionChange?.(false);
    source.onmessage = (event: MessageEvent<string>): void => {
      try {
        handlers.onData(JSON.parse(event.data) as MarketQuotesPayload);
      } catch (error) {
        console.warn("Evento de cotações inválido.", error);
      }
    };
    source.onerror = (): void => handlers.onConnectionChange?.(true);

    this.source = source;
  }

  public stop(): void {
    this.source?.close();
    this.source = undefined;
  }

  public isRunning(): boolean {
    return this.source !== undefined;
  }
}

export default new MarketLiveService();
