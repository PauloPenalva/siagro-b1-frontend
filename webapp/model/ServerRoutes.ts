export default {
  login: '/security/auth/login',
  userInfo: '/security/auth/status',
  systemInfo: '/security/auth/info',
  logout: '/security/auth/logout',
  userMenu: '/security/auth/GetUserMenu',

  getBranchInfo: '/security/auth/GetBranchInfo',
  setDefaultBranch: '/security/auth/SetDefaultBranch',

  // Versão do frontend publicada no servidor - usada para detectar deploy novo.
  appVersion: '/security/app/version',
  
  businessPartners: '/odata/BusinessPartners',
  items: '/odata/Items',
  unitsOfMeasure: '/odata/UnitsOfMeasure',
  harvestSeasons: '/odata/HarvestSeasons',
  warehouses: '/odata/Warehouses',
  taxes: '/odata/Taxes',
  qualityAttrib: '/odata/QualityAttribs',
  logisticRegions: '/odata/LogisticRegions',
  agents: '/odata/Agents',
  truckDrivers: '/odata/TruckDrivers',
  trucks: '/odata/Trucks',
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

  salesContractsCopy: '/odata/SalesContractsCopy',
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

  storageTransactionCopy: '/StorageTransactionsCopy(...)',
}
