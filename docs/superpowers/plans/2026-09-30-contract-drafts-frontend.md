# Minutas de contrato — Frontend (SAPUI5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar cara de tela a tudo que o backend já expõe — cadastrar modelos de contrato com editor rico e placeholders, cadastrar signatários da empresa e do parceiro, e operar as minutas de um contrato (criar, editar texto, PDF, enviar para assinatura, cancelar, atualizar situação) direto na página do contrato.

**Architecture:** nada de tela nova de "minutas" avulsa. As minutas vivem como uma `ObjectPageSection` a mais na página de detalhe do contrato de compra e do de venda, seguindo o padrão de `PurchaseContractComments`/`PurchaseContractWashouts`: um fragment por seção, controlado pelo controller de detalhe. Modelos de contrato e signatários da empresa são módulos próprios (Main + Add/Edit), porque têm menu e rota. Signatários do parceiro são mais uma seção em `parceirosNegocio`. Toda mutação passa por action OData via `bindContext(...).setParameter(...).invoke()` — nunca `RequestModel`/fetch, que grava fora do cache do v4.

**Tech Stack:** SAPUI5 1.141.0 + TypeScript, OData v4 (`autoExpandSelect` ligado), `sap.uxap` ObjectPage, `sap.ui.table`/`sap.m.Table`, `sap.ui.richtexteditor` (a acrescentar), yarn.

**Backend (pronto e em `main`):** `docs/superpowers/specs/2026-09-21-contract-drafts-esignature-design.md` no repo `siagro-b1-backend`, seção "Tela (siagro-b1-frontend, plano à parte)" e "API (OData)". Fases 1 e 2 mergeadas em `cf57cb4`.

---

## Global Constraints

- **Identificadores em inglês; texto que o usuário lê em pt-BR.** i18n default do projeto é **pt-BR** (`webapp/i18n/i18n.properties`). Nomes de módulo seguem o vizinho, não normalize idioma.
- **Nunca acesso global a objetos UI5.** Import ES6 em `.ts`; `core:require` em XML para tipos/formatters.
- **Tipos de evento específicos do controle** (UI5 ≥ 1.115): `import { Button$PressEvent } from "sap/m/Button"`. Nada de `sap/ui/base/Event` genérico.
- **Nunca `SimpleForm`.** `sap.ui.layout.form.Form` com `ColumnLayout`, `columnsM="2" columnsL="3" columnsXL="4"`.
- **Nada de estilo inline nem `<script>` inline** (CSP). CSS vai para `webapp/css/`.
- **Toda rota de backend entra em `webapp/model/ServerRoutes.ts`.** Actions no formato `'/Nome(...)'` (relativo à raiz, com `(...)`); endpoints REST no formato `'/odata/Nome'`.
- **Mutação = action OData** por `oModel.bindContext(rota)` → `setParameter` → `await invoke()`. Nunca `jQuery.ajax`/fetch: grava fora do cache do v4 e a tela só atualiza recarregando a rota.
- **Stage imediato** de arquivo novo com `git add`. **Nunca `git push`.** Branch `feature/contract-drafts-frontend`.
- **Mensagem de commit:** `tipo(escopo): descrição em pt-BR, imperativo, minúscula, sem ponto final`. Rodapé `Co-Authored-By:` com o modelo que escreveu.
- ⚠️ **O escopo vem de uma LISTA FECHADA** validada pelo hook `.githooks/commit-msg` (ligado por `core.hooksPath`), que rejeita o commit inteiro se o escopo não estiver nela: `purchase-contract`, `sales-contract`, `shipment`, `storage`, `invoice`, `financial`, `weighing`, `partner`, `master-data`, `security`, `reports`, `sap`, `platform`. **Use `platform`** — é o que o backend usou nesta mesma feature, e ela é transversal a compra e venda. O hook também exige assunto com no mínimo 15 caracteres e um dos tipos `feat|fix|refactor|perf|chore|docs|test`.
- **TDD no que o harness alcança.** Lógica de negócio — rótulos, guardas de habilitação de botão, montagem de parâmetro de action, leitura do array cru das functions — mora em `webapp/helpers/` ou `webapp/model/` e **nasce de um teste que você viu falhar**. View XML, fragment e controller com OData não são unit-testáveis aqui; o gate deles é linters + navegador. Mantenha view e controller finos: se uma regra é difícil de testar, é porque está no lugar errado.
- Gates de código: `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint`. **`yarn test` NÃO é gate aqui** — ver "O que não usar como prova" abaixo.

### Armadilhas do projeto que valem mais que qualquer amostra deste plano

