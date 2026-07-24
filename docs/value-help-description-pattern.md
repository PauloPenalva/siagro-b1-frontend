# Substituição dos formatters que buscam descrição no backend

Registra o padrão validado e os bloqueios encontrados. A migração está concluída: os 67
bindings que usavam formatter `async` para buscar descrição no backend foram convertidos.

## O problema

O padrão original resolve "código → descrição" com um formatter `async` que faz uma
requisição REST por invocação:

```xml
<Input value="{CardCode}" valueHelpRequest=".openSuppliersValueHelp"/>
<Input value="{ parts: ['CardCode'], formatter: '.formatBusinessPartnerName' }" editable="false"/>
```

```ts
async formatBusinessPartnerName(key: string) {
  const data = await this.getResource<BusinessPartner>(`${this.api.businessPartners}('${key}')`);
  return data?.CardName;
}
```

Funciona — o UI5 resolve a Promise antes de aplicar o valor ao controle. O problema é custo:

- `getResource` (`controller/common/CommonController.ts`) cria um `RequestModel` novo a cada
  chamada e cai num `jQuery.get`, **fora** do modelo OData V4. Sem cache.
- Cada reavaliação do binding dispara nova requisição. Medido: abrir um contrato buscava
  `BusinessPartners('F024839')` três vezes.
- Dentro de `<t:template>` roda **uma vez por linha**, e o `sap.ui.table` recicla linhas no
  scroll, repetindo as chamadas.
- Cada formatter faz `setBusy(true/false)` na view inteira; com N chamadas concorrentes o
  primeiro retorno limpa o busy de todas.
- Falha vira `MessageBox.error` — em tabela, um modal por linha.

## O padrão validado

Há três situações. Identifique qual se aplica **antes** de mexer.

### Antes de tudo: duas armadilhas que só aparecem em produção

Descobertas convertendo a prioridade 2. Verifique **as duas** antes de mexer em qualquer campo.

**1. Tier 1 exige que o update service recalcule a coluna.** A coluna existir não basta — o
campo só fica correto se o backend a regravar quando o *código* mudar. Confira o serviço de
create **e** o de update, e olhe o dado real. Casos encontrados:

| Coluna | Create | Update | Veredito |
|---|---|---|---|
| `SalesInvoice.CardName` | ✅ | ✅ | converte |
| `SalesInvoice.DeliveryCardName` | ❌ | ❌ | `""` em 100% dos registros — não converte |
| `SalesInvoice.TruckingCompanyName` | ✅ | ❌ | fica velha ao editar — não converte |
| `SalesContract.CardName` / `ItemName` | ✅ | ✅ | converte |
| `SalesContract.AgentName` | ✅ | ❌ bug | `SalesContractsUpdateService.cs:37` grava em `entity` em vez de `existingEntity` |
| `StorageTransaction.CardName`/`ItemName`/`WarehouseName` | ✅ | ❌ | update não recalcula — não converte |
| `WeighingTicket.CardName` / `ItemName` | ✅ | ❌ | idem |

Se o campo do código for `editable="false"`, o risco some — o código não muda, a coluna não
desatualiza.

**2. Tier 2 não funciona em binding de entidade única sem `.Include` no backend.**
`GetByIdAsync` materializa com `FirstOrDefaultAsync`, e `[EnableQuery]` só aplica `$expand`
sobre `IQueryable`. Resultado: o `$expand` é aceito, aparece no `@odata.context`, e vem
`null`. A coleção funciona (`Get()` devolve `QueryAll()`), a entidade única não.

Por isso os Tier 2 de tabela (impostos, parâmetros de qualidade) sempre funcionaram: são
*collection bindings*. Formulários são *single-entity* e precisam do `.Include`:

```csharp
// SalesContractsGetService.GetByIdAsync
.Include(x => x.HarvestSeason)
.Include(x => x.LogisticRegion)
```

Correção aditiva (só eager loading), aplicada e verificada em `SalesContractsGetService`,
`StorageTransactionsGetService` (`ProcessingCost`) e `WeighingTicketsGetService`
(`TruckDriver`, `StorageAddress`).

