import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import {
  INVALID_INTERVAL_MESSAGE, SapIntegrationSettings, formatLastRunText, isValidSyncInterval,
  normalizeSapIntegrationSettings,
} from "siagrob1/helpers/SapIntegrationSettingsHelpers";

/** Estado da tela: a configuração do servidor mais a flag que desabilita tudo fora do SAPB1. */
type ScreenState = SapIntegrationSettings & { SapMode: boolean; LastRunText: string };

/**
 * Integração SAP da empresa (só SAPB1; o servidor exige ADMIN): liga/desliga e intervalo da
 * sincronização de cancelamentos das NFs vinculadas, e disparo manual.
 *
 * @namespace siagrob1.controller.sapIntegrationSettings
 */
export default class Main extends CommonController {
  onInit(): void {
    this.getView().setModel(new JSONModel(this.buildState(false)), "sap");
    this.getRouter().getRoute("sapIntegrationSettings").attachPatternMatched(() => void this.load());
  }

  private model(): JSONModel {
    return this.getView().getModel("sap") as JSONModel;
  }

  private buildState(sapMode: boolean, raw?: unknown): ScreenState {
    const settings = normalizeSapIntegrationSettings(raw);
    return { ...settings, SapMode: sapMode, LastRunText: formatLastRunText(settings.InvoiceSyncLastRunAt) };
  }

  private async load(): Promise<void> {
    const sapMode = SessionService.isSapMode();
    this.model().setData(this.buildState(sapMode));

    // O menu só lista o item em SAPB1 (MenuService); por URL direta, fora do SAPB1 a tela só avisa e não chama o
    // servidor (ele recusaria com 400).
    if (!sapMode) {
      return;
    }

    this.setBusy(true);
    try {
      const result = await sendJson("GET", ServerRoutes.sapIntegrationSettingsGet);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      this.model().setData(this.buildState(true, odataValue<unknown>(result.data)));
    } finally {
      this.setBusy(false);
    }
  }

  async onSave(): Promise<void> {
    const state = this.model().getData() as ScreenState;
    if (!isValidSyncInterval(state.InvoiceSyncIntervalMinutes)) {
      MessageBox.warning(INVALID_INTERVAL_MESSAGE);
      return;
    }

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.sapIntegrationSettingsSave, {
        InvoiceSyncEnabled: state.InvoiceSyncEnabled === true,
        InvoiceSyncIntervalMinutes: Number(state.InvoiceSyncIntervalMinutes),
      });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      this.model().setData(this.buildState(true, odataValue<unknown>(result.data)));
      MessageToast.show("Configuração salva.");
    } finally {
      this.setBusy(false);
    }
  }

  async onRunNow(): Promise<void> {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.sapInvoiceSyncRunNow);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      // Atualiza só a última execução: o que o usuário digitou e ainda não salvou não é sobrescrito.
      const updated = normalizeSapIntegrationSettings(odataValue<unknown>(result.data));
      this.model().setProperty("/InvoiceSyncLastRunAt", updated.InvoiceSyncLastRunAt);
      this.model().setProperty("/LastRunText", formatLastRunText(updated.InvoiceSyncLastRunAt));
      MessageToast.show("Sincronização executada.");
    } finally {
      this.setBusy(false);
    }
  }
}
