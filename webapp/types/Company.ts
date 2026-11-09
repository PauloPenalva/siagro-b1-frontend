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
  ShowHomeDashboard: boolean;
};

/** Retorno da action `CompaniesTestConnection`. */
export type CompanyTestConnectionResult = {
  Success: boolean;
  Message: string;
  Server: string;
  Database: string;
  PendingMigrations: string[];
};

/** GET /api/companies/current/home: como a home da empresa da sessão deve abrir. */
export type CompanyHome = {
  showHomeDashboard: boolean;
  hasLogo: boolean;
};