Vêm de sessões anteriores e **todas passam nos três gates, quebrando só no navegador**:

1. **Enum do OData v4 chega como `Raw` e não formata.** `visible="{= ${Status} === 'Draft' }"` **não funciona**. Use `{= ${path: 'Status', targetType: 'any'} === 'Draft' }`.
2. **A conversão é pelo tipo da propriedade alvo, não só por enum.** `visible="{= !!${LastError} }"` sobre `Edm.String` estoura `FormatException` no primeiro registro preenchido — parece imune enquanto o campo vem vazio. Mesmo fix: `targetType: 'any'`.
3. **`DateTimeOffset` do backend tem 7 casas de fração** (`DateTime.Now`). Binding sem `constraints: { precision: 7 }` quebra a tela.
4. **List binding relativa não tem cache próprio**: `oBinding.refresh()` não re-lê sem `parameters: { '$$ownRequest': true }`. Sem isso o workaround vira `model.refresh()`, que arrasta todas as tabelas da tela e dá corrida intermitente.
5. **Nunca bindar `rows`/`items` direto numa function OData custom.** As functions deste backend respondem **array JSON cru, sem envelope `{value:[...]}`** — o `ODataListBinding` quebra com `Cannot read properties of undefined (reading 'length')`, embora `curl` na function devolva 200 com dados. Padrão: `bindContext("/Func(...)")` + `invoke()` → `getBoundContext().getObject()` **é o array** → `setData` num `JSONModel` nomeado → view binda `nome>/`.
6. **`OrderBy` do serviço não sobrevive à paginação.** `sap.ui.table` sempre manda `$skip`/`$top`; a ordenação tem de vir do binding (`sorter`).
7. **`&&` literal em atributo XML é XML inválido** — precisa `&amp;&amp;`.

Referência completa: memória `ui5-v4-odata-binding-action-gotchas`.

### O que o backend já entrega (confira antes de usar; não invente assinatura)

Entity sets (leitura): `ContractTemplates`, `CompanySignatories`, `BusinessPartnerSignatories` (CRUD completo via `ODataBaseController`), `ContractDrafts`, `ContractDraftSigners` (**só leitura** — toda mutação é action).

| Tipo | Nome | Parâmetros |
|---|---|---|
| Action | `ContractDraftsCreate` | `ContractType` (string `Purchase`/`Sales`), `ContractKey`, `TemplateKey`, `DraftType` (string), `Description` |
| Action | `ContractDraftsUpdate` | `Key`, `Description`, `DraftType`, `BodyHtml` |
| Action | `ContractDraftsDelete` | `Key` |
| Action | `ContractDraftsSendToSignature` | `Key` |
| Action | `ContractDraftsCancel` | `Key` |
| Function | `ContractDraftsListByContract(ContractType=…,ContractKey=…)` | devolve DTO com `Signers`, sem HTML |
| Function | `ContractDraftsGetBody(Key=…)` | `BodyHtml` |
| Function | `ContractDraftsDownloadPdf(Key=…)` | `File(bytes, "application/pdf", …)` |
| Function | `ContractDraftsRefreshState(Key=…)` | `bool` — houve mudança |
| Function | `ContractTemplatesListPlaceholders(ContractType=…)` | nome + descrição |

Enums que chegam como string: `ContractDraftStatus` (`Draft`, `AwaitingSignature`, `PartiallySigned`, `Signed`, `Canceled`), `ContractDraftType` (`Contract`, `Amendment`, `Termination`), `ContractTemplateScope` (`Purchase`, `Sales`, `Both`), `SignerSide` (`Company`, `Partner`), `SignerStatus` (`Pending`, `Signed`, `EmailFailed`), `SignatoryRole` (13 valores, 1–13).

### O que NÃO precisa ser feito

**A migration de menus já existe.** A Fase 1 do backend entregou `AddContractTemplateMenus` (`CommonContext`), com os itens `contractTemplates` ("Modelos de Contrato") e `companySignatories` ("Signatários da Empresa") no grupo `registers`, ordens 14 e 15, liberados para `ADMIN`. A spec do backend ainda pede essa migration na seção da tela — está desatualizada.

**Consequência dura:** as rotas no `manifest.json` **precisam** se chamar exatamente `contractTemplates` e `companySignatories`. `App.controller.ts` navega com `navTo(item.getKey())`; nome diferente = item de menu que não vai a lugar nenhum.

### O que não usar como prova

