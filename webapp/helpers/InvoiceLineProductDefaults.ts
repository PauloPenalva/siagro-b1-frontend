/**
 * Padrões da linha do documento (entrada/saída) que vêm do PRODUTO escolhido: unidade de medida e conta contábil.
 * Pedido de 22/10: trocar o produto sobrescreve os dois, porque pertencem ao produto.
 */
export interface LineProductDefaults {
  /** Unidade a gravar; ausente = não mexer na linha (nem o complemento nem o sistema têm unidade). */
  UnitOfMeasureCode?: string;
  /** Conta contábil a gravar; ausente = produto sem conta (em SAPB1 sempre), a linha mantém a que tem. */
  LedgerAccountCode?: string;
}

/**
 * Unidade: a comercial do complemento do produto e, sem ela, a padrão do sistema. Conta: a do produto, só se houver.
 * Valores só com espaços contam como vazios.
 */
export function lineProductDefaults(
  commercialUnit?: string, systemDefaultUnit?: string, productLedgerAccount?: string
): LineProductDefaults {
  const unit = (commercialUnit ?? "").trim() || (systemDefaultUnit ?? "").trim();
  const ledger = (productLedgerAccount ?? "").trim();
  const result: LineProductDefaults = {};
  if (unit) {
    result.UnitOfMeasureCode = unit;
  }
  if (ledger) {
    result.LedgerAccountCode = ledger;
  }
  return result;
}
