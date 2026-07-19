# Substituição dos formatters que buscam descrição no backend

Documento de trabalho. Registra o padrão validado, o que já foi convertido e o que falta.

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
- A origem no diálogo é o **último segmento** do caminho: `QualityAttrib/Name` lê `Name`,
  `CardName` lê `CardName`.
- É **opt-in**: sem o `CustomData` nada acontece. Por isso os handlers compartilhados
  (`openSuppliersValueHelp` etc.) podem ser convertidos tela a tela, sem quebrar as demais.
- Funciona em linha nova (contexto transient) e com caminho de navegação — ambos testados.

## Já convertido

| Arquivo | Tier | Campos | Ganho medido |
|---|---|---|---|
| `view/purchaseContracts/fragments/PurchaseContractForm.fragment.xml` | 1 | Fornecedor, Produto | 6 → 3 requisições por abertura |
| `view/purchaseContracts/fragments/PurchaseContractQualityParameters.fragment.xml` | 2 | Nome do atributo | 4 → 0 (uma por linha) |

Infra em `controller/common/CommonController.ts`: `applyValueHelp` +
`applyValueHelpDescription`.

## O que falta

**67 bindings** com formatter de busca, em 26 arquivos de view/fragment.

Prioridade 1 — dentro de tabela (uma requisição por linha, repetida no scroll):

```
4  view/shipmentBilling/fragments/Billing.fragment.xml
2  view/purchaseContracts/fragments/PurchaseContractTaxes.fragment.xml   <- 2 req/linha do MESMO registro
1  view/weighingTicket/fragments/QualityInspections.fragment.xml
1  view/storageTransactions/fragments/QualityInspections.fragment.xml
1  view/shippingTransaction/fragments/QualityInspections.fragment.xml
1  view/salesInvoices/fragments/Items.fragment.xml
1  view/salesContracts/fragments/SalesContractBrokers.fragment.xml
1  view/purchaseContracts/fragments/PurchaseContractBrokers.fragment.xml
1  view/roles/fragments/Permissions.fragment.xml
1  view/roles/fragments/Menus.fragment.xml
1  view/profiles/fragments/Roles.fragment.xml
1  view/users/fragments/Profiles.fragment.xml
1  view/processingCostsList/fragments/TableServico.fragment.xml
1  view/processingCostsList/fragments/TableQualidade.fragment.xml
```

`PurchaseContractTaxes` merece atenção: `formatTaxName` e `formatTaxRate` buscam o **mesmo**
registro separadamente — confirmado ao vivo (`Taxes('SENAR')` duas vezes). Uma leitura via
nav property resolve as duas colunas.

Prioridade 2 — formulários (`salesContracts/SalesContractForm`, `storageTransactions/Form`,
`shippingTransaction/Form`, `salesInvoices/Form`, `weighingTicket/*`, etc.). Vários são
Tier 1 direto.

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

Branch `develop/1.1.003`, nada commitado. Além destes arquivos, o working tree tem bumps de
versão `1.1.002 → 1.1.003` (`package.json`, `UserMenu.fragment.xml`, `login/Main.view.xml`)
que **não** fazem parte deste trabalho, e as mudanças de controle de sessão / `DialogHelper`
de sessões anteriores.