- **`yarn test` não passa neste projeto** e não é gate: roda lint + QUnit com limiar de cobertura de 50% contra ~2,4% reais, então falha sempre, independentemente do que você mudou. Não persiga esse número.
- **Mas QUnit funciona, e dá RED/GREEN de verdade.** O `CLAUDE.md` do repo está desatualizado ao dizer que só existe o teste do template: há 6 arquivos de teste reais (`helpers/`, `model/formatter`, `services/TableLayoutService`). Comando verificado em 30/09, baseline **39/39** — com `npx ui5 serve --port 8080` de pé:

```
npx ui5-test-runner --url "http://localhost:8080/test/Test.qunit.html?testsuite=test-resources/siagrob1/testsuite.qunit&test=unit/unitTests" --report-dir <scratchpad>/qunit-report
```

  `--report-dir` **fora do repo**: `report/`, `.nyc_output/` e `coverage/` não são ignorados pelo git. E pare o dev server antes de qualquer `yarn test`, senão o runner acerta o servidor não instrumentado e falha com `[COVMIS]`, sintoma enganoso.
- Teste novo entra em `webapp/test/unit/...` e precisa ser registrado em `webapp/test/unit/unitTests.qunit.ts` — senão não roda e você não percebe.
- **Os três gates reais são `yarn ts-typecheck`, `yarn lint` e `yarn ui5lint`** — e as sete armadilhas acima passam nos três. **A única prova de que uma tela funciona é abrir no navegador.**
- O **`ui5-mcp-server` está fora do ar** nesta máquina (timeout). Sem `get_api_reference`/`run_ui5_linter` por MCP; use `yarn ui5lint` local e a documentação oficial.

---

## Ordem e dependências

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. A 2 e a 3 são CRUD simples e estabelecem o padrão; a 5 é a mais arriscada (biblioteca nova); a 7 é espelho da 6 e só deve começar depois de a 6 ser revisada, para o espelho copiar algo já aprovado.

---

## Task 1: Rotas, tipos compartilhados e a biblioteca do editor

**Files:**
- Modify: `webapp/model/ServerRoutes.ts`
- Modify: `ui5.yaml` (biblioteca `sap.ui.richtexteditor`)
- Modify: `webapp/manifest.json` (`sap.ui5.dependencies.libs`)
- Create: `webapp/model/contractDrafts.ts` (enums como union de string + rótulos pt-BR)
- Create: `webapp/css/contractDraft.css`

**Interfaces:**
- Produces: as chaves de rota usadas por todas as tasks seguintes; `ContractDraftStatus`, `ContractDraftType`, `SignerSide`, `SignerStatus`, `ContractTemplateScope`, `SignatoryRole` e seus mapas de rótulo; a classe CSS do preview.

- [ ] **Step 1: Provar que a biblioteca do editor resolve — antes de qualquer código**

`sap.ui.richtexteditor` **não** está em `ui5.yaml` nem no `manifest.json`. O projeto é SAPUI5 (não OpenUI5), então a biblioteca existe no catálogo — mas isso precisa ser provado, não presumido, porque tudo na Task 5 depende dela.

Acrescente em `ui5.yaml`, na lista `framework.libraries`, mantendo a ordem alfabética da vizinhança:

```yaml
    - name: sap.ui.richtexteditor
```

E em `webapp/manifest.json`, dentro de `sap.ui5.dependencies.libs`, no mesmo formato dos vizinhos (`"sap.uxap": {}` etc.):

```json
        "sap.ui.richtexteditor": {}
```

Rode `yarn install` (ou `ui5 use` / `ui5 install` conforme o projeto resolve o framework) e depois `yarn start`, abrindo `http://localhost:8080/index.html`. **O servidor do UI5 não serve índice padrão — o caminho completo é obrigatório.**

**Se a biblioteca não resolver**, pare e reporte BLOCKED com a saída exata. Não invente substituto: um editor de texto rico caseiro num contrato jurídico é decisão do usuário, não do implementador.

- [ ] **Step 2: Rotas**

Em `webapp/model/ServerRoutes.ts`, junto do bloco de `purchaseContracts`, seguindo os dois formatos que o arquivo já usa — `'/odata/Nome'` para endpoint e `'/Nome(...)'` para action invocada por `bindContext`:

```ts
  // minutas de contrato (assinatura eletrônica)
  contractTemplates: '/odata/ContractTemplates',
  companySignatories: '/odata/CompanySignatories',
  businessPartnerSignatories: '/odata/BusinessPartnerSignatories',

  contractDraftsCreate: '/ContractDraftsCreate(...)',
  contractDraftsUpdate: '/ContractDraftsUpdate(...)',
  contractDraftsDelete: '/ContractDraftsDelete(...)',
  contractDraftsSendToSignature: '/ContractDraftsSendToSignature(...)',
  contractDraftsCancel: '/ContractDraftsCancel(...)',
```

