export type SalesContractRecalcResult = {
  Key: string;
  Code?: string;
  PreviousAllocatedVolume: number;
  NewAllocatedVolume: number;
  PreviousAvaiableVolume: number;
  NewAvaiableVolume: number;
  Changed: boolean;
}
