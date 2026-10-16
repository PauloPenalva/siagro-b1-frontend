/**
 * Resposta de GET /reports/Dashboard (espelho camelCase de SiagroB1.Reports.Dtos.DashboardDto).
 */
export type DashboardMoney = { amount: number; count: number };

export type DashboardQuantity = { unitOfMeasure: string; quantity: number };

export type DashboardOverdueSide = { count: number; quantities: DashboardQuantity[] };

export type DashboardLoadsInProgress = {
  total: number;
  planned: number;
  loading: number;
  inTransshipment: number;
  inTransit: number;
  refusalPending: number;
};

export type DashboardDayLoads = { date: string; count: number; quantities: DashboardQuantity[] };

export type DashboardStockRow = {
  itemCode: string;
  itemName?: string;
  unitOfMeasure: string;
  physical?: number;
  inLoad: number;
  purchaseToDeliver: number;
  salesToDeliver: number;
  net?: number;
};

export type DashboardMonthlyPositionRow = {
  group: string;
  unitOfMeasure: string;
  bucket: string;
  contractedPurchase: number;
  contractedSales: number;
  contractedNet: number;
  deliveredPurchase: number;
  deliveredSales: number;
  deliveredNet: number;
  washedOutPurchase: number;
  purchaseQuantity: number;
  salesQuantity: number;
  netQuantity: number;
  accumulatedQuantity: number;
};

export type DashboardContractQueueItem = {
  key: string;
  code: string;
  cardCode: string;
  cardName?: string;
  itemCode: string;
  itemName?: string;
  harvestSeasonCode: string;
  toDeliver: number;
  unitOfMeasure: string;
  cashFlowDate?: string;
  deliveryEndDate?: string;
  isOverdue: boolean;
};

export type DashboardContractQueue = { total: number; items: DashboardContractQueueItem[] };

export type Dashboard = {
  generatedAt: string;
  financial: {
    payablesDueToday: DashboardMoney;
    receivablesDueToday: DashboardMoney;
    payablesOverdue: DashboardMoney;
    receivablesOverdue: DashboardMoney;
  };
  overdueContracts: { purchase: DashboardOverdueSide; sales: DashboardOverdueSide };
  loadsInProgress: DashboardLoadsInProgress;
  recentLoads: DashboardDayLoads[];
  stock: DashboardStockRow[];
  monthlyPosition: DashboardMonthlyPositionRow[];
  salesToDeliver: DashboardContractQueue;
  purchasesToReceive: DashboardContractQueue;
};
