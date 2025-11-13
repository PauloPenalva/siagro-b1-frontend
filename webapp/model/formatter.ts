

export default {
	formatValue: (value: string) => {
		return value?.toUpperCase();
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
  }
};