### Tier 1 — a entidade já tem a coluna desnormalizada

O backend persiste a descrição na gravação. Ex.: `PurchaseContractsCreateService.cs:50-51` e
`PurchaseContractsUpdateService.cs:42-43` gravam `CardName`/`ItemName`.

```xml
<Input value="{CardName}" editable="false"/>
```

Com `autoExpandSelect: true` (manifest), a coluna entra no `$select` por estar bound. Zero
requisição extra. Entidades com esse padrão: `PurchaseContract`, `SalesContract`,
`StorageTransaction`, `SalesInvoice`, `StorageInvoice`, `OwnershipTransfer`,
`WeighingTicket`, `StorageAddress`.

### Tier 2 — a entidade tem navigation property

Sem coluna desnormalizada, mas com FK + nav property. Ex.:
`PurchaseContractQualityParameter` tem `QualityAttribCode` + `QualityAttrib`.

```xml
<Text text="{QualityAttrib/Name}"/>
```

O `autoExpandSelect` gera o `$expand` sozinho:

```
QualityParameters?$select=Key,MaxLimitRate,QualityAttribCode&$expand=QualityAttrib($select=Code,Name)
```

Uma requisição só, descrições inclusas. **Confirme antes** que a nav property está exposta:

```js
fetch("/odata/<Pai>(<key>)/<Filho>?$expand=<Nav>($select=Name)")
```

### Tier 3 — não tem nem coluna nem nav property

Não converta por conta própria. Exige mudança no backend (adicionar a coluna desnormalizada
ou a nav property). Levantar caso a caso.

## Manter a descrição em dia ao trocar pelo value help

Tanto a coluna desnormalizada quanto a nav property só mudam no servidor. Ao escolher outro
registro, o código muda mas a descrição ficaria velha até salvar e recarregar.

Solução: declarar o caminho da descrição no Input do código, via `CustomData`.

```xml
<Input value="{CardCode}" valueHelpRequest=".openSuppliersValueHelp">
  <customData>
    <core:CustomData key="descriptionProperty" value="CardName"/>
  </customData>
</Input>
```

```xml
<!-- tier 2: caminho de navegação funciona igual -->
<core:CustomData key="descriptionProperty" value="QualityAttrib/Name"/>
```

`CommonController.applyValueHelpDescription` faz o resto. Pontos que importam:

- Grava com `oContext.setProperty(path, valor, null)`. O **`null` como group ID impede o
  PATCH** — a coluna é do servidor, só deve mudar na tela. Verificado: o payload sai como
  `{"CardCode":"F999999"}`, sem `CardName`.
- A origem no diálogo é, por padrão, o **último segmento** do caminho: `QualityAttrib/Name`
  lê `Name`, `CardName` lê `CardName`.
- ⚠️ **Quando o nome da coluna de destino difere do nome no registro escolhido, declare a
  origem com `destino:origem`.** `AgentName:Name` grava em `AgentName` lendo `Name` do
  `Agent`; `DeliveryLocationName:Name` e `WarehouseName:Name` fazem o mesmo a partir do
  `Warehouse`. Sem isso a leitura devolve `undefined` e **a falha é silenciosa**: em registro
  existente o valor do servidor mascara o erro, e só aparece em registro novo, onde o campo
  fica em branco depois de escolher no diálogo.

  Casam por acaso (não precisam de `:`): `CardName` ← `BusinessPartner.CardName`,
  `ItemName` ← `Item.ItemName`. Não casam: qualquer coluna que renomeia o campo de origem.

  Como a falha é silenciosa, há um script que cruza cada `descriptionProperty` com as
  propriedades reais da entidade do value help (lidas do `$metadata`):

  ```bash
  node scripts/check-value-help-descriptions.js
  ```

  Sai com código 1 se achar alguma quebrada. Ao adicionar um value help novo, registre-o
  em `HANDLER_TO_TYPE` dentro do script.
- É **opt-in**: sem o `CustomData` nada acontece. Por isso os handlers compartilhados
  (`openSuppliersValueHelp` etc.) podem ser convertidos tela a tela, sem quebrar as demais.