As **functions** não entram aqui como constante simples porque levam parâmetros na própria URL; monte-as no controller com `encodeURIComponent` onde couber. Documente isso num comentário de uma linha acima do bloco.

- [ ] **Step 3: Enums e rótulos**

```ts
// webapp/model/contractDrafts.ts

/** Enums do backend chegam como STRING no OData v4 deste projeto. */
export type ContractDraftStatus = "Draft" | "AwaitingSignature" | "PartiallySigned" | "Signed" | "Canceled";
export type ContractDraftType = "Contract" | "Amendment" | "Termination";
export type ContractTemplateScope = "Purchase" | "Sales" | "Both";
export type SignerSide = "Company" | "Partner";
export type SignerStatus = "Pending" | "Signed" | "EmailFailed";

export const draftStatusLabel: Record<ContractDraftStatus, string> = {
  Draft: "Rascunho",
  AwaitingSignature: "Aguardando assinatura",
  PartiallySigned: "Parcialmente assinada",
  Signed: "Assinada",
  Canceled: "Cancelada",
};

/** Estado do ValueState/ObjectStatus na tabela. */
export const draftStatusState: Record<ContractDraftStatus, "None" | "Warning" | "Success" | "Error"> = {
  Draft: "None",
  AwaitingSignature: "Warning",
  PartiallySigned: "Warning",
  Signed: "Success",
  Canceled: "Error",
};

export const draftTypeLabel: Record<ContractDraftType, string> = {
  Contract: "Contrato",
  Amendment: "Aditivo",
  Termination: "Distrato",
};

export const signerStatusLabel: Record<SignerStatus, string> = {
  Pending: "Pendente",
  Signed: "Assinou",
  EmailFailed: "Falha no e-mail",
};

/** Os 13 atos do D4Sign. O valor numérico é o código do provedor. */
export const signatoryRoleLabel: Record<number, string> = {
  1: "Assinar",
  2: "Aprovar",
  3: "Reconhecer",
  4: "Assinar como parte",
  5: "Assinar como testemunha",
  6: "Assinar como interveniente",
  7: "Acusar recebimento",
  8: "Assinar como emissor, endossante e avalista",
  9: "Assinar como emissor, endossante, avalista e fiador",
  10: "Assinar como fiador",
  11: "Assinar como parte e fiador",
  12: "Assinar como responsável solidário",
  13: "Assinar como parte e responsável solidário",
};
```

- [ ] **Step 4: CSS do preview**

O preview da minuta tem de sair igual ao PDF. O CSS canônico é o `ContractDraftPdfLayout.Css` do backend (`SiagroB1.Application/Services/ContractDrafts/ContractDraftPdfLayout.cs`) — **leia-o de lá e transcreva**, não reescreva de memória. Em `webapp/css/contractDraft.css`, sob uma classe raiz para não vazar no resto da aplicação:

```css
/* Espelho de ContractDraftPdfLayout.Css no backend. Mudou lá, mude aqui. */
.siagroContractDraftPreview { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #000; }
.siagroContractDraftPreview h1 { font-size: 14pt; text-align: center; font-weight: bold; }
.siagroContractDraftPreview h2 { font-size: 12pt; font-weight: bold; }
.siagroContractDraftPreview h3 { font-weight: bold; }
.siagroContractDraftPreview p { margin: 0 0 8pt; text-align: justify; }
.siagroContractDraftPreview table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
.siagroContractDraftPreview td, .siagroContractDraftPreview th { padding: 2pt 4pt; vertical-align: top; }
.siagroContractDraftPreview table.signature { width: auto; margin: 18pt 0 6pt; }
.siagroContractDraftPreview table.signature td:first-child { font-weight: bold; padding-right: 8pt; }
```

Registre o CSS em `manifest.json` (`sap.ui5.resources.css`) como os demais do projeto — confira como `webapp/css/` já é declarado e siga.

- [ ] **Step 5: Gates e commit**

`yarn ts-typecheck && yarn lint && yarn ui5lint` → limpos.

```bash
git add webapp/model/ServerRoutes.ts webapp/model/contractDrafts.ts webapp/css/contractDraft.css ui5.yaml webapp/manifest.json
git commit -m "feat(platform): registrar rotas, enums e a biblioteca do editor rico"
```

---

## Task 2: Signatários da Empresa

