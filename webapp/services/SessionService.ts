import Dialog from "sap/m/Dialog";
import Text from "sap/m/Text";
import Button from "sap/m/Button";

type ExpireCallback = () => void;

class SessionService {
  private idleTimer?: number;
  private warningTimer?: number;
  private active = false;

  private readonly IDLE_TIMEOUT = 30 * 60 * 1000;   // 30 min
  private readonly WARNING_TIME = 28 * 60 * 1000;   // aviso com 2 min

  private onExpireCallback?: ExpireCallback;

  public start(callback: ExpireCallback): void {
    this.onExpireCallback = callback;
    this.active = true;

    this.attachListeners();
    this.resetTimers();
  }

  public stop(): void {
    this.active = false;

    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
    }

    if (this.warningTimer) {
      window.clearTimeout(this.warningTimer);
    }
  }

  private attachListeners(): void {
    const events: string[] = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart"
    ];

    events.forEach(event =>
      document.addEventListener(event, this.resetTimers.bind(this))
    );
  }

  private resetTimers(): void {
    if (!this.active) {
      return;
    }

    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
    }

    if (this.warningTimer) {
      window.clearTimeout(this.warningTimer);
    }

    this.warningTimer = window.setTimeout(
      () => this.showWarning(),
      this.WARNING_TIME
    );

    this.idleTimer = window.setTimeout(
      () => this.expireSession(),
      this.IDLE_TIMEOUT
    );
  }

  private showWarning(): void {
    const dialog = new Dialog({
      title: "Sessão prestes a expirar",
      type: "Message",
      content: new Text({
        text: "Sua sessão irá expirar em 2 minutos. Deseja continuar?"
      }),
      beginButton: new Button({
        text: "Continuar sessão",
        press: () => {
          dialog.close();
          this.renewSession();
        }
      }),
      endButton: new Button({
        text: "Sair",
        press: () => {
          dialog.close();
          this.expireSession();
        }
      }),
      afterClose: () => dialog.destroy()
    });

    dialog.open();
  }

  private renewSession(): void {
    fetch("/security/auth/status", {
      method: "GET",
      credentials: "include"
    }).finally(() => this.resetTimers());
  }

  private expireSession(): void {
    this.stop();
    this.onExpireCallback?.();
  }
}

export default new SessionService();