- Funciona em linha nova (contexto transient) e com caminho de navegação — ambos testados.
- Aceita **vários caminhos separados por vírgula** quando a mesma escolha alimenta mais de
  uma coluna: `value="Tax/Code,Tax/Name,Tax/Rate"`. Inclua a chave do registro (`Tax/Code`)
  junto com as descrições, senão o objeto de navegação fica incoerente no cache.

## Já convertido

**Todos os 67 bindings** convertidos. Requisições avulsas medidas no navegador:

| Tela | Antes | Depois |
|---|---|---|
| `weighingTicket/Form` (romaneio de pesagem) | 4 | **0** |
| `storageTransactions/Form` (movimentação) | 7 | **0** |
| `menus/Form` | 1 | **0** |
| `shippingTransaction/Create` (JSON model) | 5 | **0** |
| `shipmentBilling/Billing` (diálogo, JSON model) | 2 | **0** |
| `shipmentBilling/Billing` (tabela de contratos, 6 linhas) | 12 | **0** |
| `shippingTransaction/SelectShipmentRelease` (10 linhas) | 10 | **0** |
| `purchaseContracts/PurchaseContractForm` | 6 | 1 (só UoM) |
| `storageAddresses/Form` | 5 | 1 (só UoM) |
| `salesContracts/SalesContractForm` | 6 | 1 (só UoM) |
| `PurchaseContractTaxes` (por linha) | 2 | **0** |
| `PurchaseContractQualityParameters` (por linha) | 4 | **0** |

Convertidos por tier:

- **Tier 1** (coluna desnormalizada): Fornecedor/Cliente, Produto, Armazém, Vendedor, Local de
  Entrega — em contratos de compra e venda, movimentações, lotes, romaneios de pesagem,
  documentos de saída, transferências de titularidade.
- **Tier 2** (nav property): Safra, Região Logística, Tabela de Custos, Motorista, Lote de
  Armazenagem, Atributo de Qualidade, Serviço, UF, e as quatro tabelas de administração
  (Perfis→Papéis, Papéis→Permissões, Papéis→Menus, Usuários→Perfis).

Infra em `controller/common/CommonController.ts`: `applyValueHelp` +
`applyValueHelpDescription`.

**Formatters removidos** (17 nomes, 30 definições ao todo, sem usos restantes conferidos por
grep): `formatTaxName`, `formatTaxRate`, `formatAgentName`, `formatHarvestSeasonName`,
`formatLogisticRegionName`, `formatCustomerName`, `formatRoleDescription`,
`formatPermissionName`, `formatProfileDescription`, `formatDescricaoServico`,
`formatDescricaoCaracteristica`, `formatProdutoDescricao`, `formatRazaoSocialBP`,
`formatArmazemDescricao`, `formatSiglaUf`, `formatProcessingCostDescription`,
`formatTruckDriverName` — mais os imports que ficaram órfãos.

### Mudanças de backend que isto exigiu

- Navigation properties **novas**, declaradas sobre FKs que já existiam (sem migration; a
  aplicação não roda `.Migrate()` em nenhum ambiente): `StorageTransaction.TruckDriver`,
  `StorageTransaction.StorageAddress` e `StorageInvoice.StorageAddress`. Todas apontam para
  entidades **locais** — o que as diferencia dos casos bloqueados do grupo 1.
- `.Include` no `GetByIdAsync` (Tier 2 não funciona em binding de entidade única sem isso):
  `PurchaseContractsGetService` (HarvestSeason, LogisticRegion), `SalesContractsGetService`
  (idem), `StorageAddressesGetService` (ProcessingCost), `StorageTransactionsGetService`
  (ProcessingCost, TruckDriver, StorageAddress), `WeighingTicketsGetService` (TruckDriver,
  StorageAddress), `StorageInvoicesGetService` (StorageAddress), `MenuItemsGetService`
  (Parent — a nav já existia na entidade, só não era carregada).
- Recálculo das colunas desnormalizadas no update, que **não existia**:
  `StorageTransactionsUpdateService` (CardName, ItemName, WarehouseName) e
  `WeighingTicketsUpdateService` (CardName, ItemName). Sem isso a coluna ficaria velha ao
  trocar o código e a conversão seria uma regressão.
