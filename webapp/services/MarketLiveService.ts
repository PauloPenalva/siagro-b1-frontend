export type MarketLiveHandlers<T> = {
  onData: (payload: T) => void;
  /** `true` quando o EventSource caiu (ele mesmo tenta reconectar); `false` ao reabrir. */
  onConnectionChange?: (disconnected: boolean) => void;
};

/**
 * Stream ao vivo (SSE) do módulo Mercado. Como no `ScaleLiveService`, o EventSource reconecta
 * sozinho mas NÃO fecha sozinho ao sair da tela: quem chama `start` tem de chamar `stop` ao
 * deixar a rota e no onExit. `start` sempre fecha a conexão anterior desta instância - nunca há
 * duas abertas. Cada tela usa a sua instância (terminal: o default; grade de preços: a dela), para
 * o `stop` de uma tela que sai nunca derrubar o stream da tela que entra.
 */
export class MarketLiveService {
  private source?: EventSource;

  public start<T>(url: string, handlers: MarketLiveHandlers<T>): void {
    this.stop();

    const source = new EventSource(url);

    source.onopen = (): void => handlers.onConnectionChange?.(false);
    source.onmessage = (event: MessageEvent<string>): void => {
      try {
        handlers.onData(JSON.parse(event.data) as T);
      } catch (error) {
        console.warn("Evento do Mercado inválido.", error);
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

/** Instância do terminal de cotações. */
export default new MarketLiveService();

/** Instância da grade "Ordem de Compra". */
export const marketPriceGridLive = new MarketLiveService();

/** Instância do painel de posição. */
export const marketPositionLive = new MarketLiveService();
