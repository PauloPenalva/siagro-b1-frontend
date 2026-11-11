/**
 * Detalhe do Lote de Armazenagem (GAC-1198): os romaneios do lote numa tabela só, com a
 * classificação (uma lista de atributo + % por romaneio) virada em colunas.
 */

export type LotQualityInspection = {
  QualityAttribCode: string;
  Value: number;
  QualityAttrib?: { Code?: string; Name?: string };
};

export type LotTransaction = {
  Key: string;
  TransactionType: string;
  TransactionStatus: string;
  NetWeight: number;
  QualityInspections?: LotQualityInspection[];
  [property: string]: unknown;
};

/** Coluna de classificação: `property` é o campo da linha onde o percentual foi gravado. */
export type LotQualityAttrib = { code: string; name: string; property: string };

export type LotTotals = { receipts: number; shipments: number; technicalLoss: number; balance: number };

/**
 * O OData v4 entrega Edm.Decimal como TEXTO ("50000.000"). Convertido aqui porque a tabela ordena
 * pelo valor do modelo (em texto, "9" viria depois de "10") e o Excel precisa de número.
 */
const WEIGHT_FIELDS = ["GrossWeight", "DryingDiscount", "CleaningDiscount", "OthersDicount", "NetWeight"];

/**
 * Vira a classificação em colunas. O percentual vai para um campo `Quality<n>` da própria linha,
 * e não para um campo com o código do atributo: o código é digitado no cadastro e pode ter
 * caractere que quebra o caminho do binding ("/", ">", espaço).
 */
export function pivotLotTransactions(
  transactions: LotTransaction[]
): { rows: LotTransaction[]; attribs: LotQualityAttrib[] } {
  const names = new Map<string, string>();

  for (const transaction of transactions) {
    for (const inspection of transaction.QualityInspections ?? []) {
      const code = inspection.QualityAttribCode;
      const name = inspection.QualityAttrib?.Name;
      // Um romaneio sem o cadastro expandido não pode apagar o nome que outro já trouxe.
      if (name || !names.has(code)) names.set(code, name || code);
    }
  }

  const attribs: LotQualityAttrib[] = [...names.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((code, index) => ({ code, name: names.get(code), property: `Quality${index}` }));

  const propertyByCode = new Map(attribs.map((attrib) => [attrib.code, attrib.property]));

  const rows = transactions.map((transaction) => {
    const row: LotTransaction = { ...transaction };
    for (const field of WEIGHT_FIELDS) {
      if (row[field] != null) row[field] = Number(row[field]);
    }
    for (const inspection of transaction.QualityInspections ?? []) {
      row[propertyByCode.get(inspection.QualityAttribCode)] = Number(inspection.Value);
    }
    return row;
  });

  return { rows, attribs };
}

const COUNTED_STATUSES = ["Confirmed", "Invoiced"];
const RECEIPT_TYPES = ["Receipt", "ShipmentReleased", "SalesShipmentReturn"];
const SHIPMENT_TYPES = ["Shipment", "SalesShipment"];

/** Peso tem três casas: somar em milésimos inteiros evita o 0,1 + 0,2 = 0,30000000000000004. */
const toThousandths = (value: number) => Math.round((Number(value) || 0) * 1000);

/**
 * Totais do rodapé. Espelha `StorageAddress.TotalReceipt` / `TotalShipment` / `TotalQualityLoss`
 * do backend — mesmos tipos e mesmos status — para o saldo da tela bater com o da lista de lotes.
 * Mudou a regra lá, muda aqui.
 */
export function lotTotals(transactions: LotTransaction[]): LotTotals {
  let receipts = 0;
  let shipments = 0;
  let technicalLoss = 0;

  for (const transaction of transactions) {
    if (!COUNTED_STATUSES.includes(transaction.TransactionStatus)) continue;

    const weight = toThousandths(transaction.NetWeight);
    if (RECEIPT_TYPES.includes(transaction.TransactionType)) receipts += weight;
    else if (SHIPMENT_TYPES.includes(transaction.TransactionType)) shipments += weight;
    else if (transaction.TransactionType === "TechnicalLoss") technicalLoss += weight;
  }

  return {
    receipts: receipts / 1000,
    shipments: shipments / 1000,
    technicalLoss: technicalLoss / 1000,
    balance: (receipts - shipments - technicalLoss) / 1000,
  };
}