**Files:**
- Create: `webapp/controller/companySignatories/Main.controller.ts`, `Add.controller.ts`, `Edit.controller.ts`
- Create: `webapp/view/companySignatories/Main.view.xml`, `Add.view.xml`, `Edit.view.xml`
- Modify: `webapp/manifest.json` (rotas e targets)
- Modify: `webapp/i18n/i18n.properties`

**Interfaces:**
- Consumes: Task 1 (`api.companySignatories`, `signatoryRoleLabel`).
- Produces: o padrão de módulo CRUD que a Task 4 copia.

**A rota PRECISA se chamar `companySignatories`** — é a chave do item de menu que a Fase 1 do backend já criou. Nome diferente = menu que não navega.

- [ ] **Step 1: Escolher o módulo-modelo e copiá-lo de verdade**

Não invente estrutura. Abra um CRUD simples já existente e pequeno — `agents`, `costCenters` ou `ledgerAccounts` — e siga **a mesma** divisão de arquivos, o mesmo jeito de bindar a tabela, o mesmo tratamento de erro e o mesmo estilo de `BaseController`. Diga no relatório qual módulo você usou como molde.

- [ ] **Step 2: Lista**

Tabela com Nome, CPF/CNPJ, E-mail, Papel (via `signatoryRoleLabel`), Ordem, Filial (pode ser vazia = todas), Ativo. Ordenação pelo **binding** (`sorter` por `Order`), não pelo serviço — ver armadilha 6.

- [ ] **Step 3: Add/Edit**

`sap.ui.layout.form.Form` com `ColumnLayout` (`columnsM="2" columnsL="3" columnsXL="4"`). **Nunca `SimpleForm`.** Papel num `Select` alimentado por `signatoryRoleLabel`; Filial num campo de busca sobre `Branchs`, opcional; Ativo num `Switch`/`CheckBox`.

- [ ] **Step 4: Rotas no manifest**

Acrescente `companySignatories`, `companySignatoriesAdd` e `companySignatoriesEdit` seguindo o padrão de URL kebab-case em inglês do projeto (`company-signatories`, `company-signatories/new`, `company-signatories/{id}/edit`). A **rota de lista** tem de se chamar exatamente `companySignatories`.

- [ ] **Step 5: i18n**

Todo texto visível em `webapp/i18n/i18n.properties` (pt-BR é o base). Não toque nos arquivos `_en`/`_de`.

- [ ] **Step 6: Gates, navegador e commit**

Os três gates limpos, **e abra a tela no navegador**: liste, crie, edite, inative. Os gates não provam tela. Relate o que você viu.

```bash
git add webapp/controller/companySignatories webapp/view/companySignatories webapp/manifest.json webapp/i18n/i18n.properties
git commit -m "feat(platform): cadastrar signatarios da empresa"
```

---

## Task 3: Signatários do parceiro

**Files:**
- Create: `webapp/view/parceirosNegocio/fragments/BusinessPartnerSignatories.fragment.xml`
- Modify: o controller e a view de detalhe de `parceirosNegocio`
- Modify: `webapp/i18n/i18n.properties`

**Interfaces:**
- Consumes: Task 1.

Tabela local chaveada por `CardCode`, então **funciona nos dois modos de ERP** (SAPB1 e STANDALONE) — o parceiro pode vir do SAP, mas os signatários são nossos.

- [ ] **Step 1: Ler como `parceirosNegocio` compõe o detalhe**

Antes de escrever, veja se ele usa `ObjectPageSection` como `purchaseContracts` ou `IconTabFilter`. **Siga o que estiver lá.** Diga no relatório qual é.

- [ ] **Step 2: A seção**

Tabela com Nome, CPF/CNPJ, E-mail, Papel, Ordem, Ativo, e botões Novo/Editar/Excluir num diálogo. Binding **relativo** ao contexto do parceiro precisa de `parameters: { '$$ownRequest': true }`, senão `refresh()` depois de gravar não re-lê (armadilha 4).

- [ ] **Step 3: Gates, navegador e commit**

Idem Task 2, incluindo abrir um parceiro real e exercitar os três botões.

```bash
git add webapp/view/parceirosNegocio webapp/controller/parceirosNegocio webapp/i18n/i18n.properties
git commit -m "feat(platform): manter signatarios do parceiro na ficha do parceiro"
```

---

## Task 4: Modelos de Contrato — lista

**Files:**
- Create: `webapp/controller/contractTemplates/Main.controller.ts`
- Create: `webapp/view/contractTemplates/Main.view.xml`
- Modify: `webapp/manifest.json`, `webapp/i18n/i18n.properties`

**A rota de lista PRECISA se chamar `contractTemplates`** — chave do menu criado pela Fase 1.

