/**
 * Uma fixação confirmada oferecida no diálogo "Registrar Washout", com o quanto dela ainda pode
 * ser lavado (volume menos os washouts em aprovação e aprovados). É só auxílio visual: a trava
 * real é a do servidor.
 */
export type WashoutFixationOption = {
  Key: string;
  Text: string;
  Price: number;
  Remaining: number;
};

/** Estado do diálogo "Registrar Washout" (viewModel>/washout). */
export type WashoutDialogState = {
  contractKey: string;
  isPaf: boolean;
  fixations: WashoutFixationOption[];
  priceFixationKey: string;
  contractPrice: number;
  fixedVolume: number;
  unfixedVolume: number;
  marketPrice: number;
  penaltyAmount: number;
  amount: number;
  dueDate: Date | null;
  reason: string;
  availablePhysical: number;
  availableToRelease: number;
  availableToPricing: number;
};

/** Estado do diálogo de estorno (viewModel>/washoutReverse). */
export type WashoutReverseState = {
  key: string;
  summary: string;
  reason: string;
};
