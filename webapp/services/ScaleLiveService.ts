import ServerRoutes from "siagrob1/model/ServerRoutes";
import { LiveWeight } from "siagrob1/types/ScaleLive";

/**
 * Assinatura do peso ao vivo. O EventSource reconecta sozinho quando a conexão cai; o que ele
 * NÃO faz é fechar sozinho ao sair da tela - por isso `unsubscribe` é obrigatório no onExit,
 * senão sobra uma conexão aberta por operador.
 */
class ScaleLiveService {
  private source?: EventSource;

  public subscribe(scaleCode: string, onWeight: (live: LiveWeight) => void): void {
    this.unsubscribe();

    const source = new EventSource(ServerRoutes.scaleLive(scaleCode));

    source.onmessage = (event: MessageEvent<string>): void => {
      try {
        onWeight(JSON.parse(event.data) as LiveWeight);
      } catch (error) {
        console.warn("Leitura de peso inválida.", error);
      }
    };

    source.onerror = (): void => onWeight({ weight: 0, stable: false, online: false });

    this.source = source;
  }

  public unsubscribe(): void {
    this.source?.close();
    this.source = undefined;
  }
}

export default new ScaleLiveService();
