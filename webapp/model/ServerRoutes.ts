export default {
  login: '/security/auth/login',
  userInfo: '/security/auth/status',
  systemInfo: '/security/auth/info',
  logout: '/security/auth/logout',
  userMenu: '/security/auth/GetUserMenu',

  getBranchInfo: '/security/auth/GetBranchInfo',
  setDefaultBranch: '/security/auth/SetDefaultBranch',

  // Recuperação de senha. Endpoints anônimos: o usuário chega neles sem sessão.
  forgotPassword: '/security/auth/forgot-password',
  validateResetToken: '/security/auth/reset-password/validate',
  resetPassword: '/security/auth/reset-password',

  // Perfil do próprio usuário. Sempre "me": o servidor resolve quem é pela sessão.
  myProfile: '/security/users/me/profile',
  myPhoto: '/security/users/me/photo',
  myTheme: '/security/users/me/theme',
  changePassword: '/security/users/me/change-password',

  // Espelhamento do cadastro de usuários do SAP (só responde quando Erp = SAPB1).
  usersSyncFromSap: '/UsersSyncFromSap(...)',

  // Versão do frontend publicada no servidor - usada para detectar deploy novo.
  appVersion: '/security/app/version',
  
  businessPartners: '/odata/BusinessPartners',
  items: '/odata/Items',
  // Complemento cadastral do item (UoM comercial + fator) — só exibição, não participa do
  // saldo/preço em KG, que continua sendo a fonte de verdade.
  itemsGetComplement: '/ItemsGetComplement(...)',
  itemsSetComplement: '/ItemsSetComplement(...)',
  unitsOfMeasure: '/odata/UnitsOfMeasure',
  harvestSeasons: '/odata/HarvestSeasons',
  warehouses: '/odata/Warehouses',
  taxes: '/odata/Taxes',
  qualityAttrib: '/odata/QualityAttribs',
  logisticRegions: '/odata/LogisticRegions',

  // Dual-mode: em SAPB1 o backend lê de OPRC/OACT (somente leitura); em STANDALONE,
  // das tabelas locais. O caminho é o mesmo nos dois modos.
  costCenters: '/odata/CostCenters',
  ledgerAccounts: '/odata/LedgerAccounts',

  // Notificação por WhatsApp. O log é somente leitura: as linhas nascem nos serviços de
  // mutação do contrato, na mesma transação da alteração.
  notificationGroups: '/odata/NotificationGroups',
  notificationGroupMembers: '/odata/NotificationGroupMembers',
  notificationGroupSubscriptions: '/odata/NotificationGroupSubscriptions',
  notificationOutboxMessages: '/odata/NotificationOutboxMessages',
  notificationDeliveryLogs: '/odata/NotificationDeliveryLogs',
  notificationOutboxResend: '/NotificationOutboxResend(...)',
  agents: '/odata/Agents',
  truckDrivers: '/odata/TruckDrivers',
  trucks: '/odata/Trucks',
  truckScales: '/odata/TruckScales',
  userTruckScales: '/odata/UserTruckScales',

  // Captura de peso. Fora do /odata: são endpoints de streaming e de comando, roteados no
  // Gateway por /scales.
  scaleLive: (code: string): string => `/scales/${encodeURIComponent(code)}/live`,
  scaleCapture: (code: string): string => `/scales/${encodeURIComponent(code)}/capture`,
  shipmentReleases: 'odata/ShipmentReleases',
  salesShipmentReleases: 'odata/SalesShipmentReleases',
  processingCosts: 'odata/ProcessingCosts',
  storageTransactions: 'odata/StorageTransactions',
  menuItems: 'odata/MenuItems',
  permissions: 'odata/Permissions',
  roles: 'odata/Roles',
  profiles: 'odata/Profiles',
  
  storageAddresses: 'odata/StorageAddresses',
  storageAddressesBalance: 'odata/StorageAddressesListOpenedByItem',
  
  purchaseContracts: '/odata/PurchaseContracts',
  purchaseContractsApproval: '/odata/PurchaseContractsApproval',
  purchaseContractsReject: '/odata/PurchaseContractsReject',
  purchaseContractsCancel: '/odata/PurchaseContractsCancel',
  purchaseContractsTotals: '/odata/PurchaseContractsTotals',
  purchaseContractsWithdrawApproval: '/odata/PurchaseContractsWithdrawApproval',
  purchaseContractsSendToApproval: '/odata/PurchaseContractsSendApproval',
  purchaseContractsCopy: '/odata/PurchaseContractsCopy',
  purchaseContractsClose: '/odata/PurchaseContractsClose',
  purchaseContractsReopen: '/odata/PurchaseContractsReopen',
  purchaseContractsRecalculateBalance: '/odata/PurchaseContractsRecalculateBalance',
  prePurchaseContractReport: '/reports/PrePurchaseContract',
  purchaseContractsByItemReport: '/reports/PurchaseContractsByItem',
  salesContractsByItemReport: '/reports/SalesContractsByItem',

  purchaseContractsPriceFixations: '/odata/PurchaseContractsPriceFixations',
  // Actions OData invocadas via ODataModel.bindContext — formato relativo à raiz
  // do serviço, com "(...)". Chamar por bindContext (e não jQuery.ajax) faz o modelo
  // reconhecer a mudança e atualizar a tela sem recarregar a rota.
  purchaseContractsPriceFixationCreate: '/PurchaseContractsPriceFixationCreate(...)',
  purchaseContractsPriceFixationDelete: '/PurchaseContractsPriceFixationDelete(...)',
  purchaseContractsPriceFixationApproval: '/PurchaseContractsPriceFixationApproval(...)',
  purchaseContractsPriceFixationReject: '/PurchaseContractsPriceFixationReject(...)',
  purchaseContractsPriceFixationCancel: '/PurchaseContractsPriceFixationCancel(...)',

  // Comentários do contrato: no Update/Delete a chave é a do COMENTÁRIO, não a do contrato.
  purchaseContractsCommentCreate: '/PurchaseContractsCommentCreate(...)',
  purchaseContractsCommentUpdate: '/PurchaseContractsCommentUpdate(...)',
  purchaseContractsCommentDelete: '/PurchaseContractsCommentDelete(...)',
  priceFixationReport: '/reports/PriceFixation',

  purchaseContractsAllocationsCreate: '/PurchaseContractsCreateAllocation(...)',
  purchaseContractsAllocationsDelete: '/PurchaseContractsDeleteAllocation(...)',

  salesContractsReallocationCreate: '/SalesContractsCreateReallocation(...)',
  salesContractsReallocationDelete: '/SalesContractsDeleteReallocation(...)',
  salesContractsRecalculateBalance: '/SalesContractsRecalculateBalance(...)',
  salesContractsRecalculateAllBalances: '/SalesContractsRecalculateAllBalances(...)',

  // Conciliação de saldos (tela ADMIN): lista os contratos negativos e os destinos
  // candidatos — inclusive os SEM liberação e SEM saldo, que a realocação operacional
  // esconde e que são justamente os que precisam receber o ajuste.
  // Mesmo sem parâmetros, o `(...)` é obrigatório: bindContext().invoke() exige binding
  // deferido ("The binding must be deferred"). Só quebra no browser.
  salesContractsNegativeBalances: '/SalesContractsGetNegativeBalances(...)',
  salesContractsReconciliationTargets: '/SalesContractsGetReconciliationTargets(...)',

  salesContractsCopy: '/odata/SalesContractsCopy',
  salesContractsClose: '/odata/SalesContractsClose',
  salesContractsReopen: '/odata/SalesContractsReopen',
  salesContractsWithdrawApproval: '/odata/SalesContractsWithdrawApproval',
  salesContractsSendToApproval: '/odata/SalesContractsSendApproval',
  salesContractsApproval: '/odata/SalesContractsApproval',
  salesContractsReject: '/odata/SalesContractsReject',
  salesContractsCancel: '/odata/SalesContractsCancel',
  salesContractsGetTotals: '/odata/SalesContractsGetTotals(key=$)',

  salesContractsPriceFixations: '/odata/SalesContractsPriceFixations',
  salesContractsPriceFixationCreate: '/SalesContractsPriceFixationCreate(...)',
  salesContractsPriceFixationDelete: '/SalesContractsPriceFixationDelete(...)',
  salesContractsPriceFixationApproval: '/SalesContractsPriceFixationApproval(...)',
  salesContractsPriceFixationReject: '/SalesContractsPriceFixationReject(...)',
  salesContractsPriceFixationCancel: '/SalesContractsPriceFixationCancel(...)',
  salesPriceFixationReport: '/reports/SalesPriceFixation',

  // Comentários do contrato: no Update/Delete a chave é a do COMENTÁRIO, não a do contrato.
  salesContractsCommentCreate: '/SalesContractsCommentCreate(...)',
  salesContractsCommentUpdate: '/SalesContractsCommentUpdate(...)',
  salesContractsCommentDelete: '/SalesContractsCommentDelete(...)',

  // Comentários do documento de saída: no Update/Delete a chave é a do COMENTÁRIO, não a do
  // documento.
  salesInvoicesCommentCreate: '/SalesInvoicesCommentCreate(...)',
  salesInvoicesCommentUpdate: '/SalesInvoicesCommentUpdate(...)',
  salesInvoicesCommentDelete: '/SalesInvoicesCommentDelete(...)',

  // Comentários do documento de ENTRADA: mesma regra da chave — no Update/Delete é a do
  // COMENTÁRIO, não a do documento.
  purchaseInvoicesCommentCreate: '/PurchaseInvoicesCommentCreate(...)',
  purchaseInvoicesCommentUpdate: '/PurchaseInvoicesCommentUpdate(...)',
  purchaseInvoicesCommentDelete: '/PurchaseInvoicesCommentDelete(...)',

  storageTransactionCopy: '/StorageTransactionsCopy(...)',
}
