export default {
  login: '/security/auth/login',
  userInfo: '/security/auth/status',
  logout: '/security/auth/logout',

  getBranchInfo: '/security/auth/GetBranchInfo',
  setDefaultBranch: '/security/auth/SetDefaultBranch',
  
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
  processingCosts: 'odata/ProcessingCosts',
  storageTransactions: 'odata/StorageTransactions',
  
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
  
  purchaseContractsAllocationsCreate: '/PurchaseContractsCreateAllocation(...)',
  purchaseContractsAllocationsDelete: '/PurchaseContractsDeleteAllocation(...)',

  salesContractsCopy: '/odata/SalesContractsCopy',
  salesContractsWithdrawApproval: '/odata/SalesContractsWithdrawApproval',
  salesContractsSendToApproval: '/odata/SalesContractsSendApproval',
  salesContractsApproval: '/odata/SalesContractsApproval',
  salesContractsReject: '/odata/SalesContractsReject',
  salesContractsCancel: '/odata/SalesContractsCancel',
  salesContractsGetTotals: '/odata/SalesContractsGetTotals(key=$)',

  storageTransactionCopy: '/StorageTransactionsCopy(...)',
}