- [ ] **Step 1: Lista**

Colunas: Nome, Título, Aplica-se a (`ContractTemplateScope` → "Compra"/"Venda"/"Ambos"), Ativo. Filtro por escopo e por ativo. Botões Novo/Editar/Excluir (excluir só se não houver minuta usando — o backend recusa; **mostre a mensagem dele, não uma sua**).

Lembre da armadilha 1 ao pintar o escopo: `{= ${path: 'ContractType', targetType: 'any'} === 'Purchase' }`.

- [ ] **Step 2: Gates, navegador e commit**

```bash
git add webapp/controller/contractTemplates webapp/view/contractTemplates webapp/manifest.json webapp/i18n/i18n.properties
git commit -m "feat(platform): listar modelos de contrato"
```

---

## Task 5: Modelos de Contrato — editor com placeholders e preview

**Files:**
- Create: `webapp/controller/contractTemplates/Edit.controller.ts`, `Add.controller.ts`
- Create: `webapp/view/contractTemplates/Edit.view.xml`, `Add.view.xml`
- Create: `webapp/view/contractTemplates/fragments/PlaceholderPanel.fragment.xml`
- Modify: `webapp/manifest.json`, `webapp/i18n/i18n.properties`

**É a task mais arriscada do plano:** biblioteca nova, uma function que devolve array cru, e um preview que renderiza HTML.

- [ ] **Step 1: O editor**

`sap.ui.richtexteditor.RichTextEditor`, `editorType="TinyMCE6"` (confirme o valor aceito na versão instalada; se a API divergir, **reporte em vez de adivinhar**). O conteúdo é o `BodyHtml` do modelo.

- [ ] **Step 2: Painel de placeholders — atenção à armadilha 5**

`ContractTemplatesListPlaceholders(ContractType='Purchase')` é uma **function custom** deste backend: responde **array JSON cru, sem envelope `{value:[...]}`**. Bindar a lista direto nela quebra com `Cannot read properties of undefined (reading 'length')`, mesmo com `curl` devolvendo 200 e dados.

O padrão obrigatório:

```ts
const ctx = oModel.bindContext(`/ContractTemplatesListPlaceholders(ContractType='${scope}')`);
await ctx.invoke();
const placeholders = ctx.getBoundContext().getObject() as unknown as PlaceholderDto[]; // É O ARRAY
const json = new JSONModel(placeholders);
this.getView().setModel(json, "placeholders");
```

E a view binda `placeholders>/` (a raiz do JSONModel **é** o array), com paths `{placeholders>Name}` / `{placeholders>Description}`.

Clicar num item insere `{{nome}}` na posição do cursor do editor.

- [ ] **Step 3: Preview**

Renderiza o `BodyHtml` dentro de um contêiner com a classe `siagroContractDraftPreview` da Task 1, para sair igual ao PDF.

⚠️ **Decisão de segurança que o implementador não deve tomar sozinho:** o HTML vem do editor, digitado por um usuário ADMIN. Renderizá-lo cru é XSS armazenado se algum dia um perfil menos privilegiado puder editar modelos. Use um contêiner que sanitize (`sap.ui.core.HTML` com `sanitizeContent="true"`) e **relate no seu report** se a sanitização remover algo que o PDF mantém — divergência entre preview e PDF é exatamente o que este preview existe para evitar. Se houver divergência, **reporte em vez de escolher** entre segurança e fidelidade.

- [ ] **Step 4: Validação de placeholder**

O backend recusa `{{xpto}}` desconhecido no POST/PATCH do modelo. Mostre a mensagem dele. Não duplique a lista de placeholders válidos no frontend — ela mudaria em dois lugares.

- [ ] **Step 5: Gates, navegador e commit**

Além dos gates: crie um modelo, insira placeholders pelo painel, veja o preview, salve, e provoque o erro de `{{xpto}}` para conferir a mensagem.

```bash
git add webapp/controller/contractTemplates webapp/view/contractTemplates webapp/manifest.json webapp/i18n/i18n.properties
git commit -m "feat(platform): editar modelo de contrato com placeholders e preview"
```

---

## Task 6: Seção "Minutas" no contrato de compra

