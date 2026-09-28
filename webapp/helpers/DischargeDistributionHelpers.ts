/**
 * Rateio do ticket de descarga entre as linhas dos documentos de saída (GAC-1171, rateio).
 *
 * O ticket pesa o caminhão inteiro, e a carga pode ter vários documentos de saída: o peso do papel
 * é rateado entre as linhas, proporcional ao que foi faturado e não voltou. Mesma regra do
 * `ShipmentLoadDischargeRules` do backend: 3 casas, tolerância 0,001, e a soma fecha com o ticket.
 */

export const DISTRIBUTION_TOLERANCE = 0.001;

/** Linha de documento de saída como o `$expand=Items` de `/ShipmentLoads(...)/Invoices` a entrega. */
export type LoadInvoiceItem = {
  Key: string;
  ItemCode?: string;
  ItemName?: string;
  Quantity?: number | string;
  ReturnedQuantity?: number | string;
  TicketDeliveredQuantity?: number | string;
  SalesContract?: { Code?: string };
};

/** Documento de saída da carga. Enum do OData v4 chega como string ("Normal", "Confirmed"). */
export type LoadInvoice = {
  Key: string;
  InvoiceNumber?: string;
  InvoiceType?: string;
  InvoiceStatus?: string;
  Items?: LoadInvoiceItem[];
};

/** Linha do grid de rateio. `share` (Peso Rateado) é o único campo editável. */
export type DistributionLine = {
  salesInvoiceKey: string;
  salesInvoiceItemKey: string;
  invoiceNumber: string;
  contractCode: string;
  itemText: string;
  quantity: number;
  returnedQuantity: number;
  /** Faturado que não voltou: a base do rateio. */
  remainingQuantity: number;
  /** Peso de ticket que a linha já recebeu de OUTROS tickets. */
  otherTickets: number;
  share: number;
};

export type DistributionSummary = { distributed: number; remaining: number; closed: boolean };

/** O resumo e o texto da faixa "Rateado X de Y". */
export type DistributionInfo = DistributionSummary & { text: string };

/** Número em 3 casas. Edm.Decimal chega como STRING, e o que não é número vira 0. */
export function round3(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
}

const formatWeight = (value: number): string =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/**
 * Rateia `total` proporcionalmente a `bases`, em 3 casas. Cada parcela é TRUNCADA, e o resíduo vai
 * para a última linha com base positiva: nenhuma parcela fica negativa e a soma fecha exatamente com
 * o total. Sem total ou sem base, nada é rateado.
 */
export function distributeProportionally(total: number, bases: number[]): number[] {
  const amount = round3(total);
  const weights = bases.map(base => Math.max(0, round3(base)));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map(() => 0);

  if (!(amount > 0) || !(weightSum > 0)) return shares;

  let last = -1;
  weights.forEach((weight, index) => {
    if (weight > 0) last = index;
  });

  let allocated = 0;

  weights.forEach((weight, index) => {
    if (weight <= 0 || index === last) return;

    // O epsilon protege do 332,9999999 do ponto flutuante, que o floor transformaria em 332.
    const share = Math.floor((amount * weight / weightSum) * 1000 + 1e-6) / 1000;
    shares[index] = share;
    allocated = round3(allocated + share);
  });

  shares[last] = round3(amount - allocated);

  return shares;
}

export function summarizeDistribution(total: number, shares: number[]): DistributionSummary {
  const distributed = round3(shares.reduce((sum, share) => sum + round3(share), 0));
  const remaining = round3(round3(total) - distributed);

  return { distributed, remaining, closed: Math.abs(remaining) <= DISTRIBUTION_TOLERANCE };
}

export function describeDistribution(total: number, shares: number[]): DistributionInfo {
  const summary = summarizeDistribution(total, shares);
  const head = `Rateado ${formatWeight(summary.distributed)} de ${formatWeight(round3(total))}.`;

  if (summary.closed) return { ...summary, text: head };

  const tail = summary.remaining > 0
    ? `Falta distribuir ${formatWeight(summary.remaining)}.`
    : `Excede em ${formatWeight(-summary.remaining)}.`;

  return { ...summary, text: `${head} ${tail}` };
}

/**
 * Linhas elegíveis ao ticket: documento Normal e Confirmado, com faturado que não voltou — a mesma
 * elegibilidade que o servidor confere (`ShipmentLoadDischargeRules.ResolveLinesAsync`).
 *
 * `ownShares` é o rateio gravado do ticket em edição (chave = linha da nota): preenche o Peso
 * Rateado e é descontado do "Já descarregado", que mostra só o que veio de OUTROS tickets.
 */
export function buildDistributionLines(
  invoices: LoadInvoice[],
  ownShares: Map<string, number> = new Map<string, number>()
): DistributionLine[] {
  const lines: DistributionLine[] = [];

  invoices
    .filter(invoice => invoice.InvoiceType === "Normal" && invoice.InvoiceStatus === "Confirmed")
    .forEach(invoice => {
      (invoice.Items ?? []).forEach(item => {
        const quantity = round3(item.Quantity);
        const returnedQuantity = round3(item.ReturnedQuantity);
        const remainingQuantity = round3(quantity - returnedQuantity);

        if (remainingQuantity <= DISTRIBUTION_TOLERANCE) return;

        const own = ownShares.get(item.Key) ?? 0;

        lines.push({
          salesInvoiceKey: invoice.Key,
          salesInvoiceItemKey: item.Key,
          invoiceNumber: invoice.InvoiceNumber || "(sem número)",
          contractCode: item.SalesContract?.Code ?? "",
          itemText: `(${item.ItemCode ?? ""}) ${item.ItemName ?? ""}`.trim(),
          quantity,
          returnedQuantity,
          remainingQuantity,
          otherTickets: Math.max(0, round3(round3(item.TicketDeliveredQuantity) - own)),
          share: own,
        });
      });
    });

  return lines;
}

/** Por que não há linha elegível: a mensagem do diálogo que não abre. */
export function noEligibleLinesMessage(invoices: LoadInvoice[]): string {
  const normal = invoices.filter(invoice => invoice.InvoiceType === "Normal");

  if (normal.length === 0) {
    return "Esta carga ainda não tem documento de saída. O ticket de descarga é rateado entre os "
      + "documentos da carga.";
  }

  if (normal.every(invoice => invoice.InvoiceStatus === "Cancelled")) {
    return "Todos os documentos de saída desta carga estão cancelados.";
  }

  // Só manda confirmar quando há o que confirmar: nota Retornada não está "não confirmada", voltou.
  if (!normal.some(invoice => invoice.InvoiceStatus === "Confirmed")
    && normal.some(invoice => invoice.InvoiceStatus === "Pending")) {
    return "Nenhum documento de saída desta carga está confirmado. Confirme o documento antes de "
      + "registrar a descarga.";
  }

  return "Os documentos de saída confirmados desta carga foram devolvidos por inteiro. Não há "
    + "quantidade entregue para registrar descarga.";
}