- Correção de `entity.` → `existingEntity.` depois do `SetValues`, que descartava a gravação:
  `PurchaseContractsUpdateService` (DeliveryLocationName, AgentName),
  `SalesContractsUpdateService` (AgentName). No `StorageTransactionsUpdateService` o mesmo
  bug afetava também `UpdatedBy`/`UpdatedAt`.

## O que falta

**Nada.** Os 67 bindings foram convertidos.

O que segue é o histórico dos bloqueios encontrados e como cada um foi resolvido — vale
ler antes de introduzir um campo de descrição novo.

### 1. Entidades servidas pelo SAP — RESOLVIDO com colunas desnormalizadas

⚠️ **Regra que invalida a saída óbvia:** em `Erp = SAPB1` (o caso de `Yokotobi`, `Staging` e
o `appsettings.json` padrão), `IBusinessPartnerService`, `IItemService`,
`IUnitOfMeasureService`, `IAgentService` e `IWarehouseService` são trocados por
implementações que leem do **SAP** (`OCRD`, `OITM`, …), não das tabelas locais do
`AppDbContext`. Uma nav property EF para `BusinessPartner`/`Item`/`UnitOfMeasure`/`Agent`/
`Warehouse` resolveria contra a tabela local — que nesse modo está vazia — e voltaria `null`.

Ou seja: **Tier 2 não é opção para essas cinco entidades.** Só Tier 1 (coluna desnormalizada
preenchida pelo serviço, que já passa pelo SAP) funciona, e é por isso que `CardName`,
`ItemName`, `WarehouseName` e `AgentName` foram convertíveis.

**Verificado empiricamente** (nav `BusinessPartner` declarada em `PurchaseContract` só para
diagnóstico, e revertida em seguida):

| Consulta | Resultado |
|---|---|
| `PurchaseContracts?$select=Code,CardName` | 789 registros |
| `PurchaseContracts?$expand=<nav>` | **lista vazia** |
| `PurchaseContracts(key)?$expand=<nav>` | nav `null` |

E o dano é maior que "campo em branco": como `CardCode` é **obrigatório**, o EF trata a
relação como required e emite **INNER JOIN**. Contra a tabela local vazia isso **zera a
coleção inteira** — numa tabela, a tela inteira ficaria sem linhas. Não declare navegação
para entidade servida pelo SAP.

**A saída é coluna desnormalizada, preenchida pelo serviço no create e no update.** Foi o que
se fez em `20260719173145_AddDenormalizedNamesForSapEntities`, mantendo hoje apenas:

| Coluna | Tabela |
|---|---|
| `CardName` VARCHAR(200) | `PURCHASE_CONTRACTS_BROKERS` |

As colunas de UoM criadas na mesma migration (`UnitOfMeasureName` em `PURCHASE_CONTRACTS`,
`SALES_CONTRACTS` e `STORAGE_TRANSACTIONS`, `UoMName` em `STORAGE_ADDRESSES`, `UomName` em
`OWNERSHIP_TRANSFER`) foram **descartadas** em
`20260719200236_DropUnusedUnitOfMeasureNames` — ver a nota sobre UoM abaixo.

`SalesInvoice.DeliveryCardName` e `TruckingCompanyName` já existiam — só faltava o backend
mantê-las (create e update agora preenchem as duas).

**Backfill:** como as tabelas de referência locais estão vazias, não dá para preencher os
registros antigos por SQL puro — o dado tem de vir do SAP. O caminho usado foi ler pela
própria API (`/odata/UnitsOfMeasure`, `/odata/BusinessPartners`), montar um mapa e aplicar
`UPDATE ... JOIN` com ele. Preenchidos: 789 contratos de compra, 556 de venda, 5.027
movimentações, 2 lotes e 2.355 documentos de saída.

**A UoM acabou saindo das telas.** Neste SAP a `Description` da unidade de medida é *igual ao
código* (`KG`→`KG`, `TON`→`TON`), então o campo ao lado do código nunca mostrou nada novo.
Em vez de convertê-lo, removemos o campo de descrição de `PurchaseContractForm`,
`SalesContractForm`, `storageTransactions/Form`, `storageAddresses/Form`,
`ownershipTransfers/Form` e `shippingTransaction/Form`, junto com o formatter
`formatUnitOfMeasureDescription` (6 definições).