**Files:**
- Create: `webapp/helpers/contractDraftActions.ts` — **a lógica testável da seção**
- Test: `webapp/test/unit/helpers/ContractDraftActions.qunit.ts` (registrar em `unitTests.qunit.ts`)
- Create: `webapp/view/purchaseContracts/fragments/PurchaseContractDrafts.fragment.xml`
- Create: `webapp/view/purchaseContracts/fragments/ContractDraftDialog.fragment.xml` (nova minuta)
- Create: `webapp/view/purchaseContracts/fragments/ContractDraftBodyDialog.fragment.xml` (editar texto)
- Modify: `webapp/view/purchaseContracts/Detail.view.xml` (uma `ObjectPageSection` a mais)
- Modify: `webapp/controller/purchaseContracts/Detail.controller.ts`
- Modify: `webapp/i18n/i18n.properties`

**O helper vem primeiro, por TDD.** Ele concentra o que dá para provar sem navegador e o que a Task 7 vai reusar: quais botões ficam habilitados em cada `ContractDraftStatus` (incluindo o caso `Signed` sem `SignedAttachmentKey`, que habilita "Atualizar situação"), a montagem dos parâmetros de cada action, e a extração do array cru devolvido pelas functions. O controller só orquestra: chama o helper, invoca a action, mostra toast, recarrega.

**Interfaces:**
- Consumes: Tasks 1 e 4.
- Produces: o conjunto que a Task 7 espelha para venda.

**A seção é `uxap:ObjectPageSection` com `core:Fragment`** — é assim que `Detail.view.xml` compõe Impostos, Fixação de Preços, Washouts, Corretores e Liberações (linhas ~231-280). Não use `IconTabFilter`: a página não é feita disso.

- [ ] **Step 1: A seção e a tabela**

No `Detail.view.xml`, depois da seção de Washouts:

```xml
      <uxap:ObjectPageSection titleUppercase="false" title="Minutas">
        <uxap:subSections>
          <uxap:ObjectPageSubSection>
            <uxap:blocks>
              <core:Fragment fragmentName="siagrob1.view.purchaseContracts.fragments.PurchaseContractDrafts" type="XML" />
            </uxap:blocks>
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
```

Copie a forma exata da seção vizinha — se ela usa outros atributos, use também.

Colunas da tabela: Sequência, Tipo, Descrição, Situação, Enviada em, Assinada em. Situação como `ObjectStatus` usando `draftStatusLabel`/`draftStatusState`.

**Três armadilhas nesta tabela:**
- Datas: `constraints: { precision: 7 }` (armadilha 3).
- `Status`/`DraftType`: `targetType: 'any'` em qualquer expressão (armadilhas 1 e 2). `LastError` também — `{= !!${path:'LastError', targetType:'any'} }`.
- A lista vem da **function** `ContractDraftsListByContract`, que devolve array cru: **JSONModel**, não binding direto (armadilha 5). Recarregue-a após cada action.

- [ ] **Step 2: Signatários ao expandir a linha**

O DTO já traz `Signers`. Mostre Nome, E-mail, Papel, Lado (Empresa/Parceiro), Situação, Assinado em. Como está no mesmo JSONModel, é binding relativo dentro do item — sem chamada extra.

- [ ] **Step 3: Botões e as guardas de estado**

| Botão | Habilitado quando | Action/Function |
|---|---|---|
| Nova minuta | sempre (contrato não cancelado) | `ContractDraftsCreate` |
| Editar texto | `Status === 'Draft'` | `ContractDraftsGetBody` → diálogo → `ContractDraftsUpdate` |
| Excluir | `Status === 'Draft'` | `ContractDraftsDelete` |
| PDF | sempre | `ContractDraftsDownloadPdf` |
| Enviar para assinatura | `Status === 'Draft'` | `ContractDraftsSendToSignature` |
| Cancelar | `AwaitingSignature` ou `PartiallySigned` | `ContractDraftsCancel` |
| Atualizar situação | `AwaitingSignature`, `PartiallySigned`, ou `Signed` **sem** anexo | `ContractDraftsRefreshState` |

A última linha não é capricho: o backend deixa a minuta assinada **sem PDF** quando o download falha, e essa é a única forma de o usuário buscar o documento depois. `SignedAttachmentKey` nulo é o sinal.

As guardas são espelho das do backend — se divergirem, o usuário vê um botão que devolve erro. O backend recusa de qualquer jeito; a guarda é só cortesia.

- [ ] **Step 4: Invocação das actions**

Padrão do projeto, igual a `washoutApproval/Main.controller.ts`:

```ts
const oModel = this.getView().getModel() as ODataModel;
const action = oModel.bindContext(this.api.contractDraftsSendToSignature);
action.setParameter("Key", key);
try {
  await action.invoke();
  MessageToast.show("Minuta enviada para assinatura.");
  await this.reloadDrafts();
} catch (e) {
  // A mensagem de negócio do backend já vem pelo handler global de mensagens OData.
}
```

