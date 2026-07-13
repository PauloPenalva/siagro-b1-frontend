export type SystemInfo = {
  application: string,
  version: string,
  environment: string,
  requiresAuthentication: boolean,
  authenticationMethods: string[],
  supports: string[],
  timestamp: string,
  companyName: string,
}
