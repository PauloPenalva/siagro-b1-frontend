

export default {
	formatValue: (value: string) => {
		return value?.toUpperCase();
	},

  formatYesNo: (value: string) => {
    if (!value) return "" 

    const m = new Map<string, string>();
    m.set("Y", "Sim");
    m.set("N", "Não");
    
    return m.get(value);
  },

  formatDecimal: (
    number: number | string, 
    decimals: number = 4,
    useGrouping = true,
    locale = 'pt-BR'
  ): string  => {
    const num = typeof number === 'string' ? parseFloat(number) : number;
    
    if (isNaN(num)) {
        throw new Error('O valor fornecido não é um número válido');
    }
    
    return num.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: useGrouping
    });
  },

  formatCnpj: (value: string) => {
    if (!value) return "";

    const digits = value.toString().replace(/\D/g, '');

    if (digits.length <= 11) {
      // CPF
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
        .substring(0, 14); // limita ao formato completo
    } else if (digits.length == 14) {
      // CNPJ
      return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .substring(0, 18); // limita ao formato completo
    } else {
      return value;
    }
  },

  formatDate: (value: string) => {
    if (!value) return "";
    const date = new Date(value); // o JS aceita micros sem problema
    return date.toLocaleDateString("pt-BR"); // 19/11/2025
  },

  formatDateTime: (value: string) => {
    if (!value) return "";
    // Mesma razão do formatDate: o datetime2 do SQL Server serializa 7 casas de
    // fração de segundo, que o sap.ui.model.odata.type.DateTimeOffset rejeita sem
    // a faceta Precision. O Date do JS aceita.
    const date = new Date(value);
    return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`; // 19/11/2025 15:34
  },

  formatDateISO: (dataISO: string): string => {
    if (!dataISO) return "";
    
    // Cria um objeto Date a partir da string ISO 8601
    const data = new Date(dataISO);
    
    // Verifica se a data é válida
    if (isNaN(data.getTime())) {
      throw new Error('Data inválida');
    }
    
    // Extrai dia, mês e ano
    const dia = data.getDate().toString().padStart(2, '0');
    const mes = (data.getMonth() + 1).toString().padStart(2, '0'); // Mês começa em 0
    const ano = data.getFullYear();
    
    // Retorna no formato DD/MM/YYYY
    return `${dia}/${mes}/${ano}`;
  },

  formatTime: (value: string): string =>  {
    if (!value) return "";
    
    // Divide a string pelos dois pontos
    const partes = value.split(':');
    
    // Se não tiver pelo menos horas e minutos, retorna o original
    if (partes.length < 2) {
      return value;
    }
    
    // Pega horas e minutos
    const horas = partes[0];
    const minutos = partes[1];
    
    // Pega os segundos (que podem ter milissegundos)
    const segundosComMilissegundos = partes[2] || '00';
    
    // Remove os milissegundos pegando apenas a parte inteira dos segundos
    const segundos = segundosComMilissegundos.split('.')[0];
  
    // Formata no padrão HH:mm:ss
    return `${horas.padStart(2, '0')}:${minutos.padStart(2, '0')}:${segundos.padStart(2, '0')}`;
  },
  
  formatOperation: (value: string) => {
   const m = new Map<string, string>();
    m.set("Receipt", "Entrada");
    m.set("Shipment", "Saída");
    
    return m.get(value);
  },

  formatWarehouseType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Owner", "Próprio");
    m.set("ThirdParty", "Terceiro");
    
    return m.get(value);
  },

  /**
   * Valor financeiro da fixação (volume × preço). É o número que a diretoria
   * de fato aprova — nem volume nem preço isolados dizem o tamanho do compromisso.
   */
  formatFixationTotal: (volume: number | string, price: number | string) => {
    const total = Number(volume ?? 0) * Number(price ?? 0);

    // Sem targetType 'any' na parte do binding, o modelo v4 entrega o valor já
    // formatado em pt-BR ("10.000,000") e Number() devolve NaN. Preferimos vazio
    // a estampar "NaN" na tela de aprovação da diretoria.
    if (!Number.isFinite(total)) {
      return "";
    }

    return total.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  },

  /**
   * Peso líquido da conferência de entrega: quantidade entregue menos o desconto de
   * quebra. Calculado no cliente (e não lido do servidor) para acompanhar a digitação
   * antes de salvar o encerramento.
   *
   * As partes do binding precisam de targetType 'any': sem ele o modelo v4 entrega o
   * decimal já formatado em pt-BR ("1.000,000") e Number() devolve NaN — mesma
   * armadilha documentada em formatFixationTotal.
   */
  formatNetQuantity: (delivered: number | string, loss: number | string) => {
    const net = Number(delivered ?? 0) - Number(loss ?? 0);

    if (!Number.isFinite(net)) {
      return "";
    }

    return net.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  },

  /**
   * Diferença da conferência de entrega: o que foi entregue menos o que foi faturado.
   * Fica negativa quando chegou menos do que a nota diz, que é o caso comum de quebra.
   * Existe como coluna persistida no banco (DeliveryDifference, computed column), mas na
   * tela é calculada no cliente para acompanhar a digitação de Qtd.Entregue — a coluna do
   * servidor só mudaria depois de salvar. As duas fórmulas precisam andar juntas.
   *
   * Entrega ainda não conferida (zerada e em aberto) devolve 0, e não a quantidade inteira
   * negativa: ali não há divergência apurada, só falta digitar.
   *
   * Mesma armadilha de formatNetQuantity: sem targetType 'any' nas partes do binding, o
   * modelo v4 entrega o decimal já formatado em pt-BR e Number() devolve NaN.
   */
  formatDeliveryDifference: (
    delivered: number | string,
    quantity: number | string,
    deliveryStatus: string
  ) => {
    const deliveredQuantity = Number(delivered ?? 0);

    const difference = deliveredQuantity === 0 && deliveryStatus === "Open"
      ? 0
      : deliveredQuantity - Number(quantity ?? 0);

    if (!Number.isFinite(difference)) {
      return "";
    }

    return difference.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  },

  formatPriceFixationStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("InApproval", "Em Aprovação");
    m.set("Confirmed", "Confirmado");
    m.set("Canceled", "Estornado");
    m.set("Rejected", "Rejeitado");

    return m.get(value);
  },

  formatContractStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Draft"     , "Rascunho");
    m.set("Approved"  , "Aprovado");
    m.set("Finished"  , "Finalizado");
    m.set("Canceled"  , "Cancelado");
    m.set("InApproval", "Em Aprovação");
    m.set("Rejected"  , "Rejeitado");
    
    return m.get(value);
  },

  stateContractStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Draft"     , "None");
    m.set("Approved"  , "Success");
    m.set("Finished"  , "Information");
    m.set("Canceled"  , "Error");
    m.set("Rejected"  , "Error");
    m.set("InApproval", "Warning");
    
    return m.get(value);
  },

  formatContractType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Fixed", "FIX - Preço Fixo");
    m.set("ToBeDetermined", "PAF - Preço a Fixar");
    
    return m.get(value);
  },

  formatFreightTerms: (value: string) => {
    const m = new Map<string, string>();
    m.set("Cif" , "CIF");
    m.set("Fob" , "FOB");
    m.set("None", "SEM FRETE");
    
    return m.get(value);
  },

  formatCurrency: (value: string) => {
    const m = new Map<string, string>();
    m.set("Brl" , "BRL");
    m.set("Usd" , "USD");
    
    return m.get(value);
  },

  formatCurrencySymbol: (value: string) => {
    const m = new Map<string, string>();
    m.set("Brl" , "R$");
    m.set("Usd" , "$");
    
    return m.get(value);
  },

  formatMarketType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Internal" , "Interno");
    m.set("External" , "Exportação");
    
    return m.get(value);
  },

  formatSalesContractAllocationOrigin: (value: string) => {
    const m = new Map<string, string>();
    m.set("Billing", "Faturamento");
    m.set("Reallocation", "Realocação");
    m.set("Return", "Devolução");
    m.set("Backfill", "Migração");
    m.set("Reconciliation", "Conciliação");

    return m.get(value) ?? value;
  },

  formatPriceDifferenceState: (value: number | string) => {
    // OData v4 serializa Edm.Decimal como string — coagir antes de comparar.
    const n = Number(value);
    if (!n) return "None";
    return n > 0 ? "Success" : "Error";
  },

  formatStorageTransactionType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Receipt", "Entrada");
    m.set("Shipment", "Saída");
    m.set("TechnicalLoss", "Quebra Técnica");
    m.set("SalesShipment", "Venda");
    m.set("SalesShipmentReturn", "Dev.Venda");
    m.set("Purchase", "Compra");
    m.set("PurchaseReturn", "Dev.Compra");
    m.set("PurchaseQtyComplement", "Compl.Qtd.");
    m.set("PurchasePriceComplement", "Compl.Preço");
    
    return m.get(value);
  },

  formatStorageTransactionStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "Pendente");
    m.set("Confirmed", "Confirmado");
    m.set("Cancelled", "Cancelado");
    m.set("Invoiced", "Faturado");
    
    return m.get(value);
  },

  stateStorageTransactionStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "None");
    m.set("Confirmed", "Information");
    m.set("Invoiced", "Success");
    m.set("Cancelled", "Error");
    
    return m.get(value);
  },

  formatOwnershipTransferStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Open", "Em Aberto");
    m.set("Closed", "Encerrado");
    m.set("Cancelled", "Cancelado");
    
    return m.get(value);
  },

  stateOwnershipTransferStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Open", "None");
    m.set("Closed", "Information");
    m.set("Cancelled", "Error");
    
    return m.get(value);
  },

  formatShipmentReleaseStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "Pendente");
    m.set("Actived", "Ativo");
    m.set("Completed", "Finalizado");
    m.set("Cancelled", "Cancelado");
    m.set("Paused", "Pausado")

    return m.get(value);
  },

  stateShipmentReleaseStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "None");
    m.set("Actived", "Success");
    m.set("Completed", "Information");
    m.set("Cancelled", "Error");
    m.set("Paused", "Information");

    return m.get(value);
  },

  formatSalesInvoiceStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "Pendente");
    m.set("Confirmed", "Confirmada");
    m.set("Cancelled", "Cancelada");
    m.set("Returned", "Retornada");
    
    return m.get(value);
  },

  stateSalesInvoiceStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "None");
    m.set("Confirmed", "Success");
    m.set("Cancelled", "Error");
    m.set("Returned", "Warning");
    
    return m.get(value);
  },

  formatSalesInvoiceType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Normal", "Normal");
    m.set("Return", "Retorno");
    
    return m.get(value);
  },

  formatCardType: (value: string) => {
    const m = new Map<string, string>();
    m.set("C", "Cliente");
    m.set("S", "Fornecedor");
    
    return m.get(value);
  },

  formatTransactionCode: (value: string) => {
    const m = new Map<string, string>();
    m.set("PurchaseContract", "Contrato de Compra");
    m.set("WeighingTicket", "Ticket de Pesagem");
    m.set("StorageAddress", "Lote de Armazenagem");
    m.set("StorageTransaction", "Romaneio");
    m.set("ShippingOrder", "Ordem de Carregamento");
    m.set("SalesContract", "Contrato de Venda");
    m.set("SalesInvoice", "Documento de Saída");
    m.set("OwnershipTransfer", "Transferencia Propriedade");
    m.set("StorageInvoice", "Fatura de Serviço");
    
    return m.get(value);
  },

   formatStorageInvoiceStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Open", "Em Aberto");
    m.set("Closed", "Encerrado");
    m.set("Cancelled", "Cancelado");
    
    return m.get(value);
  },

  stateStorageInvoiceStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Closed", "Error");
    m.set("Open", "Success");
    m.set("Cancelled", "None");
    
    return m.get(value);
  },

  formatWeighTicketStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Waiting", "Aguardando");
    m.set("Processing", "Em Processo");
    m.set("Complete", "Completo");
    m.set("Cancelled", "Cancelado");
    
    return m.get(value);
  },

  stateWeighTicketStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Waiting"   , "None");
    m.set("Canceled"  , "Error");
    m.set("Complete"  , "Success");
    m.set("Processing", "Information");

    return m.get(value);
  },

  /**
   * Rótulo do campo no log de alterações do contrato. O backend grava o código
   * (ContractChangeLogFields), não o texto - a tradução é aqui para não travar o i18n.
   * Código desconhecido cai para ele mesmo: linha antiga nunca fica em branco.
   */
  formatContractChangeLogField: (value: string) => {
    const m = new Map<string, string>();
    m.set("DeliveryLocation", "Local de entrega");
    m.set("Attachment", "Anexo");
    m.set("PriceFixation", "Fixação de preço");
    // Singular: é a coleção de comentários do Detail (CommentEntries). Não confundir com
    // "Comments" abaixo, que é a observação do cabeçalho.
    m.set("Comment", "Comentário");
    // Legado: a observação já foi editável depois de aprovada e deixou linhas gravadas.
    // Hoje ela só muda em rascunho, mas as linhas antigas precisam continuar legíveis.
    m.set("Comments", "Observação");

    return m.get(value) ?? value;
  },

  // ---------------------------------------------------------------------------
  // Notificação por WhatsApp
  // ---------------------------------------------------------------------------

  formatActive: (value: boolean) => (value ? "Ativo" : "Inativo"),

  stateActive: (value: boolean) => (value ? "Success" : "None"),

  /**
   * Curto de propósito ("Compra"/"Venda"): a coluna já se chama Tipo e está numa tela de
   * contratos, então "Contrato de" só empurrava as colunas seguintes para fora da tela.
   * O texto longo, esse sim, aparece no cabeçalho da mensagem de WhatsApp (backend).
   */
  formatNotificationDocumentType: (value: string) => {
    const m = new Map<string, string>();
    m.set("PurchaseContract", "Compra");
    m.set("SalesContract", "Venda");

    return m.get(value) ?? value;
  },

  /**
   * Evento que originou a notificação. O backend grava o enum; a tradução fica aqui, como
   * no resto do projeto. Valor desconhecido cai para ele mesmo, para que uma linha antiga
   * nunca apareça em branco.
   */
  formatNotificationEventType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Created", "Incluído");
    m.set("HeaderUpdated", "Alterado");
    m.set("SentForApproval", "Enviado para aprovação");
    m.set("Approved", "Aprovado");
    m.set("Rejected", "Rejeitado");
    m.set("Canceled", "Cancelado");
    m.set("Closed", "Encerrado");
    m.set("Reopened", "Reaberto");
    m.set("ApprovalWithdrawn", "Aprovação retirada");
    m.set("PriceFixationCreated", "Fixação de preço incluída");
    m.set("PriceFixationApproved", "Fixação de preço aprovada");
    m.set("PriceFixationRejected", "Fixação de preço rejeitada");
    // Estornada, não cancelada: a fixação volta para "Em aprovação".
    m.set("PriceFixationReversed", "Fixação de preço estornada");

    return m.get(value) ?? value;
  },

  formatNotificationOutboxStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "Pendente");
    m.set("Sent", "Enviada");
    m.set("PartiallySent", "Enviada parcialmente");
    m.set("Failed", "Falhou");
    // Ignorada não é erro: ou nenhum grupo assinava o evento, ou o envio está desligado.
    m.set("Skipped", "Ignorada");

    return m.get(value) ?? value;
  },

  stateNotificationOutboxStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "Information");
    m.set("Sent", "Success");
    m.set("PartiallySent", "Warning");
    m.set("Failed", "Error");
    m.set("Skipped", "None");

    return m.get(value) ?? "None";
  },

  formatNotificationDeliveryStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Sent", "Enviado");
    m.set("Failed", "Falhou");
    m.set("Skipped", "Ignorado");

    return m.get(value) ?? value;
  },

  stateNotificationDeliveryStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Sent", "Success");
    m.set("Failed", "Error");
    m.set("Skipped", "None");

    return m.get(value) ?? "None";
  },

  /**
   * Iniciais para o avatar: primeira letra do primeiro e do último nome.
   *
   * Partículas ("da", "de", "dos"...) são ignoradas - "João da Silva" precisa render "JS", e não
   * "JD". O `Avatar` do UI5 aceita no máximo duas letras.
   */
  formatInitials: (fullName?: string): string => {
    const particles = ["da", "de", "do", "das", "dos", "e"];

    const parts = (fullName ?? "")
      .trim()
      .split(/\s+/)
      .filter(part => part.length > 0 && !particles.includes(part.toLowerCase()));

    if (parts.length === 0) {
      return "";
    }

    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";

    return (first + last).toUpperCase();
  },
};
