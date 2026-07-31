export type SystemInfo = {
  application: string,
  version: string,
  environment: string,
  requiresAuthentication: boolean,
  authenticationMethods: string[],
  supports: string[],
  timestamp: string,
  companyName: string,
  /** Modo de integração do backend: "SAPB1" ou "STANDALONE". */
  erp: string,
}