As colunas `UnitOfMeasureName`/`UoMName`/`UomName` foram **removidas** em seguida
(`20260719200236_DropUnusedUnitOfMeasureNames`), junto com as atribuições e as injeções de
`IUnitOfMeasureService` nos 10 serviços de create/update. Não havia consumidor.

**Lição:** confira o *conteúdo real* do campo antes de criar coluna para ele. Bastava um
`GET /odata/UnitsOfMeasure` para ver que `Description == Code` e concluir que a coluna não se
justificava — teria evitado a migration, o backfill de ~6.400 linhas e o descarte.

Nota: `SalesContract.cs` declarava `[ForeignKey("UnitOfMeasureModel")]` apontando para uma
propriedade de navegação inexistente. Removido.

### 2. Telas em JSON model — RESOLVIDO com a variante de JSON

`applyValueHelpDescriptionToJsonModel` cobre o caso: quando o Input do código binda um JSON
model (`viewModel>/StorageTransaction/WarehouseCode`) não há contexto OData, então a
descrição é gravada no **irmão** do caminho do código no mesmo model —
`/StorageTransaction/WarehouseName`. Mesma ideia do caso OData, onde o caminho é relativo à
linha; o `descriptionProperty` (inclusive a forma `destino:origem`) funciona igual.

Aplicado em `shippingTransaction/Create` (fragmentos `Form` e `QualityInspections`): a
abertura caiu de **5 requisições avulsas para 0**, e os value helps editáveis (Armazém,
Motorista, Atributo de Qualidade) atualizam a descrição sem ir ao servidor. Os valores
iniciais vêm do `$expand=PurchaseContract` que a tela já fazia — só não estavam sendo lidos.

⚠️ **Campo só de exibição não pode entrar no payload.** `ShippingTransactionsCreate` recebe
um `EntityParameter<StorageTransaction>`, e o OData rejeita propriedade não declarada.
`CardName`, `ItemName` e `WarehouseName` existem na entidade e podem ir; `TruckDriverName` e
`QualityAttribName` **não existem** e são retirados em `Create.controller.ts` (`toPayload`).
Ao adicionar um campo de descrição numa tela JSON, verifique se a propriedade existe na
entidade de destino — se não existir, tire-a do payload.

Também aplicado em `shipmentBilling/Billing` (Endereço de Entrega e Transportadora do diálogo
de faturamento). Ali o payload é montado por seleção explícita de campos em
`saveBillingDialog`, então os nomes não vazam e não foi preciso um `toPayload`.

### 2b. O dado às vezes já está no payload

`shippingTransaction/SelectShipmentRelease` não precisou de padrão nenhum: o endpoint
`ShipmentReleasesGetPurchaseContracts` **já devolvia** o nome do fornecedor em `FName`
(`ShipmentReleasesPurchaseContractsService.MapToDto`: `FName = wh?.CardName`), e a view
chamava o formatter em `FCode` mesmo assim. A correção foi trocar por `{contracts>FName}` —
uma linha, de 10 requisições (uma por linha, repetidas no scroll) para **zero**.

Antes de assumir que falta dado, **leia o payload**.

### 3. Tabela de contratos do faturamento — RESOLVIDO

Na tabela de contratos do diálogo de `shipmentBilling/Billing`, duas colunas buscavam o
**mesmo** parceiro separadamente, uma vez por linha: Nome Fantasia
(`formartCustomerFName` — o typo é real) e Cnpj (`formatCustomerTaxId`). Medido: **12
requisições** para 6 linhas.

Resolvido com o desenho do grupo 1 —
`20260719213404_AddSalesContractCardFNameAndTaxId` adicionou `CardFName` VARCHAR(200) e
`CardTaxId` VARCHAR(20) em `SALES_CONTRACTS`, preenchidas no create e no update.
`SalesContractsCreateService`/`UpdateService` agora fazem **uma leitura só** do parceiro para
as três colunas (`CardName`, `CardFName`, `CardTaxId`), em vez de uma por campo. Backfill de
556 contratos via API. Resultado: **12 → 0**.

