/** Uma amostra do peso ao vivo, como o servidor a publica no SSE. */
export type LiveWeight = {
  weight: number;
  stable: boolean;
  online: boolean;
};

/** Resposta de POST /scales/{code}/capture. */
export type CaptureResult = {
  captureId: string;
  weight: number;
};
