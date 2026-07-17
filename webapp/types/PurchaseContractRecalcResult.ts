export type PurchaseContractRecalcResult = {
  Key: string;
  Code?: string;
  PreviousAllocatedVolume: number;
  NewAllocatedVolume: number;
  PreviousAvaiableVolume: number;
  NewAvaiableVolume: number;
  Changed: boolean;
}
