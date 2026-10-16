/** Item de `/security/auth/companies` (endpoint anônimo e REST: só código e nome, em camelCase). */
export type CompanyOption = {
  code: string;
  companyName: string;
};

/** Entidade OData `Companies`. A string de conexão chega MASCARADA do servidor; devolvê-la mascarada mantém a senha gravada. */
export type Company = {
  Code: string;
  CompanyName: string;
  ConnectionString: string;
  SapCompanyDb?: string;
};

/** Retorno da action `CompaniesTestConnection`. */
export type CompanyTestConnectionResult = {
  Success: boolean;
  Message: string;
  Server: string;
  Database: string;
  PendingMigrations: string[];
};
