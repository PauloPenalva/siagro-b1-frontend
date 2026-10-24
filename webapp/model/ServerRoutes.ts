export default {
  login: '/security/auth/login',
  // Painel da home (só STANDALONE; 404 em SAPB1).
  dashboard: '/reports/Dashboard',
  fiscalConference: '/reports/FiscalConference',
  // SPED Fiscal (só STANDALONE): POST baixa o TXT; POST /Check devolve as inconsistências.
  spedFiscal: '/reports/SpedFiscal',
  // EFD Contribuições (só STANDALONE): POST baixa o TXT; POST /Check devolve inconsistências e totais.
  efdContributions: '/reports/EfdContributions',
  // ECD / SPED Contábil (só STANDALONE): POST baixa o TXT; POST /Check devolve inconsistências e totais.
  ecd: '/reports/Ecd',
  ecdSettingsGet: '/odata/EcdSettingsGet',
  ecdSettingsSave: '/odata/EcdSettingsSave',
  // ECF / Lucro Real (só STANDALONE): POST baixa o TXT; POST /Check devolve inconsistências e totais por período.
  ecf: '/reports/Ecf',
  ecfSettingsGet: '/odata/EcfSettingsGet',
  ecfSettingsSave: '/odata/EcfSettingsSave',
  ecfPartners: '/odata/EcfPartners',
  ecfAdjustments: '/odata/EcfAdjustments',
  spedFiscalSettingsGet: '/odata/SpedFiscalSettingsGet',
  spedFiscalSettingsSave: '/odata/SpedFiscalSettingsSave',
  // EFD-Reinf (só STANDALONE): funções e ações OData por raiz de CNPJ.
  reinfSettingsGet: '/odata/ReinfSettingsGet',
  reinfSettingsSave: '/odata/ReinfSettingsSave',
  reinfContributors: '/odata/ReinfContributors()',
  reinfOverview: '/odata/ReinfOverview',
  reinfEvents: '/odata/ReinfEvents',
  reinfBatchXml: '/odata/ReinfBatchXml',
  reinfRegistrationSend: '/odata/ReinfRegistrationSend',
  reinfTransmit: '/odata/ReinfTransmit',
  reinfClose: '/odata/ReinfClose',
  reinfReopen: '/odata/ReinfReopen',
  reinfReleaseUnconfirmed: '/odata/ReinfReleaseUnconfirmed',
  reinfBatchQuery: '/odata/ReinfBatchQuery',
  fiscalKardex: '/reports/FiscalKardex',
  fiscalKardexBook: '/reports/FiscalKardex/Book',
  fiscalInventory: '/reports/FiscalInventory',
  fiscalInventoryBook: '/reports/FiscalInventory/Book',
  // Fechar/reabrir o mês do estoque fiscal (actions OData de topo; 400 com mensagem pt-BR na recusa).
  fiscalStockPeriodsClose: '/odata/FiscalStockPeriodsClose',
  fiscalStockPeriodsReopen: '/odata/FiscalStockPeriodsReopen',
  userInfo: '/security/auth/status',
  systemInfo: '/security/auth/info',
  logout: '/security/auth/logout',
  userMenu: '/security/auth/GetUserMenu',
  // Seleção de empresa no login (spec 2026-10-16). Anônimo: a tela ainda não tem sessão.
  loginCompanies: '/security/auth/companies',

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
  // Largura e ordem das colunas. A chave da tabela vai no CORPO do PUT, não na URL: ela contém
  // `::`, `--` e `/`, que dariam trabalho de escapar num segmento de rota.
  myTableLayouts: '/security/users/me/table-layouts',

  // Regra de ativação da tributação da NF-e STANDALONE (Erp STANDALONE + filial que emite NF-e).
  taxCalculationIsActive: '/TaxCalculationIsActive(...)',

  // Espelhamento do cadastro de usuários do SAP (só responde quando Erp = SAPB1).
  usersSyncFromSap: '/UsersSyncFromSap(...)',

  // Versão do frontend publicada no servidor - usada para detectar deploy novo.
  appVersion: '/security/app/version',
  
  businessPartners: '/odata/BusinessPartners',
  items: '/odata/Items',
  // Naturezas de operação (flags RequiresContract/CreatesFinancialDocument decidem a linha de "outra compra").
  usages: '/odata/Usages',
  branchs: '/odata/Branchs',
  // Complemento cadastral do item (UoM comercial + fator) — só exibição, não participa do
  // saldo/preço em KG, que continua sendo a fonte de verdade.
  itemsGetComplement: '/ItemsGetComplement(...)',
  itemsSetComplement: '/ItemsSetComplement(...)',
  // Baixas de royalty (ITS). Actions e function OData, invocadas via bindContext.
  royaltyWriteOffsCreate: '/RoyaltyWriteOffsCreate(...)',
  royaltyWriteOffsCancel: '/RoyaltyWriteOffsCancel(...)',
  royaltyBalanceTotals: '/RoyaltyBalanceTotals',
  salesContractsGetFiscalComplement: '/SalesContractsGetFiscalComplement(...)',
  salesContractsSetFiscalComplement: '/SalesContractsSetFiscalComplement(...)',
  unitsOfMeasure: '/odata/UnitsOfMeasure',
  harvestSeasons: '/odata/HarvestSeasons',
  warehouses: '/odata/Warehouses',
  // Complemento cadastral do armazém (participante / próprio). O flag "próprio" é consumido
  // também pelo value help de contrato da transferência de titularidade.
  warehousesGetComplement: '/WarehousesGetComplement(...)',
  warehousesSetComplement: '/WarehousesSetComplement(...)',
  warehousesGetOwnComplements: '/WarehousesGetOwnComplements(...)',
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
  truckCombinations: '/odata/TruckCombinations',
  truckCombinationsSave: '/odata/TruckCombinationsSave',
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
  // Cadastro de empresas (bancos do deploy) e teste da string de conexão (action via bindContext).
  companies: '/odata/Companies',
  companiesTestConnection: '/CompaniesTestConnection(...)',
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
  purchaseContractsSetSignatureStatus: '/odata/PurchaseContractsSetSignatureStatus',
  purchaseContractsReopen: '/odata/PurchaseContractsReopen',
  purchaseContractsRecalculateBalance: '/odata/PurchaseContractsRecalculateBalance',
  prePurchaseContractReport: '/reports/PrePurchaseContract',
  purchaseContractsByItemReport: '/reports/PurchaseContractsByItem',
  salesContractsByItemReport: '/reports/SalesContractsByItem',
  salesInvoicesByPeriodReport: '/reports/SalesInvoicesByPeriod',
  purchaseInvoicesByPeriodReport: '/reports/PurchaseInvoicesByPeriod',
  salesInvoiceItemsReport: '/reports/SalesInvoiceItems',
  purchaseInvoiceItemsReport: '/reports/PurchaseInvoiceItems',
  salesReturnsReport: '/reports/SalesReturns',
  shipmentLoadsByPeriodReport: '/reports/ShipmentLoadsByPeriod',
  salesShipmentReleasesByPeriodReport: '/reports/SalesShipmentReleasesByPeriod',
  shipmentReleasesByPeriodReport: '/reports/ShipmentReleasesByPeriod',
  salesShipmentsByPeriodReport: '/reports/SalesShipmentsByPeriod',
  storageRemittancesByPeriodReport: '/reports/StorageRemittancesByPeriod',
  storageCustodyByPeriodReport: '/reports/StorageCustodyByPeriod',
  purchaseFiscalReconciliationReport: '/reports/PurchaseFiscalReconciliation',
  contractPositionReport: '/reports/ContractPosition',
  contractMonthlyPositionReport: '/reports/ContractMonthlyPosition',
  funruralWithholdingReport: '/reports/FunruralWithholding',
  financialAccountStatementReport: '/reports/FinancialAccountStatement',
  financialPortfolioReport: '/reports/FinancialPortfolio',
  financialSettlementsReport: '/reports/FinancialSettlements',
  partnerStatementReport: '/reports/PartnerStatement',
  royaltyPendingReport: '/reports/RoyaltyPending',

  purchaseContractsPriceFixations: '/odata/PurchaseContractsPriceFixations',
  // Actions OData invocadas via ODataModel.bindContext — formato relativo à raiz
  // do serviço, com "(...)". Chamar por bindContext (e não jQuery.ajax) faz o modelo
  // reconhecer a mudança e atualizar a tela sem recarregar a rota.
  purchaseContractsPriceFixationCreate: '/PurchaseContractsPriceFixationCreate(...)',
  purchaseContractsPriceFixationDelete: '/PurchaseContractsPriceFixationDelete(...)',
  purchaseContractsPriceFixationApproval: '/PurchaseContractsPriceFixationApproval(...)',
  purchaseContractsPriceFixationReject: '/PurchaseContractsPriceFixationReject(...)',
  purchaseContractsPriceFixationCancel: '/PurchaseContractsPriceFixationCancel(...)',

  // Washout do contrato de compra, invocado por bindContext. Nas actions de decisão e de
  // estorno, Key é a chave do WASHOUT, não a do contrato.
  purchaseContractsWashoutCreate: '/PurchaseContractsWashoutCreate(...)',
  purchaseContractsWashoutApproval: '/PurchaseContractsWashoutApproval(...)',
  purchaseContractsWashoutReject: '/PurchaseContractsWashoutReject(...)',
  purchaseContractsWashoutReverse: '/PurchaseContractsWashoutReverse(...)',
  // Washout do contrato de venda (spec 2026-10-15). Nas actions de decisão e de estorno, Key é a chave do WASHOUT.
  salesContractsWashoutCreate: '/SalesContractsWashoutCreate(...)',
  salesContractsWashoutApproval: '/SalesContractsWashoutApproval(...)',
  salesContractsWashoutReject: '/SalesContractsWashoutReject(...)',
  salesContractsWashoutReverse: '/SalesContractsWashoutReverse(...)',

  // Comentários do contrato: no Update/Delete a chave é a do COMENTÁRIO, não a do contrato.
  purchaseContractsCommentCreate: '/PurchaseContractsCommentCreate(...)',
  purchaseContractsCommentUpdate: '/PurchaseContractsCommentUpdate(...)',
  purchaseContractsCommentDelete: '/PurchaseContractsCommentDelete(...)',
  priceFixationReport: '/reports/PriceFixation',
  // Extrato do contrato (conferência físico/fiscal/financeiro): + `/purchase|sales/{key}/print`.
  contractStatementReport: '/reports/ContractStatement',

  // Contratos para alocar o romaneio; perna de Expedição recebe só o contrato da liberação.
  purchaseContractsGetAvaiablesListForTransaction: '/PurchaseContractsGetAvaiablesListForTransaction(...)',
  purchaseContractsAllocationsCreate: '/PurchaseContractsCreateAllocation(...)',
  purchaseTransactionsChangeSupplier: '/PurchaseTransactionsChangeSupplier(...)',
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
  salesContractsSetSignatureStatus: '/odata/SalesContractsSetSignatureStatus',
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

  // NF-e STANDALONE no documento de saída: emitir, consultar, concluir a confirmação, XML e DANFE.
  salesInvoicesIssueNfe: '/odata/SalesInvoicesIssueNfe',
  salesInvoicesConsultNfe: '/odata/SalesInvoicesConsultNfe',
  salesInvoicesCompleteNfeConfirmation: '/odata/SalesInvoicesCompleteNfeConfirmation',
  salesInvoicesNfeXml: '/odata/SalesInvoicesNfeXml',
  danfeReport: '/reports/Danfe',
  // NF-e de devolução: "Devolver" cria a devolução própria (bindContext); os itens devolvíveis vêm por fetch.
  salesInvoicesCreateNfeReturn: '/SalesInvoicesCreateNfeReturn(...)',
  salesInvoicesNfeReturnableItems: '/odata/SalesInvoicesNfeReturnableItems',
  // Complemento de ICMS: cria o documento complementar de uma venda autorizada (bindContext).
  salesInvoicesCreateIcmsComplement: '/SalesInvoicesCreateIcmsComplement(...)',
  // NF-e do Documento de Entrada (entrada própria e devolução de compra).
  purchaseInvoicesIssueNfe: '/odata/PurchaseInvoicesIssueNfe',
  purchaseInvoicesConsultNfe: '/odata/PurchaseInvoicesConsultNfe',
  purchaseInvoicesCompleteNfeConfirmation: '/odata/PurchaseInvoicesCompleteNfeConfirmation',
  purchaseInvoicesNfeXml: '/odata/PurchaseInvoicesNfeXml',
  purchaseInvoicesDanfeReport: '/reports/Danfe/purchase-invoices',
  purchaseInvoicesCreateNfeReturn: '/PurchaseInvoicesCreateNfeReturn(...)',
  purchaseInvoicesCreateCounterNote: '/PurchaseInvoicesCreateCounterNote(...)',
  // Remessa para depósito em armazém de terceiro: emissão, resumo da liberação e reconciliação do retorno.
  shipmentReleasesCreateStorageRemittance: '/odata/ShipmentReleasesCreateStorageRemittance',
  shipmentReleasesStorageRemittanceSummary: '/odata/ShipmentReleasesStorageRemittanceSummary',
  // Notas de custódia em armazém próprio: gerar a nota do romaneio e resumo das etapas.
  storageTransactionsCreateCustodyDocument: '/odata/StorageTransactionsCreateCustodyDocument',
  storageTransactionsCustodySummary: '/odata/StorageTransactionsCustodySummary',
  purchaseInvoicesStorageReturnTransactions: '/odata/PurchaseInvoicesStorageReturnTransactions',
  purchaseInvoicesReconcileStorageReturn: '/odata/PurchaseInvoicesReconcileStorageReturn',
  purchaseInvoicesUndoStorageReturnReconciliation: '/odata/PurchaseInvoicesUndoStorageReturnReconciliation',
  purchaseInvoicesNfeReturnableItems: '/odata/PurchaseInvoicesNfeReturnableItems',
  // Complemento de valor próprio (spec 2026-10-14): itens das entradas próprias autorizadas do fornecedor e da filial.
  purchaseInvoicesGetComplementCandidates: '/odata/PurchaseInvoicesGetComplementCandidates',
  // Cancelamento da NF-e (evento 110111): ação com justificativa, conclusão da fase local e XML do evento.
  salesInvoicesCancelNfe: '/odata/SalesInvoicesCancelNfe',
  salesInvoicesCompleteNfeCancellation: '/odata/SalesInvoicesCompleteNfeCancellation',
  salesInvoicesNfeCancellationXml: '/odata/SalesInvoicesNfeCancellationXml',
  purchaseInvoicesCancelNfe: '/odata/PurchaseInvoicesCancelNfe',
  purchaseInvoicesCompleteNfeCancellation: '/odata/PurchaseInvoicesCompleteNfeCancellation',
  purchaseInvoicesNfeCancellationXml: '/odata/PurchaseInvoicesNfeCancellationXml',
  // Inutilização da numeração da NF-e rejeitada: ação com justificativa e XML do comprovante.
  salesInvoicesVoidNfeNumber: '/odata/SalesInvoicesVoidNfeNumber',
  salesInvoicesNfeVoidNumberXml: '/odata/SalesInvoicesNfeVoidNumberXml',
  purchaseInvoicesVoidNfeNumber: '/odata/PurchaseInvoicesVoidNfeNumber',
  purchaseInvoicesNfeVoidNumberXml: '/odata/PurchaseInvoicesNfeVoidNumberXml',

  // CC-e (evento 110110): envio com o texto, XML de cada carta e histórico (entity set somente leitura).
  salesInvoicesSendNfeCorrection: '/odata/SalesInvoicesSendNfeCorrection',
  salesInvoicesNfeCorrectionXml: '/odata/SalesInvoicesNfeCorrectionXml',
  salesInvoicesNfeCorrections: '/odata/SalesInvoicesNfeCorrections',
  purchaseInvoicesSendNfeCorrection: '/odata/PurchaseInvoicesSendNfeCorrection',
  purchaseInvoicesNfeCorrectionXml: '/odata/PurchaseInvoicesNfeCorrectionXml',
  purchaseInvoicesNfeCorrections: '/odata/PurchaseInvoicesNfeCorrections',
  // Envio manual do e-mail da NF-e (DANFE + XML); destinatários padrão e histórico são lidos por NfeEmailHelper.
  salesInvoicesSendNfeEmail: '/odata/SalesInvoicesSendNfeEmail',
  purchaseInvoicesSendNfeEmail: '/odata/PurchaseInvoicesSendNfeEmail',
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

  // CT-e de frete: vínculos com as NF-e Referenciada(s). No Add e no Relink a Key é a do CT-e; no Remove é a do VÍNCULO.
  purchaseInvoicesTransportedDocumentAdd: '/PurchaseInvoicesTransportedDocumentAdd(...)',
  purchaseInvoicesTransportedDocumentRemove: '/PurchaseInvoicesTransportedDocumentRemove(...)',
  purchaseInvoicesTransportedDocumentsRelink: '/PurchaseInvoicesTransportedDocumentsRelink(...)',

  // Minutas de contrato (assinatura eletrônica). As FUNCTIONS do EDM
  // (ContractDraftsListByContract, ContractDraftsGetBody, ContractDraftsDownloadPdf,
  // ContractDraftsRefreshState, ContractTemplatesListPlaceholders) não entram aqui: levam os
  // parâmetros na própria URL e são montadas no controller, com encodeURIComponent onde couber.
  contractTemplates: '/odata/ContractTemplates',
  companySignatories: '/odata/CompanySignatories',
  businessPartnerSignatories: '/odata/BusinessPartnerSignatories',

  // Function do EDM com retorno tipado: vem com envelope `{ value: [...] }` (ver `odataCollection`).
  // Lida por fetch (FetchHelpers), e não pelo ODataModel, com o parâmetro na própria URL.
  contractTemplatesListPlaceholders: '/odata/ContractTemplatesListPlaceholders',

  // FUNCTIONS das minutas, lidas por fetch/FetchHelpers com os parâmetros na própria URL.
  // Quem manda no formato da resposta é o TIPO DE RETORNO declarado no EDM, não o fato de o
  // controller ser [HttpGet]: ListByContract, GetBody e RefreshState têm retorno tipado, passam
  // pelo formatador do OData e vêm com envelope `{ value: … }` (ver `odataValue`); só o
  // DownloadPdf é `Returns<IActionResult>()` e responde o arquivo cru.
  contractDraftsListByContract: '/odata/ContractDraftsListByContract',
  contractDraftsGetBody: '/odata/ContractDraftsGetBody',
  contractDraftsDownloadPdf: '/odata/ContractDraftsDownloadPdf',
  contractDraftsRefreshState: '/odata/ContractDraftsRefreshState',

  contractDraftsCreate: '/ContractDraftsCreate(...)',
  contractDraftsUpdate: '/ContractDraftsUpdate(...)',
  contractDraftsDelete: '/ContractDraftsDelete(...)',
  contractDraftsSendToSignature: '/ContractDraftsSendToSignature(...)',
  contractDraftsCancel: '/ContractDraftsCancel(...)',

  storageTransactionCopy: '/StorageTransactionsCopy(...)',

  // financeiro
  financialAccounts: '/odata/FinancialAccounts',
  financialDocuments: '/odata/FinancialDocuments',
  financialDocumentsSettle: '/FinancialDocumentsSettle(...)',
  financialDocumentsReverseSettlement: '/FinancialDocumentsReverseSettlement(...)',
  financialDocumentsCancel: '/FinancialDocumentsCancel(...)',
  financialDocumentsSetDueDate: '/FinancialDocumentsSetDueDate(...)',
  financialAdvancesCreate: '/FinancialAdvancesCreate(...)',
  financialAdvancesRefund: '/FinancialAdvancesRefund(...)',
  financialAdvancesRelinkContract: '/FinancialAdvancesRelinkContract(...)',
  // Lançamentos, reconciliação e extrato da conta (spec 2026-10-19): chamados por sendJson.
  financialAccountEntries: '/odata/FinancialAccountEntries',
  financialAccountEntriesCreate: '/odata/FinancialAccountEntriesCreate',
  financialAccountTransfersCreate: '/odata/FinancialAccountTransfersCreate',
  financialAccountTransfers: '/odata/FinancialAccountTransfers',
  financialAccountsGetMovements: '/odata/FinancialAccountsGetMovements',
  financialAccountReconciliations: '/odata/FinancialAccountReconciliations',
  financialAccountReconciliationsOpen: '/odata/FinancialAccountReconciliationsOpen',
  financialAccountReconciliationsSetLines: '/odata/FinancialAccountReconciliationsSetLines',
  financialAccountReconciliationsClose: '/odata/FinancialAccountReconciliationsClose',
  financialAccountReconciliationsReopen: '/odata/FinancialAccountReconciliationsReopen',
  financialAccountReconciliationsDelete: '/odata/FinancialAccountReconciliationsDelete',
  financialAccountReconciliationsGetLines: '/odata/FinancialAccountReconciliationsGetLines',
  // Títulos firmes de compra (spec 2026-10-13): chamados por sendJson (erro de negócio nas três formas).
  financialDocumentsCompose: '/odata/FinancialDocumentsCompose',
  financialDocumentsUncompose: '/odata/FinancialDocumentsUncompose',
  financialDocumentsDation: '/odata/FinancialDocumentsDation',
  financialDocumentsNetting: '/odata/FinancialDocumentsNetting',
  financialDocumentsGetComposition: '/odata/FinancialDocumentsGetComposition',
  financialDocumentsGetByContract: '/odata/FinancialDocumentsGetByContract',
  // Compensação de adiantamento no provisório (spec 2026-10-14): chamados por sendJson (recusa nas três formas).
  financialDocumentsApplyAdvance: '/odata/FinancialDocumentsApplyAdvance',
  financialDocumentsGetAdvanceCandidates: '/odata/FinancialDocumentsGetAdvanceCandidates',

  // Conferência de Saldo de Armazém (GAC-1164). Chamadas por fetch: o backend responde
  // BadRequest(string) e a mensagem de negócio precisa chegar inteira ao usuário.
  warehouseReconciliationsSendApproval: '/odata/WarehouseReconciliationsSendApproval',
  warehouseReconciliationsWithdrawApproval: '/odata/WarehouseReconciliationsWithdrawApproval',
  warehouseReconciliationsApproval: '/odata/WarehouseReconciliationsApproval',
  warehouseReconciliationsReject: '/odata/WarehouseReconciliationsReject',
  warehouseReconciliationsCancel: '/odata/WarehouseReconciliationsCancel',
  warehouseReconciliationsGetBalancePreview: '/odata/WarehouseReconciliationsGetBalancePreview',
  warehouseReconciliationsAttachmentsList: '/odata/WarehouseReconciliationsAttachmentsList',
  warehouseReconciliationsAttachmentUpload: '/odata/WarehouseReconciliationsAttachmentUpload',
  warehouseReconciliationsAttachmentsDownload: '/odata/WarehouseReconciliationsAttachmentsDownload',
  warehouseReconciliationsDistributeLoss: '/odata/WarehouseReconciliationsDistributeLoss',
  warehouseReconciliationsListReleases: '/odata/WarehouseReconciliationsListReleases',

  // Anexos da carga (GAC-1171): sem EntitySet no EDM de propósito — Function/actions dedicadas,
  // e o download é sempre por Key.
  shipmentLoadsAttachmentsList: '/odata/ShipmentLoadsAttachmentsList',
  shipmentLoadsAttachmentUpload: '/odata/ShipmentLoadsAttachmentUpload',
  shipmentLoadsAttachmentsDownload: '/odata/ShipmentLoadsAttachmentsDownload',

  // Recusa da carga com NF-e de entrada própria (spec 2026-10-09).
  shipmentLoadsPendingRefusal: (key: string): string => `/odata/ShipmentLoadsGetPendingRefusal(Key=${key})`,
  shipmentLoadsCancelRefusal: '/odata/ShipmentLoadsCancelRefusal',

  // NF-e STANDALONE (sub-projeto 2a).
  paymentConditions: '/odata/PaymentConditions',
  // Manifestação do destinatário (DF-e recebidos da SEFAZ).
  receivedDfes: '/odata/ReceivedDfes',
  receivedDfesSync: '/odata/ReceivedDfesSync',
  receivedDfesManifest: '/odata/ReceivedDfesManifest',
  receivedDfesXml: '/odata/ReceivedDfesXml',
  branchDfeSyncStates: '/odata/BranchDfeSyncStates',
  branchDfeSyncStatesSetSchedule: '/odata/BranchDfeSyncStatesSetSchedule',
  purchaseInvoicesLookup: '/odata/PurchaseInvoices',
  branchNfeSettingsGet: '/odata/BranchNfeSettingsGet',
  branchNfeSettingsSave: '/odata/BranchNfeSettingsSave',
  branchNfeSettingsUploadCertificate: '/odata/BranchNfeSettingsUploadCertificate',
  branchNfeSettingsTestConnection: '/odata/BranchNfeSettingsTestConnection',
  transportDocuments: '/odata/TransportDocuments',
  transportDocumentsSave: '/odata/TransportDocumentsSave',
  transportDocumentsImportNfe: '/odata/TransportDocumentsImportNfe',
  transportDocumentsDelete: '/odata/TransportDocumentsDelete',
  transportDocumentsConfirm: '/odata/TransportDocumentsConfirm',
  transportDocumentsReopen: '/odata/TransportDocumentsReopen',
  transportDocumentsDiscardNumber: '/odata/TransportDocumentsDiscardNumber',
  transportDocumentsTransmit: '/odata/TransportDocumentsTransmit',
  transportDocumentsConsult: '/odata/TransportDocumentsConsult',
  transportDocumentsCancel: '/odata/TransportDocumentsCancel',
  transportDocumentsSendCorrection: '/odata/TransportDocumentsSendCorrection',
  transportDocumentsXml: '/odata/TransportDocumentsXml',
  transportDocumentsEndorse: '/odata/TransportDocumentsEndorse',
  transportDocumentsResendEndorsementCancellation: '/odata/TransportDocumentsResendEndorsementCancellation',
  transportDocumentsGenerateTitle: '/odata/TransportDocumentsGenerateTitle',
  transportDocumentsSendEmail: '/odata/TransportDocumentsSendEmail',
  transportDocumentsTransmitBatch: '/odata/TransportDocumentsTransmitBatch',
  transportDocumentsEndorseBatch: '/odata/TransportDocumentsEndorseBatch',
  transportDocumentsXmlBatch: '/odata/TransportDocumentsXmlBatch',
  dacteBatchReport: '/reports/DacteBatch',
  dacteReport: '/reports/Dacte',
  branchCteSettingsGet: '/odata/BranchCteSettingsGet',
  branchCteSettingsSave: '/odata/BranchCteSettingsSave',
  cteNumbersToVoid: '/odata/CteNumbersToVoid',
  cteNumbersVoid: '/odata/CteNumbersVoid',
  transportDocumentsManifest: '/odata/TransportDocumentsManifest',
  transportManifests: '/odata/TransportManifests',
  mdfeEligibleCtes: '/odata/MdfeEligibleCtes',
  transportManifestsCreateFromCtes: '/odata/TransportManifestsCreateFromCtes',
  transportManifestsSave: '/odata/TransportManifestsSave',
  transportManifestsDelete: '/odata/TransportManifestsDelete',
  transportManifestsConfirm: '/odata/TransportManifestsConfirm',
  transportManifestsReopen: '/odata/TransportManifestsReopen',
  transportManifestsDiscardNumber: '/odata/TransportManifestsDiscardNumber',
  transportManifestsTransmit: '/odata/TransportManifestsTransmit',
  transportManifestsConsult: '/odata/TransportManifestsConsult',
  transportManifestsClose: '/odata/TransportManifestsClose',
  transportManifestsXml: '/odata/TransportManifestsXml',
  damdfeReport: '/reports/Damdfe',
  damdfeBatchReport: '/reports/DamdfeBatch',
  transportManifestsCancel: '/odata/TransportManifestsCancel',
  transportManifestsIncludeDriver: '/odata/TransportManifestsIncludeDriver',
  transportManifestsCloseBatch: '/odata/TransportManifestsCloseBatch',
  transportManifestsXmlZip: '/odata/TransportManifestsXmlZip',
  mdfeNotClosed: '/odata/MdfeNotClosed',
  branchMdfeSettingsGet: '/odata/BranchMdfeSettingsGet',
  branchMdfeSettingsSave: '/odata/BranchMdfeSettingsSave',
  branchTransportSettingsGet: '/odata/BranchTransportSettingsGet',
  branchTransportSettingsSave: '/odata/BranchTransportSettingsSave',
  branchTransportSettingsTestAverba: '/odata/BranchTransportSettingsTestAverba',
  accountingPeriodsGenerateYear: '/odata/AccountingPeriodsGenerateYear',
  accountingPeriodsSetStatus: '/odata/AccountingPeriodsSetStatus',
  accountingSettingsGet: '/odata/AccountingSettingsGet',
  accountingSettingsSave: '/odata/AccountingSettingsSave',
  journalEntries: '/odata/JournalEntries',
  standardPostings: '/odata/StandardPostings',
  standardPostingCatalog: '/odata/StandardPostingCatalogGet',
  journalEntriesReverse: '/odata/JournalEntriesReverse',
  offlinePostingRuns: '/odata/OfflinePostingRuns',
  accountingPeriodsCloseWarnings: '/odata/AccountingPeriodsCloseWarnings',
  resultClosingPreview: '/odata/AccountingResultClosingPreview',
  resultClosingRun: '/odata/AccountingResultClosingRun',
  resultClosingReverse: '/odata/AccountingResultClosingReverse',
  managementViews: '/odata/ManagementViews',
  incomeStatementReport: '/reports/AccountingIncomeStatement',
  incomeStatementReportData: '/reports/AccountingIncomeStatement/data',
  balanceSheetReport: '/reports/AccountingBalanceSheet',
  balanceSheetReportData: '/reports/AccountingBalanceSheet/data',
  accountingJournalReport: '/reports/AccountingJournal',
  accountingJournalReportData: '/reports/AccountingJournal/data',
  offlinePostingRequest: '/odata/OfflinePostingRequest',
  accountingLedgerReport: '/reports/AccountingLedger',
  accountingLedgerReportData: '/reports/AccountingLedger/data',
  accountingTrialBalanceReport: '/reports/AccountingTrialBalance',
  accountingTrialBalanceReportData: '/reports/AccountingTrialBalance/data',
  emailSettingsGet: '/odata/EmailSettingsGet',
  emailSettingsSave: '/odata/EmailSettingsSave',
  emailSettingsSendTest: '/odata/EmailSettingsSendTest',

  // Troca nota: romaneios de quebra/sobra de descarga (tela "Ajustes de Descarga").
  purchaseDischargesList: '/odata/PurchaseDischargesList',

  // Conciliação Fiscal de Compras: NF do fornecedor × romaneio de compra.
  purchaseFiscalReconciliationTransactions: '/odata/PurchaseFiscalReconciliationTransactions',
  purchaseFiscalReconciliationInvoiceLines: '/odata/PurchaseFiscalReconciliationInvoiceLines',
  purchaseFiscalReconciliationLinks: '/odata/PurchaseFiscalReconciliationLinks',
  purchaseFiscalReconciliationSuggest: '/odata/PurchaseFiscalReconciliationSuggest',
  purchaseFiscalReconciliationSave: '/odata/PurchaseFiscalReconciliationSave',
  purchaseFiscalReconciliationRemove: '/odata/PurchaseFiscalReconciliationRemove',
  purchaseFiscalReconciliationConfirm: '/odata/PurchaseFiscalReconciliationConfirm',
  purchaseFiscalReconciliationUnconfirm: '/odata/PurchaseFiscalReconciliationUnconfirm',
}
