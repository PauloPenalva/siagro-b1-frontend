import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import BaseController from "./BaseController";
import formatter from "siagrob1/model/formatter";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { Dashboard, DashboardContractQueueItem } from "siagrob1/types/Dashboard";

type DashboardState = Partial<Dashboard> & {
  loading: boolean;
  loadedAt: string;
  /** true em SAPB1 (endpoint responde 404): a home fica vazia, como antes do painel. */
  hidden: boolean;
};

/**
 * Home como painel operacional (spec 2026-10-16-home-dashboard-design): uma chamada a
 * /reports/Dashboard a cada volta à rota raiz. Só STANDALONE.
 *
 * @namespace siagrob1.controller
 */
export default class Main extends BaseController {

  formatter = { ...formatter };

  onInit(): void {
    this.getView().setModel(new JSONModel({ loading: false, loadedAt: "", hidden: false } as DashboardState), "dashboard");
    this.getRouter().getRoute("main").attachPatternMatched(() => void this.load());
  }

  public async load(): Promise<void> {
    const model = this.getModel("dashboard") as JSONModel;

    if (SessionService.isSapMode()) {
      model.setProperty("/hidden", true);
      return;
    }

    model.setProperty("/loading", true);
    try {
      const data = await new RequestModel().get<Dashboard>(ServerRoutes.dashboard);
      model.setData({ ...data, loading: false, loadedAt: new Date().toISOString(), hidden: false } as DashboardState);
    } catch (error) {
      model.setProperty("/loading", false);
      // 404 = modo SAPB1 (ou Reports sem a versão nova): sem painel, sem caixa de erro.
      if ((error as { status?: number })?.status === 404) {
        model.setProperty("/hidden", true);
        return;
      }
      throw error;
    }
  }

  onRefresh(): void {
    void this.load();
  }

  onOpenPayables(): void { this.navTo("accountsPayable"); }
  onOpenReceivables(): void { this.navTo("accountsReceivable"); }
  onOpenLoads(): void { this.navTo("shipmentLoads"); }
  onOpenPurchaseContracts(): void { this.navTo("purchaseContracts"); }
  onOpenSalesContracts(): void { this.navTo("salesContracts"); }
  onOpenMonthlyReport(): void { this.navTo("contractMonthlyPositionReport"); }

  onOpenSalesContract(ev: Event): void {
    this.navTo("salesContractsDetail", { id: this.queueItem(ev).key });
  }

  onOpenPurchaseContract(ev: Event): void {
    this.navTo("purchaseContractsDetail", { id: this.queueItem(ev).key });
  }

  private queueItem(ev: Event): DashboardContractQueueItem {
    const item = ev.getSource<ListItemBase>();
    return item.getBindingContext("dashboard").getObject() as DashboardContractQueueItem;
  }
}
