

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

  formatPriceFixationStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "Pendente");
    m.set("Confirmed", "Confirmado");
    m.set("Canceled", "Cancelado");
    m.set("InApproval", "Em Aprovação");
    
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

  formatMarketType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Internal" , "Interno");
    m.set("External" , "Exportação");
    
    return m.get(value);
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
    m.set("Cancelled", "Cancelado");
    m.set("Paused", "Pausado")
    
    return m.get(value);
  },

  stateShipmentReleaseStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Pending", "None");
    m.set("Actived", "Success");
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
    
    return m.get(value);
  },

};