**Enviar para assinatura é síncrono e fala com o D4Sign** — pode levar segundos. `setBusy(true)` antes, `false` no `finally`, sempre.

- [ ] **Step 5: Download do PDF**

`ContractDraftsDownloadPdf` devolve um arquivo, não JSON. Não use `bindContext`. Veja como o projeto já baixa anexo de contrato (`PurchaseContractAttachments`) e **faça igual** — inclusive quanto a autenticação e nome de arquivo.

- [ ] **Step 6: Gates, navegador e commit**

Com o backend rodando e `Signature:Enabled=false`, exercite: criar minuta, editar texto, baixar PDF, excluir. **"Enviar para assinatura" deve falhar com "Assinatura eletrônica não está habilitada neste ambiente."** — é o comportamento certo e prova que a mensagem do backend chega à tela.

```bash
git add webapp/view/purchaseContracts webapp/controller/purchaseContracts webapp/i18n/i18n.properties
git commit -m "feat(platform): operar minutas na pagina do contrato de compra"
```

---

## Task 7: Seção "Minutas" no contrato de venda

**Files:** espelho da Task 6 em `salesContracts`.

- [ ] **Step 1: Espelhar, não reinventar**

Só depois de a Task 6 ter passado pela revisão. Mesma estrutura, `ContractType='Sales'` nas chamadas, modelos filtrados por `Sales`/`Both`.

**Antes de copiar, compare os dois controllers de detalhe.** `salesContracts` pode divergir de `purchaseContracts` em coisas que importam aqui. Se divergir, **siga o vizinho de venda** e diga no relatório o que mudou.

O helper `webapp/helpers/contractDraftActions.ts` **já existe desde a Task 6, com teste** — consuma-o, não reimplemente. Se algo dele precisar mudar para servir venda, mude no helper e no teste, não no controller.

- [ ] **Step 2: Gates, navegador e commit**

```bash
git add webapp/view/salesContracts webapp/controller/salesContracts webapp/helpers webapp/i18n/i18n.properties
git commit -m "feat(platform): operar minutas na pagina do contrato de venda"
```

---

## Task 8: Varredura final

- [ ] **Step 1: Gates em tudo**

`yarn ts-typecheck && yarn lint && yarn ui5lint` limpos no repositório inteiro.

- [ ] **Step 2: Caçar as sete armadilhas no que foi escrito**

Elas passam nos gates. Reveja **cada** binding novo:
- toda expressão sobre enum ou string tem `targetType: 'any'`?
- todo binding de data tem `constraints: { precision: 7 }`?
- toda list binding relativa que sofre `refresh()` tem `$$ownRequest`?
- nenhuma tabela binda direto numa function custom?
- nenhum `&&` literal em atributo XML?
- ordenação vem do binding, não do serviço?

Liste no relatório o que você conferiu, não só "revisei".

- [ ] **Step 3: Percurso completo no navegador**

Menu → Modelos de Contrato → criar modelo com placeholders → Signatários da Empresa → criar → ficha de um parceiro → criar signatário → contrato de compra → Minutas → criar → editar texto → PDF → excluir. Depois o mesmo num contrato de venda. **Relate o que viu, com o que quebrou, se quebrou.**

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(platform): ajustar bindings e textos apos varredura"
```

---

## Verificação final da fase

1. Os três gates limpos.
2. O percurso do Step 3 da Task 8, inteiro, num navegador.
3. Os dois itens de menu (`contractTemplates`, `companySignatories`) navegam — se não navegarem, o nome da rota não bate com a chave do menu que a Fase 1 criou.
4. Com `Signature:Enabled=false`, "Enviar para assinatura" mostra a mensagem do backend em vez de erro técnico.
5. **Nada disso prova a assinatura de verdade.** O fluxo com o D4Sign continua sem validação — depende do sandbox, de credenciais e de uma URL pública para o webhook, e é decisão do usuário quando fazer.

## Pontos que podem exigir ajuste na execução

- **`sap.ui.richtexteditor` pode não resolver** no setup atual. Task 1 Step 1 existe para descobrir isso antes de qualquer investimento.
- **`editorType`** aceito varia por versão do SAPUI5. Se `TinyMCE6` não existir na 1.141, reporte a saída em vez de tentar valores no escuro.
- **Sanitização do preview × fidelidade ao PDF**: se a sanitização remover marcação que o PDF renderiza, é decisão do usuário, não do implementador.
- **`salesContracts` pode divergir de `purchaseContracts`** mais do que a simetria sugere. A Task 7 manda comparar antes de copiar.
