

export default {
	formatValue: (value: string) => {
		return value?.toUpperCase();
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
    console.log(value);
    if (!value) return "";
    const date = new Date(value); // o JS aceita micros sem problema
    return date.toLocaleDateString("pt-BR"); // 19/11/2025
  },
  
  formatOperation: (value: string) => {
    switch (value){
      case "IN":
        return "ENTRADA"
      case "OUT":
        return "SAIDA"
      case "NONE":
        return "PESAGEM"
      default:
        return ""
    }
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
    m.set("QualityLoss", "Quebra Técnica");
    m.set("SalesShipment", "Venda");
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
};