⚠️ **Cuidado ao inventariar:** `formartCustomerFName` tem typo no nome. Uma regex ancorada em
`format[A-Za-z]+` **não o encontra** — foi o que mascarou esse binding em contagens
anteriores. Use `formatter:\s*'\.([A-Za-z]+)'` e filtre pela lista de formatters remotos.

### Corretores de contrato de venda — feature inexistente, fragmento removido

`salesContracts/SalesContractBrokers.fragment.xml` bindava `rows="{Brokers}"`, mas
`SalesContract` **não tem** essa propriedade de navegação — nem existe entidade
`SalesContractBroker`, controller ou serviço. Só o contrato de *compra* tem corretores. A
tabela nunca teve como mostrar linha alguma.

O fragmento foi excluído (2026-07-19); não era referenciado por nenhuma view, então a remoção
foi isolada. Junto saíram os órfãos que só existiam para ele: `onAddBroker` e
`onRemoveBroker` em `SalesContractsBaseController`, que apontavam para
`salesContractsBrokersTable` — id que não aparecia em nenhum outro lugar.

⚠️ `PurchaseContractsBaseController` tem métodos com **os mesmos nomes**, esses em uso pelo
fragmento `PurchaseContractBrokers`. São classes diferentes: ao limpar por nome, confira a
classe.

As prioridades 1 e 2 do plano original estão **concluídas** — o que restou são os quatro
grupos acima, todos bloqueados por backend ou por arquitetura de tela.

`PurchaseContractTaxes` (feito) era o caso exemplar: `formatTaxName` e `formatTaxRate`
buscavam o **mesmo** registro separadamente — `Taxes('SENAR')` duas vezes por linha. A nav
property `Tax` resolve as duas colunas de uma vez; confirmado contra o backend:

```
GET /odata/PurchaseContracts(<key>)/Taxes?$select=Key,TaxCode&$expand=Tax($select=Code,Name,Rate)
→ {"Key":"...","TaxCode":"SENAR","Tax":{"Code":"SENAR","Name":"SENAR","Rate":0.2000}}
```

A alíquota usa `sap.ui.model.odata.type.Decimal` com `decimals: 4` — mesmo resultado do
`formatter.formatDecimal` anterior, e sem o `throw` dele quando o valor é nulo (linha nova).

Verificado no navegador (contrato `ae0ec245…`, filial 3, `Draft`):

- `getDownloadUrl()` → `.../Taxes?$select=Key,TaxCode&$expand=Tax($select=Code,Name,Rate)`;
  células renderizam `SENAR / SENAR / 0,2000`.
- Network sem nenhum `GET /odata/Taxes('...')` — nem ao abrir, nem ao escolher no value help.
  Os `GET` avulsos que sobram na tela (`Agents(88)`, `UnitsOfMeasure('KG')`,
  `HarvestSeasons('2026')`, `LogisticRegions('001')`, `Warehouses('F024837')`) são dos
  formatters do `PurchaseContractForm` ainda não convertidos.
- Troca SENAR → FUNRURAL no value help: as três células acompanham na hora.
- Corpo do `$batch`: `{"TaxCode":"FUNRURAL"}` — sem `Tax`/`Name`/`Rate`.

O `descriptionProperty` inclui `Tax/Code` junto com `Tax/Name` e `Tax/Rate`: sem ele o objeto
de navegação fica incoerente no cache (`Code` velho ao lado de `Name` novo). Regra geral:
declare **todas** as propriedades lidas do registro escolhido, inclusive a chave.

Prioridade 2 — formulários: **feita** nos que dava para fazer com segurança (ver tabela
acima). O que sobrou nesses arquivos está bloqueado por backend, marcado com `TODO Tier 3`
no próprio XML:

- `SalesContractForm`: Vendedor (bug do `AgentName`), Un.Med. (sem coluna nem nav).
- `salesInvoices/Form`: Endereço Entrega, Transportadora (colunas não mantidas).
- `storageTransactions/Form`: Cliente, Produto, Un.Med., Armazém, Motorista, Lote — update
  não recalcula as colunas; Motorista e Lote não têm nem nav property nessa entidade.
- `weighingTicket/*`: Cliente e Produto (update não recalcula).

`shippingTransaction/Form` não foi tocado: seus bindings apontam para um JSON model
(`viewModel>/StorageTransaction/...`), não para um contexto OData — `applyValueHelpDescription`
exige `sap.ui.model.odata.v4.Context` e sai sem fazer nada. Precisa de análise à parte.

Prioridade 3 — limpeza. Os formatters `format*` estão **duplicados em 12 controllers** que
já herdam de `CommonController` (~71 definições). Só remover depois que os usos sumirem, e
conferindo com grep antes de apagar cada um.

Os 3 formatters restantes do `PurchaseContractForm` (Representante, Região Logística, Local
de Entrega) parecem Tier 3 — checar entidade antes.

## Como verificar cada conversão

Com backend e `yarn start:dev` rodando, no console do navegador:

```js
// 1. a descrição carrega na abertura?
// 2. o $expand/$select foi montado?
const t = sap.ui.core.Element.registry.filter(e => e.isA?.('sap.ui.table.Table'))[0];
t.getBinding('rows').getDownloadUrl();
```

Depois, na aba Network: **nenhum** `GET /odata/<Entidade>('...')` disparado pela tela.

Trocar pelo value help e conferir que a descrição acompanha; salvar e inspecionar o corpo do
`$batch` — a descrição **não** pode aparecer no PATCH.

Cuidado ao testar gravação: contratos só aceitam edição em `Draft` (os demais retornam 400
"You can only edit a purchase contract if its status is draft"). Se alterar dado real,
reverta — ou use `resetChanges()` para descartar antes de salvar.

## Estado do repositório

Branch `develop/1.1.201`. O trabalho anterior (infra + `PurchaseContractForm` +
`PurchaseContractQualityParameters`, junto com os bumps de versão e as mudanças de sessão /
`DialogHelper`) está no commit `970ba1d`.

Pendente de commit, **em dois repositórios**:

- `siagro-b1-frontend`: conversão de `PurchaseContractTaxes` + prioridade 2, suporte a
  múltiplos caminhos em `applyValueHelpDescription`, remoção dos `formatTax*`, e a correção
  do `tsconfig.json` (`"ignoreDeprecations": "6.0"` era inválido no TS 5.9 e fazia o
  `yarn ts-typecheck` abortar antes de checar qualquer coisa).
- `siagro-b1-backend`: os `.Include` em `SalesContractsGetService`,
  `StorageTransactionsGetService` e `WeighingTicketsGetService`.

Tudo verificado no navegador (ambiente `Yokotobi`, `admin`/`1234`).

Destravar o typecheck expôs 8 erros pré-existentes que nunca tinham sido vistos, todos
consertados: `webapp/types/ContractType.ts` (o `validateValue` estava duplicado e o código
referenciava `_mTextToValue`/`_mValueToText`, que nunca existiram — a classe foi completada
no desenho que esses nomes indicavam, com os mesmos textos de `formatter.formatContractType`)
e `webapp/test/unit/controller/Main.qunit.ts` (afirmava um `sayHello` que não existe neste
projeto; reescrito para testar a herança e os formatters — 2 testes, 3 asserções, passando).

`yarn ts-typecheck` agora sai com **exit 0**.

Ainda falham, de antes e sem relação com isto: `yarn lint` (erros do
`typescript-eslint` nos formatters `format*` restantes) e a jornada OPA5
`webapp/test/integration/HelloJourney.ts`, que é scaffolding do template — procura um
`helloButton` na `siagrob1.view.Main` que não existe. Enquanto ela estiver lá, `yarn test`
não passa.

Nota sobre testar gravação sem sujar dado: em vez de salvar e reverter, dá para capturar o
payload sem deixá-lo sair, sobrescrevendo `XMLHttpRequest.prototype.send`/`window.fetch`
para interceptar `$batch`, e então chamar `oModel.submitBatch(oModel.getUpdateGroupId())`.
Recarregar a página descarta as mudanças pendentes.
