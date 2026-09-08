# Telas do módulo financeiro — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o módulo financeiro da Fase 1 alcançável pelo usuário — quatro telas (Contas Financeiras, Contas a Pagar, Contas a Receber, Adiantamentos) sobre a API OData que já existe e está verificada.

**Architecture:** Contas a Pagar e Contas a Receber são a **mesma entidade** (`FinancialDocuments`) com `Direction` diferente, então a lógica comum mora num `FinancialDocumentsBaseController` e cada tela é uma subclasse magra que só fixa direção, título e rótulos — o padrão que o projeto já usa em `PurchaseContractsBaseController`/`SalesContractsBaseController`. O documento ganha uma **página de detalhe** compartilhada, mostrando as baixas do ledger e o log de alterações, porque um razão auxiliar precisa responder de onde veio o saldo. Contas Financeiras é um cadastro simples (lista + Add/Edit) e Adiantamentos é uma lista com diálogo de criação.

**Tech Stack:** OpenUI5 1.141 + TypeScript, OData v4 (`sap.ui.model.odata.v4.ODataModel`), `sap.ui.table.Table`, `sap.f.DynamicPage`, `sap.uxap.ObjectPageLayout`, `sap.ui.comp.filterbar.FilterBar`, `sap.ui.export.Spreadsheet`.

**Spec:** `../siagro-b1-backend/docs/superpowers/specs/2026-09-07-financial-documents-design.md` — leia antes de qualquer tarefa. O backend está implementado, revisado e com 1488 testes verdes; a seção **Frontend** do spec é a que este plano executa.

**Backend plan (contexto, não obrigatório):** `../siagro-b1-backend/docs/superpowers/plans/2026-09-07-financial-documents-phase1.md`

## Global Constraints

- **NUNCA commitar ou dar push.** Commits deste projeto são feitos manualmente pelo usuário. A única operação de escrita no git permitida é `git add`, e **todo arquivo novo deve ser staged imediatamente após ser criado**. Onde a skill de planos pediria "Commit", este plano pede `git add`.
- **Identificadores em inglês; texto que o usuário lê em pt-BR.**
- **Este app NÃO usa i18n.** `webapp/i18n/i18n.properties` ainda tem as três linhas do template e todos os rótulos são pt-BR embutidos nas views. É uma divergência consciente da recomendação da SAP: introduzir i18n em quatro telas num app com ~90 telas embutidas criaria duas convenções concorrentes. **Escreva pt-BR direto nas views**, como o resto do app.
- **`MENU_ITEMS.Key` do backend precisa bater com o `name` da rota no `manifest.json`** — `App.controller.ts` navega com `navTo(item.getKey())`. As quatro chaves já estão no banco: `financialAccounts`, `accountsPayable`, `accountsReceivable`, `financialAdvances`. Errar um nome deixa o item de menu visível e inerte.
- **Enum em binding SEMPRE com `targetType: 'any'`.** Sem isso o UI5 usa `odata.type.Raw` e estoura `FormatException` ao renderizar.
- **`$filter` montado como STRING CRUA** e aplicado por `oBinding.changeParameters({ $filter: ... })`. `sap.ui.model.Filter` não sabe formatar enum OData e estoura "Unsupported type". `undefined` remove o parâmetro — é assim que "Limpar" volta a trazer tudo.
- **Valor monetário de EXIBIÇÃO** usa `type: 'sap.ui.model.odata.type.Decimal'` com `constraints`/`formatOptions`, nunca formatter JS. **Valor monetário de ENTRADA** (diálogos) usa `sap.ui.model.odata.type.Double` — `Edm.Decimal` é serializado como string pelo UI5 v4 e o backend devolve 400 sem nomear o campo (`../siagro-b1-backend/docs/superpowers/specs/2026-08-06-odata-decimal-string-blocker.md`).
- **Action OData v4 sempre por `bindContext(path)` + `setParameter` + `invoke()`**, nunca `callFunction`. O path termina em `(...)` mesmo sem parâmetros.
- **Visibilidade condicional com expression binding explícito**: `visible="{= ${path: 'X', targetType: 'any'} === 'Y' }"`. Binding indefinido avalia como `true` e o botão aparece antes de carregar.
- **Se sobrescrever `onBeforeRendering`, chame `super.onBeforeRendering()`** — é ele que registra a persistência de largura/ordem de coluna (GAC-1163). Sem a chamada, a persistência morre naquela tela.
- **Formulário novo usa `sap.ui.layout.form.Form` + `ColumnLayout`, nunca `SimpleForm`** (recomendação da SAP; o `PurchaseInvoiceCommentDialog` do projeto já faz assim). Padrão de colunas: `columnsM="2" columnsL="3" columnsXL="4"`, salvo num diálogo estreito de campo único.
- **Evento tipado em TypeScript** usa o tipo específico do controle (`Input$ValueHelpRequestEvent`, `Button$PressEvent`), disponível desde UI5 1.115.
- **`ui5lint` NUNCA esteve limpo neste repositório.** Medido em 07/09/2026: **771 achados** no
  estado atual, e o comando **sai com código 1**. Ele não é um gate de passa/não-passa — é um
  relatório. O critério real é: **nenhum achado NOVO nos arquivos que você tocou**, exceto os
  explicitamente parqueados abaixo. Nunca "conserte" achado pré-existente de outro arquivo: isso
  é refactor de repositório disfarçado de correção.
- **Três `no-deprecated-api` estão PARQUEADOS**, com medição, porque são convenção consolidada e
  trocá-los mudaria comportamento ou exigiria refactor global: `visibleRowCountMode` (68 views),
  `getSelectedIndex` (56 controllers, e o helper compartilhado `BaseController.getSelectRowContext`
  é construído sobre ele) e `valueHelpOnly` (45 arquivos, 120 ocorrências — removê-lo torna o campo
  digitável e deixa passar código de filial inexistente, o que é pior que a depreciação).
- **`no-globals` sobre NOME DE TIPO UI5 em binding XML está PARQUEADO, em qualquer tipo.** Medido:
  **416 ocorrências em 137 arquivos** — `type.Float`, `odata.type.Double`, `type.String`,
  `odata.type.DateTimeOffset`, `odata.type.Decimal` e outros. A alternativa limpa que a SAP
  recomenda é declarar o tipo em `core:require` e referenciá-lo por alias; este repositório usa
  `core:require` em 184 arquivos **exclusivamente para formatters, nunca para tipos**. Adotar o
  alias nas 4 telas novas criaria um segundo idioma em 4 de 137 arquivos sem reduzir ruído algum.
  É dívida de repositório com ticket próprio. **Não pergunte de novo por tipo específico** — a
  regra vale para todos.
- **Todo valor digitado pelo usuário que entra no `$filter` PRECISA ser escapado** com
  `escapeODataLiteral` (aspa simples vira duas, o escape do OData v4). Sem isso um parceiro chamado
  "Sant'Ana" — nome comuníssimo no Brasil — monta um `$filter` malformado e a requisição falha. O
  helper vive no `FinancialDocumentsBaseController` e cobre as três telas de documento. **Não**
  escape o literal de data (é `Edm.Date` sem aspas) nem os filtros fixos de direção e natureza, que
  são constantes das subclasses.
- **Não reinvente value help.** `CommonController` já expõe `openBusinessPartnersValueHelp`, `openSuppliersValueHelp`, `openCostumersValueHelp`, `openBranchsValueHelp`, `openLedgerAccountsValueHelp` e ~25 outros, além de `applyValueHelp(...)` genérico.

## Superfície do backend que estas telas consomem

Já implementada e verificada. **Não altere o backend neste plano.**

**Entity sets:** `FinancialAccounts` (CRUD completo), `FinancialDocuments` (somente leitura), `FinancialSettlements` (somente leitura), `FinancialDocumentChangeLogs`.

**Navegações declaradas:** `FinancialDocuments({key})/Settlements` e `FinancialDocuments({key})/ChangeLogs` (ambas nas duas formas de rota).

**Actions:** `FinancialDocumentsSettle`, `FinancialDocumentsReverseSettlement`, `FinancialDocumentsCancel`, `FinancialDocumentsSetDueDate`, `FinancialAdvancesCreate`, `FinancialDocumentsRecalculateBalance`, `FinancialDocumentsGenerateBacklog`.

**Functions:** `FinancialDocumentsGetTotals(Direction={d})` e `(Direction={d},BranchCode={b})`; `FinancialDocumentsGetByContract(ContractType={t},ContractKey={k})`.

**Propriedades calculadas de `FinancialDocument`** (registradas no EDM, seguras em `$select`): `OpenAmount`, `IsBlockedForSettlement`, `IsOverdue`, `AvailableAdvanceAmount`.

**Enums, como string no OData:** `Direction` = `Receivable` | `Payable` · `Nature` = `Provisional` | `Firm` | `Advance` | `TaxWithholding` (a Fase 1 só escreve `Provisional` e `Advance`) · `Status` = `Open` | `PartiallySettled` | `Settled` | `Canceled` · `OriginType` = `Manual` | `PurchaseContractPriceFixation` | `SalesContractPriceFixation` | `PurchaseInvoice` | `SalesInvoice` | `FinancialDocument`.

**Regra de negócio que a tela precisa respeitar:** documento com `IsBlockedForSettlement = true` (todo provisório) **não pode ser baixado**. O backend recusa com mensagem pt-BR, mas o botão não deve nem aparecer.

---

## File Structure

**Rotas e registro** (modificar)
- `webapp/manifest.json` — 9 rotas e 9 alvos novos.
- `webapp/model/ServerRoutes.ts` — bloco `// financeiro` com os paths de action e function.
- `webapp/model/formatter.ts` — formatters dos quatro enums financeiros.

**Contas Financeiras** — cadastro simples, mesmo shape de `usages`
- `webapp/view/financialAccounts/{Main,Add,Edit}.view.xml`
- `webapp/view/financialAccounts/fragments/Form.fragment.xml` (compartilhado por Add e Edit)
- `webapp/controller/financialAccounts/{BaseController,Main,Add,Edit}.controller.ts`

**Documentos financeiros** — o núcleo compartilhado
- `webapp/controller/financialDocuments/FinancialDocumentsBaseController.ts` — **toda a lógica comum**: montagem do `$filter`, seleção de linha, guardas de ação, colunas de export, diálogos.
- `webapp/view/financialDocuments/fragments/Filterbar.fragment.xml` — uma só, usada pelas duas listas.
- `webapp/view/financialDocuments/fragments/{SettleDialog,SetDueDateDialog}.fragment.xml`
- `webapp/view/financialDocuments/{Detail}.view.xml` + `webapp/controller/financialDocuments/Detail.controller.ts` — detalhe compartilhado pelas três listas.
- `webapp/view/financialDocuments/fragments/{Settlements,ChangeLogs}.fragment.xml`

**Contas a Pagar / a Receber** — subclasses magras
- `webapp/view/accountsPayable/Main.view.xml` + `webapp/controller/accountsPayable/Main.controller.ts`
- `webapp/view/accountsReceivable/Main.view.xml` + `webapp/controller/accountsReceivable/Main.controller.ts`

**Adiantamentos**
- `webapp/view/financialAdvances/Main.view.xml` + `fragments/CreateAdvanceDialog.fragment.xml`
- `webapp/controller/financialAdvances/Main.controller.ts`

**Sem testes automatizados.** `webapp/test/` só contém o unit test e a jornada OPA do template; nenhum dos ~90 módulos de feature tem teste. `yarn test` **não passa** neste repositório — o gate de cobertura exige 50% contra ~2,4% reais. Os gates reais são `ts-typecheck`, `lint`, `ui5lint` e a verificação no navegador.

---

## Task 1: Rotas, alvos, paths e formatters

**Files:**
- Modify: `webapp/manifest.json`
- Modify: `webapp/model/ServerRoutes.ts`
- Modify: `webapp/model/formatter.ts`

**Interfaces:**
- Produces: os nomes de rota `financialAccounts`, `financialAccountsAdd`, `financialAccountsEdit`, `accountsPayable`, `accountsReceivable`, `financialAdvances`, `financialDocumentsDetail`; as chaves de `ServerRoutes` usadas por todas as tarefas seguintes; e os formatters `formatFinancialDirection`, `formatFinancialNature`, `formatFinancialStatus`, `stateFinancialStatus`, `formatFinancialAccountType`.

- [ ] **Step 1: Acrescentar as rotas no `manifest.json`**

No array `sap.ui5.routing.routes`, no fim, mantendo o estilo dos vizinhos. **Os quatro primeiros `name` são os que o menu do banco já referencia** — errar um deixa o item visível e inerte:

```json
{
  "pattern": "financial-accounts",
  "name": "financialAccounts",
  "target": "financialAccounts"
},
{
  "pattern": "financial-accounts/add",
  "name": "financialAccountsAdd",
  "target": "financialAccountsAdd"
},
{
  "pattern": "financial-accounts/{code}/edit",
  "name": "financialAccountsEdit",
  "target": "financialAccountsEdit"
},
{
  "pattern": "accounts-payable",
  "name": "accountsPayable",
  "target": "accountsPayable"
},
{
  "pattern": "accounts-receivable",
  "name": "accountsReceivable",
  "target": "accountsReceivable"
},
{
  "pattern": "financial-advances",
  "name": "financialAdvances",
  "target": "financialAdvances"
},
{
  "pattern": "financial-documents/{id}/detail",
  "name": "financialDocumentsDetail",
  "target": "financialDocumentsDetail"
}
```

- [ ] **Step 2: Acrescentar os alvos no `manifest.json`**

No objeto `sap.ui5.routing.targets`. `level: 1` para lista, `level: 2` para as demais, `clearControlAggregation: true` em todos:

```json
"financialAccounts": {
  "id": "financialAccounts",
  "level": 1,
  "name": "siagrob1.view.financialAccounts.Main",
  "clearControlAggregation": true
},
"financialAccountsAdd": {
  "id": "financialAccountsAdd",
  "level": 2,
  "name": "siagrob1.view.financialAccounts.Add",
  "clearControlAggregation": true
},
"financialAccountsEdit": {
  "id": "financialAccountsEdit",
  "level": 2,
  "name": "siagrob1.view.financialAccounts.Edit",
  "clearControlAggregation": true
},
"accountsPayable": {
  "id": "accountsPayable",
  "level": 1,
  "name": "siagrob1.view.accountsPayable.Main",
  "clearControlAggregation": true
},
"accountsReceivable": {
  "id": "accountsReceivable",
  "level": 1,
  "name": "siagrob1.view.accountsReceivable.Main",
  "clearControlAggregation": true
},
"financialAdvances": {
  "id": "financialAdvances",
  "level": 1,
  "name": "siagrob1.view.financialAdvances.Main",
  "clearControlAggregation": true
},
"financialDocumentsDetail": {
  "id": "financialDocumentsDetail",
  "level": 2,
  "name": "siagrob1.view.financialDocuments.Detail",
  "clearControlAggregation": true
}
```

- [ ] **Step 3: Acrescentar os paths em `ServerRoutes.ts`**

No objeto default, como bloco novo. Actions terminam em `(...)` porque `bindContext().invoke()` exige binding diferido:

```typescript
  // financeiro
  financialAccounts: '/odata/FinancialAccounts',
  financialDocuments: '/odata/FinancialDocuments',
  financialDocumentsSettle: '/FinancialDocumentsSettle(...)',
  financialDocumentsReverseSettlement: '/FinancialDocumentsReverseSettlement(...)',
  financialDocumentsCancel: '/FinancialDocumentsCancel(...)',
  financialDocumentsSetDueDate: '/FinancialDocumentsSetDueDate(...)',
  financialAdvancesCreate: '/FinancialAdvancesCreate(...)',
```

- [ ] **Step 4: Acrescentar os formatters em `formatter.ts`**

No objeto default, seguindo o padrão `Map` dos formatters de enum existentes:

```typescript
  formatFinancialDirection: (value: string) => {
    const m = new Map<string, string>();
    m.set("Payable", "A pagar");
    m.set("Receivable", "A receber");

    return m.get(value) ?? "";
  },

  formatFinancialNature: (value: string) => {
    const m = new Map<string, string>();
    m.set("Provisional", "Provisório");
    m.set("Firm", "Firme");
    m.set("Advance", "Adiantamento");
    m.set("TaxWithholding", "Retenção");

    return m.get(value) ?? "";
  },

  formatFinancialStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Open", "Em aberto");
    m.set("PartiallySettled", "Baixado parcial");
    m.set("Settled", "Quitado");
    m.set("Canceled", "Cancelado");

    return m.get(value) ?? "";
  },

  stateFinancialStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Open", "Information");
    m.set("PartiallySettled", "Warning");
    m.set("Settled", "Success");
    m.set("Canceled", "Error");

    return m.get(value) ?? "None";
  },

  formatFinancialAccountType: (value: string) => {
    const m = new Map<string, string>();
    m.set("Cash", "Caixa");
    m.set("Bank", "Banco");

    return m.get(value) ?? "";
  },
```

- [ ] **Step 5: Verificar**

Run: `yarn ts-typecheck && yarn lint`
Expected: sem erros. O `manifest.json` não é checado por esses comandos — releia os dois blocos e confirme que cada `target` citado numa rota existe como chave em `targets`, e que os quatro nomes de menu estão escritos exatamente como listados.

- [ ] **Step 6: Stage**

```bash
git add webapp/manifest.json webapp/model/ServerRoutes.ts webapp/model/formatter.ts
```

---

## Task 2: Contas Financeiras — lista

**Files:**
- Create: `webapp/view/financialAccounts/Main.view.xml`
- Create: `webapp/controller/financialAccounts/BaseController.ts`
- Create: `webapp/controller/financialAccounts/Main.controller.ts`

**Interfaces:**
- Consumes: rota `financialAccounts`, `ServerRoutes.financialAccounts`, `formatter.formatFinancialAccountType` (Task 1).
- Produces: `financialAccounts/BaseController.ts` (`export abstract class BaseController extends CommonController`), que as telas Add e Edit da Task 3 estendem.

- [ ] **Step 1: Criar o BaseController da feature**

`webapp/controller/financialAccounts/BaseController.ts` — por ora só encadeia o `CommonController`; existe para Add/Edit terem onde pendurar value help depois:

```typescript
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import { ValueState } from "sap/ui/core/library";
import Form from "sap/ui/layout/form/Form";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * Base das telas de Conta Financeira. Os value helps genéricos (filial, conta contábil) já
 * vivem no CommonController e não devem ser reimplementados aqui.
 *
 * ⚠️ `BaseController.validateForm` do projeto NÃO serve para estas telas: ele faz
 * `oForm.getContent()`, que só existe em `sap.ui.layout.form.SimpleForm`. Um
 * `sap.ui.layout.form.Form` expõe `getFormContainers()` e estouraria em runtime. Como a
 * recomendação da SAP é usar `Form` + `ColumnLayout` em formulário novo, a validação dos
 * obrigatórios fica aqui, percorrendo a hierarquia certa.
 */
export abstract class BaseController extends CommonController {

  /** Valida os campos `required` de um `sap.ui.layout.form.Form`. */
  protected validateFinancialForm(sFormId: string): boolean {
    const oForm = this.byId(sFormId) as Form;
    let bValid = true;

    if (!oForm) return false;

    oForm.getFormContainers().forEach((oContainer) => {
      oContainer.getFormElements().forEach((oElement) => {
        oElement.getFields().forEach((oField) => {
          if (oField instanceof Input && oField.getRequired()) {
            const sValue = (oField.getValue() ?? "").trim();
            oField.setValueState(sValue ? ValueState.None : ValueState.Error);
            if (!sValue) {
              oField.setValueStateText("Campo obrigatório");
              bValid = false;
            }
          }

          if (oField instanceof Select && oField.getRequired()) {
            const sKey = oField.getSelectedKey();
            oField.setValueState(sKey ? ValueState.None : ValueState.Error);
            if (!sKey) {
              oField.setValueStateText("Campo obrigatório");
              bValid = false;
            }
          }
        });
      });
    });

    return bValid;
  }
}
```

- [ ] **Step 2: Criar a view da lista**

`webapp/view/financialAccounts/Main.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.financialAccounts.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:t="sap.ui.table"
	xmlns:f="sap.f"
	core:require="{
		formatter: 'siagrob1/model/formatter'
	}">

	<f:DynamicPage busyIndicatorDelay="0" busy="{ui>/busy}">
		<f:title>
			<f:DynamicPageTitle>
				<f:heading>
					<Title text="Contas Financeiras"/>
				</f:heading>
			</f:DynamicPageTitle>
		</f:title>
		<f:content>
			<t:Table
				id="financialAccountsTable"
				busyIndicatorDelay="0"
				selectionMode="Single"
				selectionBehavior="Row"
				class="sapUiSizeCondensed"
				visibleRowCountMode="Auto"
				enableBusyIndicator="true"
				alternateRowColors="true"
				rows="{
					path: '/FinancialAccounts',
					sorter: {
						path: 'Code'
					}
				}"
			>
				<t:extension>
					<OverflowToolbar>
						<Title text="Contas Financeiras" />
						<ToolbarSpacer />
						<Button type="Emphasized" icon="sap-icon://add" text="Incluir" press=".onCreate"/>
						<Button type="Transparent" text="Editar" press=".onEdit"/>
						<Button type="Transparent" text="Atualizar" press=".onRefresh"/>
					</OverflowToolbar>
				</t:extension>
				<t:columns>
					<t:Column label="Código" width="10rem" sortProperty="Code" filterProperty="Code">
						<t:template>
							<Text text="{Code}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Nome" width="22rem" sortProperty="Name" filterProperty="Name">
						<t:template>
							<Text text="{Name}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Tipo" width="9rem" hAlign="Center" sortProperty="Type">
						<t:template>
							<Text text="{
								path: 'Type',
								targetType: 'any',
								formatter: 'formatter.formatFinancialAccountType'
							}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Banco" width="16rem">
						<t:template>
							<Text text="{BankName}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Agência" width="8rem">
						<t:template>
							<Text text="{BankBranch}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Conta" width="10rem">
						<t:template>
							<Text text="{BankAccountNumber}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Filial" width="8rem">
						<t:template>
							<Text text="{BranchCode}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Inativa" width="7rem" hAlign="Center" sortProperty="Inactive">
						<t:template>
							<CheckBox selected="{Inactive}" editable="false"/>
						</t:template>
					</t:Column>
				</t:columns>
			</t:Table>
		</f:content>
	</f:DynamicPage>

</mvc:View>
```

- [ ] **Step 3: Criar o controller da lista**

`webapp/controller/financialAccounts/Main.controller.ts`:

```typescript
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

export default class Main extends BaseController {
  formatter = { ...formatter }

  onRefresh(): void {
    (this.byId("financialAccountsTable").getBinding("rows") as ODataListBinding)?.refresh();
  }

  onCreate(): void {
    this.navTo("financialAccountsAdd");
  }

  onEdit(): void {
    const oContext = this.selectedContext();
    if (!oContext) return;

    this.navTo("financialAccountsEdit", { code: oContext.getProperty("Code") as string });
  }

  private selectedContext(): Context | null {
    const oTable = this.byId("financialAccountsTable") as Table;
    const i = oTable.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione uma conta financeira.");
      return null;
    }
    return oTable.getContextByIndex(i) as Context;
  }
}
```

- [ ] **Step 4: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos. `ui5lint` pode reportar avisos pré-existentes em outros arquivos — só os seus contam.

- [ ] **Step 5: Stage**

```bash
git add webapp/view/financialAccounts/ webapp/controller/financialAccounts/
```

---

## Task 3: Contas Financeiras — inclusão e alteração

**Files:**
- Create: `webapp/view/financialAccounts/fragments/Form.fragment.xml`
- Create: `webapp/view/financialAccounts/Add.view.xml`
- Create: `webapp/view/financialAccounts/Edit.view.xml`
- Create: `webapp/controller/financialAccounts/Add.controller.ts`
- Create: `webapp/controller/financialAccounts/Edit.controller.ts`

**Interfaces:**
- Consumes: `financialAccounts/BaseController.ts` (Task 2), rotas `financialAccountsAdd`/`financialAccountsEdit` (Task 1).

- [ ] **Step 1: Criar o fragmento de formulário, compartilhado por Add e Edit**

`webapp/view/financialAccounts/fragments/Form.fragment.xml`. Usa `sap.ui.layout.form.Form` + `ColumnLayout` — **não `SimpleForm`**. O que muda entre Add e Edit é `{ui>/editable}` e o campo `Code`, editável só na inclusão (é a chave):

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
  <f:Form id="financialAccountForm" editable="true">
    <f:layout>
      <f:ColumnLayout columnsM="2" columnsL="3" columnsXL="4"/>
    </f:layout>
    <f:formContainers>
      <f:FormContainer title="Identificação">
        <f:formElements>
          <f:FormElement label="Código">
            <f:fields>
              <Input
                value="{Code}"
                maxLength="10"
                required="true"
                editable="{ui>/codeEditable}"
                liveChange=".validateField"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Nome">
            <f:fields>
              <Input
                value="{Name}"
                maxLength="100"
                required="true"
                editable="{ui>/editable}"
                liveChange=".validateField"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Tipo">
            <f:fields>
              <Select
                selectedKey="{path: 'Type', targetType: 'any'}"
                required="true"
                enabled="{ui>/editable}"
                change=".onTypeChange">
                <core:ListItem key="Cash" text="Caixa"/>
                <core:ListItem key="Bank" text="Banco"/>
              </Select>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Moeda">
            <f:fields>
              <Select selectedKey="{path: 'Currency', targetType: 'any'}" enabled="{ui>/editable}">
                <core:ListItem key="Brl" text="Real (BRL)"/>
                <core:ListItem key="Usd" text="Dólar (USD)"/>
              </Select>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Filial">
            <f:fields>
              <Input
                value="{BranchCode}"
                showValueHelp="true"
                valueHelpOnly="true"
                editable="{ui>/editable}"
                valueHelpRequest=".openBranchsValueHelp"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Inativa">
            <f:fields>
              <CheckBox selected="{Inactive}" editable="{ui>/editable}"/>
            </f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>
      <f:FormContainer title="Dados bancários" visible="{ui>/isBank}">
        <f:formElements>
          <f:FormElement label="Código do banco">
            <f:fields>
              <Input value="{BankCode}" maxLength="3" editable="{ui>/editable}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Nome do banco">
            <f:fields>
              <Input value="{BankName}" maxLength="100" editable="{ui>/editable}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Agência">
            <f:fields>
              <Input value="{BankBranch}" maxLength="10" editable="{ui>/editable}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Conta">
            <f:fields>
              <Input value="{BankAccountNumber}" maxLength="20" editable="{ui>/editable}"/>
            </f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>
    </f:formContainers>
  </f:Form>
</core:FragmentDefinition>
```

- [ ] **Step 2: Criar a view de inclusão**

`webapp/view/financialAccounts/Add.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.financialAccounts.Add"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:uxap="sap.uxap">

  <uxap:ObjectPageLayout showFooter="true" busy="{ui>/busy}" busyIndicatorDelay="0">
    <uxap:headerTitle>
      <uxap:ObjectPageDynamicHeaderTitle>
        <uxap:expandedHeading>
          <Title text="Nova Conta Financeira"/>
        </uxap:expandedHeading>
        <uxap:snappedHeading>
          <Title text="Nova Conta Financeira"/>
        </uxap:snappedHeading>
      </uxap:ObjectPageDynamicHeaderTitle>
    </uxap:headerTitle>
    <uxap:sections>
      <uxap:ObjectPageSection titleUppercase="false" title="Dados da Conta">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.financialAccounts.fragments.Form" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
    </uxap:sections>
    <uxap:footer>
      <OverflowToolbar>
        <ToolbarSpacer />
        <Button text="Salvar" type="Emphasized" press=".onSave"/>
        <Button text="Cancelar" press=".onCancel"/>
      </OverflowToolbar>
    </uxap:footer>
  </uxap:ObjectPageLayout>

</mvc:View>
```

- [ ] **Step 3: Criar a view de alteração**

`webapp/view/financialAccounts/Edit.view.xml` — idêntica à de inclusão exceto pelo `controllerName` e pelos títulos:

```xml
<mvc:View
	controllerName="siagrob1.controller.financialAccounts.Edit"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:uxap="sap.uxap">

  <uxap:ObjectPageLayout showFooter="true" busy="{ui>/busy}" busyIndicatorDelay="0">
    <uxap:headerTitle>
      <uxap:ObjectPageDynamicHeaderTitle>
        <uxap:expandedHeading>
          <Title text="Conta Financeira {Code}"/>
        </uxap:expandedHeading>
        <uxap:snappedHeading>
          <Title text="Conta Financeira {Code}"/>
        </uxap:snappedHeading>
      </uxap:ObjectPageDynamicHeaderTitle>
    </uxap:headerTitle>
    <uxap:sections>
      <uxap:ObjectPageSection titleUppercase="false" title="Dados da Conta">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.financialAccounts.fragments.Form" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
    </uxap:sections>
    <uxap:footer>
      <OverflowToolbar>
        <ToolbarSpacer />
        <Button text="Salvar" type="Emphasized" press=".onSave"/>
        <Button text="Cancelar" press=".onCancel"/>
      </OverflowToolbar>
    </uxap:footer>
  </uxap:ObjectPageLayout>

</mvc:View>
```

- [ ] **Step 4: Criar o controller de inclusão**

`webapp/controller/financialAccounts/Add.controller.ts`. **Toda propriedade que o formulário edita entra no `create()` inicial, nem que seja `null`** — a primeira alteração de uma propriedade ausente estoura "Must not change a property before it has been read":

```typescript
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

export default class Add extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("financialAccountsAdd")
      .attachPatternMatched(() => this.prepare());
  }

  private prepare(): void {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/codeEditable", true);
    uiModel.setProperty("/isBank", false);

    const oBinding = (this.getModel() as ODataModel).bindList("/FinancialAccounts");

    // Toda propriedade editável precisa existir no create inicial, nem que seja null.
    const oContext = oBinding.create({
      Code: "",
      Name: "",
      Type: "Cash",
      Currency: "Brl",
      BankCode: null,
      BankName: null,
      BankBranch: null,
      BankAccountNumber: null,
      BranchCode: null,
      Inactive: false,
    }, false, false, false);

    this.getView().setBindingContext(oContext);
  }

  onTypeChange(): void {
    const ctx = this.getView().getBindingContext() as Context;
    (this.getModel("ui") as JSONModel)
      .setProperty("/isBank", ctx?.getProperty("Type") === "Bank");
  }

  async onSave(): Promise<void> {
    if (!this.validateFinancialForm("financialAccountForm")) return;

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        return;
      }

      MessageToast.show("Conta financeira incluída.");
      this.navTo("financialAccounts");
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar a conta financeira.");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("financialAccounts");
  }
}
```

- [ ] **Step 5: Criar o controller de alteração**

`webapp/controller/financialAccounts/Edit.controller.ts`. `Code` é a chave e não pode ser editado:

```typescript
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

export default class Edit extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("financialAccountsEdit")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { code } = ev.getParameter("arguments") as { code: string };
    if (code == null) return;

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    // A chave nunca é editável depois de gravada.
    uiModel.setProperty("/codeEditable", false);

    this.bindElement(`/FinancialAccounts('${code}')`);

    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      const ctx = this.getView().getBindingContext() as Context;
      uiModel.setProperty("/isBank", ctx?.getProperty("Type") === "Bank");
    });
  }

  onTypeChange(): void {
    const ctx = this.getView().getBindingContext() as Context;
    (this.getModel("ui") as JSONModel)
      .setProperty("/isBank", ctx?.getProperty("Type") === "Bank");
  }

  async onSave(): Promise<void> {
    if (!this.validateFinancialForm("financialAccountForm")) return;

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        return;
      }

      MessageToast.show("Conta financeira alterada.");
      this.navTo("financialAccounts");
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar a conta financeira.");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("financialAccounts");
  }
}
```

- [ ] **Step 6: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos.

- [ ] **Step 7: Stage**

```bash
git add webapp/view/financialAccounts/ webapp/controller/financialAccounts/
```

---

## Task 4: Núcleo compartilhado dos documentos financeiros

**Files:**
- Create: `webapp/controller/financialDocuments/FinancialDocumentsBaseController.ts`
- Create: `webapp/view/financialDocuments/fragments/Filterbar.fragment.xml`

**Interfaces:**
- Consumes: `formatter` e `ServerRoutes` (Task 1).
- Produces — **é o contrato que as Tasks 5, 6, 8 e 9 consomem**:
  - `abstract class FinancialDocumentsBaseController extends CommonController`
  - `protected abstract get tableId(): string`
  - `protected abstract get direction(): "Payable" | "Receivable" | null` — `null` na tela de adiantamentos, que filtra por natureza e não por direção
  - `protected abstract get natureFilter(): string | null` — ex.: `"Nature ne 'Advance'"` nas listas de pagar/receber, `"Nature eq 'Advance'"` em adiantamentos
  - `protected applyFilters(): void`
  - `protected selectedContext(): Context | null`
  - `protected createColumnConfig(): Column[]`
  - `onSearch()`, `onClearFilters()`, `onRefresh()`, `onDetail()`
  - `protected onRouteMatched()` — aplica o filtro E força `refresh()`; é o que as três listas
    chamam no gancho de rota
  - ⚠️ **`onExcel()` NÃO mora aqui.** Cada tela define o seu, porque o nome do arquivo e o da aba
    mudam ("Contas a pagar.xlsx", "Contas a receber.xlsx", "Adiantamentos.xlsx"). Um `onExcel` na
    base seria sobrescrito pelas três e nunca executaria.

- [ ] **Step 1: Criar o fragmento de filterbar, compartilhado pelas três listas**

`webapp/view/financialDocuments/fragments/Filterbar.fragment.xml`. Todo controle liga em `filter>/<Prop>`, o `Select` de enum leva `forceSelection="false"` e um item de chave vazia, e o `DatePicker` grava ISO:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:fb="sap.ui.comp.filterbar"
>
<fb:FilterBar
  id="financialDocumentsFb"
  search=".onSearch"
  showClearOnFB="true"
  clear=".onClearFilters">
  <fb:filterGroupItems>

    <fb:FilterGroupItem name="cardCode" label="Parceiro" groupName="GroupCardCode" visibleInFilterBar="true">
      <fb:control>
        <Input
          showClearIcon="true"
          showValueHelp="true"
          valueHelpRequest=".openBusinessPartnersValueHelp"
          value="{filter>/CardCode}"/>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="code" label="Número do título" groupName="GroupCode" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" value="{filter>/Code}"/>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="status" label="Situação" groupName="GroupStatus" visibleInFilterBar="true">
      <fb:control>
        <Select forceSelection="false" selectedKey="{filter>/Status}">
          <core:ListItem key="" text="Todas"/>
          <core:ListItem key="Open" text="Em aberto"/>
          <core:ListItem key="PartiallySettled" text="Baixado parcial"/>
          <core:ListItem key="Settled" text="Quitado"/>
          <core:ListItem key="Canceled" text="Cancelado"/>
        </Select>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="nature" label="Natureza" groupName="GroupNature" visibleInFilterBar="false">
      <fb:control>
        <Select forceSelection="false" selectedKey="{filter>/Nature}">
          <core:ListItem key="" text="Todas"/>
          <core:ListItem key="Provisional" text="Provisório"/>
          <core:ListItem key="Advance" text="Adiantamento"/>
        </Select>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="branchCode" label="Filial" groupName="GroupBranch" visibleInFilterBar="true">
      <fb:control>
        <Input
          showClearIcon="true"
          showValueHelp="true"
          valueHelpRequest=".openBranchsValueHelp"
          value="{filter>/BranchCode}"/>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="originDocNumber" label="Contrato" groupName="GroupOrigin" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" value="{filter>/OriginDocNumber}"/>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="dueFrom" label="Vencimento de" groupName="GroupDueFrom" visibleInFilterBar="true">
      <fb:control>
        <DatePicker
          value="{
            path: 'filter>/DueFrom',
            type: 'sap.ui.model.type.String'
          }"
          displayFormat="dd/MM/yyyy"
          valueFormat="yyyy-MM-dd"/>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="dueTo" label="Vencimento até" groupName="GroupDueTo" visibleInFilterBar="true">
      <fb:control>
        <DatePicker
          value="{
            path: 'filter>/DueTo',
            type: 'sap.ui.model.type.String'
          }"
          displayFormat="dd/MM/yyyy"
          valueFormat="yyyy-MM-dd"/>
      </fb:control>
    </fb:FilterGroupItem>

    <fb:FilterGroupItem name="overdueOnly" label="Somente vencidos" groupName="GroupOverdue" visibleInFilterBar="true">
      <fb:control>
        <CheckBox selected="{filter>/OverdueOnly}"/>
      </fb:control>
    </fb:FilterGroupItem>

  </fb:filterGroupItems>
</fb:FilterBar>
</core:FragmentDefinition>
```

- [ ] **Step 2: Criar o controller base**

`webapp/controller/financialDocuments/FinancialDocumentsBaseController.ts`:

```typescript
import { Column, EdmType } from "sap/ui/export/library";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * Lógica comum das três listas de documento financeiro (Contas a Pagar, Contas a Receber e
 * Adiantamentos). As três leem o MESMO entity set — o que muda é o filtro fixo de direção e
 * de natureza, mais os rótulos. Concentrar aqui é o que impede as telas de divergirem, do
 * mesmo jeito que PurchaseContractsBaseController/SalesContractsBaseController fazem.
 */
export abstract class FinancialDocumentsBaseController extends CommonController {

  /** Id da sap.ui.table.Table da subclasse. */
  protected abstract get tableId(): string;

  /** Direção fixa da tela, ou null quando a tela não filtra por direção (adiantamentos). */
  protected abstract get direction(): "Payable" | "Receivable" | null;

  /** Filtro fixo de natureza, em sintaxe OData, ou null. */
  protected abstract get natureFilter(): string | null;

  /** Nome da rota desta lista, guardado ao abrir o detalhe para o botão Voltar acertar o alvo. */
  protected abstract get originRoute(): string;

  protected binding(): ODataListBinding {
    return this.byId(this.tableId).getBinding("rows") as ODataListBinding;
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  /**
   * Monta o $filter como STRING CRUA e aplica por changeParameters.
   * sap.ui.model.Filter nao sabe formatar enum OData e estoura "Unsupported type".
   * undefined REMOVE o parametro — e assim que "Limpar" volta a trazer tudo.
   */
  protected applyFilters(): void {
    const oBinding = this.binding();
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = (filterModel?.getData() ?? {}) as Record<string, string | boolean>;
    const filters: string[] = [];

    if (this.direction) {
      filters.push(`Direction eq '${this.direction}'`);
    }

    if (this.natureFilter) {
      filters.push(this.natureFilter);
    }

    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];

      if (value === "" || value === null || value === undefined || value === false) return;

      if (key === "Status" || key === "Nature") {
        filters.push(`${key} eq '${String(value)}'`);
      } else if (key === "DueFrom") {
        filters.push(`DueDate ge ${String(value)}`);
      } else if (key === "DueTo") {
        filters.push(`DueDate le ${String(value)}`);
      } else if (key === "OverdueOnly") {
        // IsOverdue e OpenAmount sao [NotMapped] no backend: nao existem como coluna e o EF
        // nao traduz nenhum dos dois para SQL, entao "$filter=IsOverdue eq true" estoura em
        // 500. Traduzido literalmente para as colunas reais que compoem a expressao, para o
        // filtro concordar com o realce vermelho da coluna Vencimento, que le IsOverdue.
        const today = new Date();
        const iso = [
          String(today.getFullYear()),
          String(today.getMonth() + 1).padStart(2, "0"),
          String(today.getDate()).padStart(2, "0"),
        ].join("-");

        filters.push(`DueDate lt ${iso} and NetAmount gt SettledAmount`);
      } else if (key === "BranchCode" || key === "CardCode") {
        filters.push(`${key} eq '${String(value)}'`);
      } else {
        filters.push(`contains(${key},'${String(value)}')`);
      }
    });

    oBinding.changeParameters({
      $filter: filters.length > 0 ? filters.join(" and ") : undefined,
    });
  }

  protected selectedContext(): Context | null {
    const oTable = this.byId(this.tableId) as Table;
    const i = oTable.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione um título.");
      return null;
    }
    return oTable.getContextByIndex(i) as Context;
  }

  onDetail(): void {
    const oContext = this.selectedContext();
    if (!oContext) return;

    // Guarda de onde o usuario veio: sem isto o Voltar do detalhe joga sempre na mesma lista,
    // e quem entrou por Contas a Receber acaba em Contas a Pagar.
    (this.getModel("viewModel") as JSONModel)
      .setProperty("/financialDocumentOriginRoute", this.originRoute);

    this.navTo("financialDocumentsDetail", { id: oContext.getProperty("Key") as string });
  }

  protected createColumnConfig(): Column[] {
    const aCols: Column[] = [];
    aCols.push({ label: "Título", property: "Code", type: EdmType.String });
    aCols.push({ label: "Cod.Parceiro", property: "CardCode", type: EdmType.String });
    aCols.push({ label: "Parceiro", property: "CardName", type: EdmType.String });
    aCols.push({
      label: "Natureza", property: "Nature", type: EdmType.Enumeration,
      valueMap: {
        "Provisional": "Provisório", "Firm": "Firme",
        "Advance": "Adiantamento", "TaxWithholding": "Retenção",
      },
    });
    aCols.push({
      label: "Situação", property: "Status", type: EdmType.Enumeration,
      valueMap: {
        "Open": "Em aberto", "PartiallySettled": "Baixado parcial",
        "Settled": "Quitado", "Canceled": "Cancelado",
      },
    });
    aCols.push({ label: "Emissão", property: "DocumentDate", type: EdmType.Date });
    aCols.push({ label: "Vencimento", property: "DueDate", type: EdmType.Date });
    aCols.push({ label: "Valor", property: "NetAmount", type: EdmType.Number, scale: 2, delimiter: true });
    aCols.push({ label: "Baixado", property: "SettledAmount", type: EdmType.Number, scale: 2, delimiter: true });
    aCols.push({ label: "Em aberto", property: "OpenAmount", type: EdmType.Number, scale: 2, delimiter: true });
    aCols.push({ label: "Contrato", property: "OriginDocNumber", type: EdmType.String });
    aCols.push({ label: "Filial", property: "BranchCode", type: EdmType.String });
    return aCols;
  }
}
```

- [ ] **Step 3: Verificar**

Run: `yarn ts-typecheck && yarn lint`
Expected: sem erros. A classe é abstrata e ainda não tem subclasse — é esperado que nada a use ainda.

- [ ] **Step 4: Stage**

```bash
git add webapp/controller/financialDocuments/ webapp/view/financialDocuments/
```

---

## Task 5: Contas a Pagar

**Files:**
- Create: `webapp/view/accountsPayable/Main.view.xml`
- Create: `webapp/controller/accountsPayable/Main.controller.ts`

**Interfaces:**
- Consumes: `FinancialDocumentsBaseController` com `tableId`, `direction`, `natureFilter`, `applyFilters()`, `selectedContext()`, `createColumnConfig()` (Task 4); fragmento `siagrob1.view.financialDocuments.fragments.Filterbar` (Task 4); formatters (Task 1).

- [ ] **Step 1: Criar a view**

`webapp/view/accountsPayable/Main.view.xml`. A coluna de vencimento usa `ObjectStatus` com estado derivado de `IsOverdue`, para o vencido saltar aos olhos:

```xml
<mvc:View
	controllerName="siagrob1.controller.accountsPayable.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:t="sap.ui.table"
	xmlns:f="sap.f"
	core:require="{
		formatter: 'siagrob1/model/formatter'
	}">

	<f:DynamicPage busyIndicatorDelay="0" busy="{ui>/busy}">
		<f:title>
			<f:DynamicPageTitle>
				<f:heading>
					<Title text="Contas a Pagar"/>
				</f:heading>
			</f:DynamicPageTitle>
		</f:title>
		<f:header>
			<f:DynamicPageHeader>
				<f:content>
					<core:Fragment fragmentName="siagrob1.view.financialDocuments.fragments.Filterbar" type="XML" />
				</f:content>
			</f:DynamicPageHeader>
		</f:header>
		<f:content>
			<t:Table
				id="accountsPayableTable"
				busyIndicatorDelay="0"
				selectionMode="Single"
				selectionBehavior="Row"
				class="sapUiSizeCondensed"
				visibleRowCountMode="Auto"
				enableBusyIndicator="true"
				alternateRowColors="true"
				rows="{
					path: '/FinancialDocuments',
					sorter: {
						path: 'DueDate'
					}
				}"
			>
				<t:extension>
					<OverflowToolbar>
						<Title text="Contas a Pagar" />
						<ToolbarSpacer />
						<Button type="Transparent" text="Exportar Excel" press=".onExcel"/>
						<Button type="Transparent" text="Visualizar" press=".onDetail"/>
						<Button type="Transparent" text="Atualizar" press=".onRefresh"/>
					</OverflowToolbar>
				</t:extension>
				<t:columns>
					<t:Column label="Título" width="10rem" sortProperty="Code" filterProperty="Code">
						<t:template>
							<Text text="{Code}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Fornecedor" width="24rem" sortProperty="CardName">
						<t:template>
							<Text text="({CardCode}) {CardName}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Natureza" width="10rem" hAlign="Center" sortProperty="Nature">
						<t:template>
							<Text text="{
								path: 'Nature',
								targetType: 'any',
								formatter: 'formatter.formatFinancialNature'
							}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Situação" width="11rem" hAlign="Center" sortProperty="Status">
						<t:template>
							<ObjectStatus
								inverted="true"
								text="{
									path: 'Status',
									targetType: 'any',
									formatter: 'formatter.formatFinancialStatus'
								}"
								state="{
									path: 'Status',
									targetType: 'any',
									formatter: 'formatter.stateFinancialStatus'
								}" />
						</t:template>
					</t:Column>
					<t:Column label="Vencimento" width="11rem" hAlign="Center" sortProperty="DueDate">
						<t:template>
							<ObjectStatus
								text="{
									path: 'DueDate',
									type: 'sap.ui.model.odata.type.Date',
									formatOptions: { style: 'short' }
								}"
								state="{= ${path: 'IsOverdue', targetType: 'any'} ? 'Error' : 'None' }" />
						</t:template>
					</t:Column>
					<t:Column label="Valor" width="11rem" hAlign="End" sortProperty="NetAmount">
						<t:template>
							<Text text="{
								path: 'NetAmount',
								type: 'sap.ui.model.odata.type.Decimal',
								constraints: { precision: 18, scale: 2 },
								formatOptions: {
									decimalSeparator: ',',
									groupingEnabled: true,
									groupingSeparator: '.'
								}
							}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Em aberto" width="11rem" hAlign="End">
						<t:template>
							<Text text="{
								path: 'OpenAmount',
								type: 'sap.ui.model.odata.type.Decimal',
								constraints: { precision: 18, scale: 2 },
								formatOptions: {
									decimalSeparator: ',',
									groupingEnabled: true,
									groupingSeparator: '.'
								}
							}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Contrato" width="12rem" sortProperty="OriginDocNumber">
						<t:template>
							<Text text="{OriginDocNumber}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Filial" width="8rem" sortProperty="BranchCode">
						<t:template>
							<Text text="{BranchCode}" wrapping="false"/>
						</t:template>
					</t:Column>
				</t:columns>
			</t:Table>
		</f:content>
	</f:DynamicPage>

</mvc:View>
```

- [ ] **Step 2: Criar o controller**

`webapp/controller/accountsPayable/Main.controller.ts` — subclasse magra, só fixa a identidade da tela:

```typescript
import { SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { FinancialDocumentsBaseController } from "siagrob1/controller/financialDocuments/FinancialDocumentsBaseController";

export default class Main extends FinancialDocumentsBaseController {
  formatter = { ...formatter }

  protected get tableId(): string { return "accountsPayableTable"; }
  protected get direction(): "Payable" | "Receivable" | null { return "Payable"; }
  /** Adiantamento tem tela propria; esta lista mostra provisorio e (na Fase 2) firme. */
  protected get natureFilter(): string | null { return "Nature ne 'Advance'"; }
  protected get originRoute(): string { return "accountsPayable"; }

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("accountsPayable")
      .attachPatternMatched(() => this.onRouteMatched());
  }

  onExcel(): void {
    const table = this.byId(this.tableId) as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Contas a pagar.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        hierarchyLevel: "Level",
        context: { sheetName: "Contas a pagar" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () { oSheet.destroy(); });
  }
}
```

- [ ] **Step 3: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos.

- [ ] **Step 4: Stage**

```bash
git add webapp/view/accountsPayable/ webapp/controller/accountsPayable/
```

---

## Task 6: Contas a Receber

**Files:**
- Create: `webapp/view/accountsReceivable/Main.view.xml`
- Create: `webapp/controller/accountsReceivable/Main.controller.ts`

**Interfaces:**
- Consumes: exatamente o mesmo contrato da Task 5.

- [ ] **Step 1: Criar a view**

`webapp/view/accountsReceivable/Main.view.xml` — **idêntica à de Contas a Pagar**, com quatro diferenças, todas de identidade. Copie o arquivo **do disco** (`webapp/view/accountsPayable/Main.view.xml`, criado na tarefa anterior e já presente no repositório) e aplique exatamente estas quatro trocas:

```
controllerName="siagrob1.controller.accountsReceivable.Main"
<Title text="Contas a Receber"/>            (nos dois lugares: DynamicPageTitle e OverflowToolbar)
id="accountsReceivableTable"
<t:Column label="Cliente" width="24rem" sortProperty="CardName">
```

Todo o resto — colunas, tipos, formatters, o fragmento de filterbar — permanece igual. **Não** altere os `path` dos bindings: as duas telas leem o mesmo entity set e a direção é filtrada pelo controller.

- [ ] **Step 2: Criar o controller**

`webapp/controller/accountsReceivable/Main.controller.ts`:

```typescript
import { SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { FinancialDocumentsBaseController } from "siagrob1/controller/financialDocuments/FinancialDocumentsBaseController";

export default class Main extends FinancialDocumentsBaseController {
  formatter = { ...formatter }

  protected get tableId(): string { return "accountsReceivableTable"; }
  protected get direction(): "Payable" | "Receivable" | null { return "Receivable"; }
  protected get natureFilter(): string | null { return "Nature ne 'Advance'"; }
  protected get originRoute(): string { return "accountsReceivable"; }

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("accountsReceivable")
      .attachPatternMatched(() => this.onRouteMatched());
  }

  onExcel(): void {
    const table = this.byId(this.tableId) as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Contas a receber.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        hierarchyLevel: "Level",
        context: { sheetName: "Contas a receber" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () { oSheet.destroy(); });
  }
}
```

- [ ] **Step 3: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos.

- [ ] **Step 4: Stage**

```bash
git add webapp/view/accountsReceivable/ webapp/controller/accountsReceivable/
```

---

## Task 7: Detalhe do documento — dados, baixas e log

**Files:**
- Create: `webapp/view/financialDocuments/fragments/Form.fragment.xml`
- Create: `webapp/view/financialDocuments/fragments/Settlements.fragment.xml`
- Create: `webapp/view/financialDocuments/fragments/ChangeLogs.fragment.xml`
- Create: `webapp/view/financialDocuments/Detail.view.xml`
- Create: `webapp/controller/financialDocuments/Detail.controller.ts`

**Interfaces:**
- Consumes: rota `financialDocumentsDetail` (Task 1), formatters (Task 1), `bindElement` do `CommonController`.
- Produces: o controller `Detail`, ao qual as Tasks 8 e 9 acrescentam os diálogos de baixa, estorno, cancelamento e correção de vencimento.

- [ ] **Step 1: Criar o fragmento de dados**

`webapp/view/financialDocuments/fragments/Form.fragment.xml` — somente leitura; o único campo mutável do documento é o vencimento, alterado por action na Task 9:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
  <f:Form editable="false">
    <f:layout>
      <f:ColumnLayout columnsM="2" columnsL="3" columnsXL="4"/>
    </f:layout>
    <f:formContainers>
      <f:FormContainer title="Identificação">
        <f:formElements>
          <f:FormElement label="Título">
            <f:fields><Text text="{Code}"/></f:fields>
          </f:FormElement>
          <f:FormElement label="Direção">
            <f:fields>
              <Text text="{path: 'Direction', targetType: 'any', formatter: 'formatter.formatFinancialDirection'}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Natureza">
            <f:fields>
              <Text text="{path: 'Nature', targetType: 'any', formatter: 'formatter.formatFinancialNature'}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Parceiro">
            <f:fields><Text text="({CardCode}) {CardName}"/></f:fields>
          </f:FormElement>
          <f:FormElement label="Filial">
            <f:fields><Text text="{BranchCode}"/></f:fields>
          </f:FormElement>
          <f:FormElement label="Contrato de origem">
            <f:fields><Text text="{OriginDocNumber}"/></f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>
      <f:FormContainer title="Valores">
        <f:formElements>
          <f:FormElement label="Emissão">
            <f:fields>
              <Text text="{path: 'DocumentDate', type: 'sap.ui.model.odata.type.Date', formatOptions: { style: 'short' }}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Vencimento">
            <f:fields>
              <Text text="{path: 'DueDate', type: 'sap.ui.model.odata.type.Date', formatOptions: { style: 'short' }}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Valor">
            <f:fields>
              <Text text="{
                path: 'NetAmount',
                type: 'sap.ui.model.odata.type.Decimal',
                constraints: { precision: 18, scale: 2 },
                formatOptions: { decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
              }"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Baixado">
            <f:fields>
              <Text text="{
                path: 'SettledAmount',
                type: 'sap.ui.model.odata.type.Decimal',
                constraints: { precision: 18, scale: 2 },
                formatOptions: { decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
              }"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Em aberto">
            <f:fields>
              <ObjectNumber
                number="{
                  path: 'OpenAmount',
                  type: 'sap.ui.model.odata.type.Decimal',
                  constraints: { precision: 18, scale: 2 },
                  formatOptions: { decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
                }"
                state="{= ${path: 'IsOverdue', targetType: 'any'} ? 'Error' : 'None' }"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Condição de pagamento">
            <f:fields><Text text="{PaymentTermsText}"/></f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>
      <f:FormContainer title="Observações">
        <f:formElements>
          <f:FormElement label="Comentários">
            <f:fields><Text text="{Comments}"/></f:fields>
          </f:FormElement>
          <f:FormElement label="Motivo do cancelamento">
            <f:fields><Text text="{CancellationReason}"/></f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>
    </f:formContainers>
  </f:Form>
</core:FragmentDefinition>
```

- [ ] **Step 2: Criar o fragmento de baixas**

`webapp/view/financialDocuments/fragments/Settlements.fragment.xml`. O ledger é insert-only e o estorno é linha negativa — por isso a coluna de valor mostra o sinal:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:t="sap.ui.table"
>
  <t:Table
    id="financialSettlementsTable"
    selectionMode="Single"
    selectionBehavior="Row"
    class="sapUiSizeCondensed"
    visibleRowCountMode="Fixed"
    visibleRowCount="6"
    alternateRowColors="true"
    rows="{
      path: 'Settlements',
      sorter: { path: 'SettlementDate' }
    }">
    <t:extension>
      <OverflowToolbar>
        <Title text="Baixas" />
        <ToolbarSpacer />
        <Button type="Emphasized" text="Baixar" press=".onSettle"
                visible="{= !${path: 'IsBlockedForSettlement', targetType: 'any'} }"/>
        <Button type="Transparent" text="Estornar baixa" press=".onReverseSettlement"/>
      </OverflowToolbar>
    </t:extension>
    <t:columns>
      <t:Column label="Data" width="10rem">
        <t:template>
          <Text text="{path: 'SettlementDate', type: 'sap.ui.model.odata.type.Date', formatOptions: { style: 'short' }}" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Conta" width="10rem">
        <t:template><Text text="{FinancialAccountCode}" wrapping="false"/></t:template>
      </t:Column>
      <t:Column label="Valor" width="11rem" hAlign="End">
        <t:template>
          <Text text="{
            path: 'Amount',
            type: 'sap.ui.model.odata.type.Decimal',
            constraints: { precision: 18, scale: 2 },
            formatOptions: { decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
          }" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Juros" width="9rem" hAlign="End">
        <t:template>
          <Text text="{
            path: 'InterestAmount',
            type: 'sap.ui.model.odata.type.Decimal',
            constraints: { precision: 18, scale: 2 },
            formatOptions: { decimalSeparator: ',', groupingEnabled: true }
          }" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Multa" width="9rem" hAlign="End">
        <t:template>
          <Text text="{
            path: 'FineAmount',
            type: 'sap.ui.model.odata.type.Decimal',
            constraints: { precision: 18, scale: 2 },
            formatOptions: { decimalSeparator: ',', groupingEnabled: true }
          }" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Desconto" width="9rem" hAlign="End">
        <t:template>
          <Text text="{
            path: 'DiscountAmount',
            type: 'sap.ui.model.odata.type.Decimal',
            constraints: { precision: 18, scale: 2 },
            formatOptions: { decimalSeparator: ',', groupingEnabled: true }
          }" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Documento" width="12rem">
        <t:template><Text text="{DocumentReference}" wrapping="false"/></t:template>
      </t:Column>
      <t:Column label="Observação" width="20rem">
        <t:template><Text text="{Notes}" wrapping="false"/></t:template>
      </t:Column>
    </t:columns>
  </t:Table>
</core:FragmentDefinition>
```

- [ ] **Step 3: Criar o fragmento do log**

`webapp/view/financialDocuments/fragments/ChangeLogs.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:t="sap.ui.table"
>
  <t:Table
    id="financialChangeLogsTable"
    selectionMode="None"
    class="sapUiSizeCondensed"
    visibleRowCountMode="Fixed"
    visibleRowCount="5"
    alternateRowColors="true"
    rows="{
      path: 'ChangeLogs',
      sorter: { path: 'ChangedAt', descending: true }
    }">
    <t:columns>
      <t:Column label="Quando" width="14rem">
        <t:template>
          <Text text="{path: 'ChangedAt', type: 'sap.ui.model.odata.type.DateTimeOffset', formatOptions: { style: 'short' }}" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Quem" width="14rem">
        <t:template><Text text="{ChangedBy}" wrapping="false"/></t:template>
      </t:Column>
      <t:Column label="Campo" width="12rem">
        <t:template><Text text="{Field}" wrapping="false"/></t:template>
      </t:Column>
      <t:Column label="De" width="16rem">
        <t:template><Text text="{OldValue}" wrapping="false"/></t:template>
      </t:Column>
      <t:Column label="Para" width="16rem">
        <t:template><Text text="{NewValue}" wrapping="false"/></t:template>
      </t:Column>
    </t:columns>
  </t:Table>
</core:FragmentDefinition>
```

- [ ] **Step 4: Criar a view de detalhe**

`webapp/view/financialDocuments/Detail.view.xml`. Os botões do rodapé usam expression binding explícito — sem ele o botão aparece antes de o documento carregar:

```xml
<mvc:View
	controllerName="siagrob1.controller.financialDocuments.Detail"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:uxap="sap.uxap"
	core:require="{
		formatter: 'siagrob1/model/formatter'
	}">

  <uxap:ObjectPageLayout
    showFooter="true"
    toggleHeaderOnTitleClick="true"
    preserveHeaderStateOnScroll="false"
    busy="{ui>/busy}"
    busyIndicatorDelay="0"
  >
    <uxap:headerTitle>
      <uxap:ObjectPageDynamicHeaderTitle>
        <uxap:expandedHeading>
          <Title text="Título {Code}"/>
        </uxap:expandedHeading>
        <uxap:snappedHeading>
          <Title text="Título {Code}"/>
        </uxap:snappedHeading>
        <uxap:actions>
          <ObjectStatus
            inverted="true"
            text="{ path: 'Status', targetType: 'any', formatter: 'formatter.formatFinancialStatus' }"
            state="{ path: 'Status', targetType: 'any', formatter: 'formatter.stateFinancialStatus' }" />
        </uxap:actions>
      </uxap:ObjectPageDynamicHeaderTitle>
    </uxap:headerTitle>

    <uxap:sections>
      <uxap:ObjectPageSection titleUppercase="false" title="Dados do Título">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.financialDocuments.fragments.Form" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
      <uxap:ObjectPageSection titleUppercase="false" title="Baixas">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.financialDocuments.fragments.Settlements" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
      <uxap:ObjectPageSection titleUppercase="false" title="Log de Alterações">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.financialDocuments.fragments.ChangeLogs" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
    </uxap:sections>

    <uxap:footer>
      <OverflowToolbar>
        <ToolbarSpacer />
        <Button
          text="Corrigir vencimento"
          icon="sap-icon://appointment-2"
          visible="{= ${path: 'Status', targetType: 'any'} !== 'Canceled' }"
          press=".onSetDueDate" />
        <Button
          text="Cancelar título"
          icon="sap-icon://decline"
          visible="{
            parts: [
              { path: 'Status', targetType: 'any' },
              { path: 'SettledAmount', targetType: 'any' }
            ],
            formatter: '.formatter.formatFinancialDocumentCancelable'
          }"
          press=".onCancelDocument" />
        <Button text="Voltar" press=".onBack" />
      </OverflowToolbar>
    </uxap:footer>
  </uxap:ObjectPageLayout>

</mvc:View>
```

- [ ] **Step 5: Criar o controller de detalhe**

`webapp/controller/financialDocuments/Detail.controller.ts`. As Tasks 8 e 9 acrescentam métodos a esta classe:

```typescript
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import formatter from "siagrob1/model/formatter";
import CommonController from "siagrob1/controller/common/CommonController";

export default class Detail extends CommonController {
  formatter = { ...formatter }

  onInit(): void {
    this.getRouter().getRoute("financialDocumentsDetail")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);

    // $expand explicito: sem ele o $select auto-gerado nao traz as colecoes e as duas
    // tabelas do detalhe nascem vazias.
    this.bindElement(`/FinancialDocuments(${id})`, {
      $expand: "Settlements,ChangeLogs",
    });
  }

  protected documentContext(): Context | null {
    return this.getView().getBindingContext() as Context;
  }

  protected refreshDocument(): void {
    // SO o element binding. As tabelas de baixas e de log sao bindings RELATIVOS
    // (path 'Settlements' / 'ChangeLogs') sem $$ownRequest, e no UI5 1.141
    // ODataBinding#requestRefresh lanca "Refresh on this binding is not supported"
    // para binding relativo sem $$ownRequest -- de forma SINCRONA, antes da promise
    // existir, entao o .catch() interno nao segura. Chamar refresh() nelas quebrava
    // as quatro operacoes que chamam este metodo (baixa, estorno, vencimento,
    // cancelamento). Refrescar o pai ja basta: refreshInternal cascateia para as
    // bindings dependentes, e o $expand traz as duas colecoes de novo.
    this.getView().getElementBinding()?.refresh();
  }

  /** A lista de origem foi guardada pelo FinancialDocumentsBaseController ao navegar para ca. */
  onBack(): void {
    const origin = (this.getModel("viewModel") as JSONModel)
      .getProperty("/financialDocumentOriginRoute") as string;

    this.navTo(origin || "accountsPayable");
  }
}
```

- [ ] **Step 6: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos. Os handlers `.onSettle`, `.onReverseSettlement`, `.onSetDueDate` e `.onCancelDocument` ainda não existem — as views XML só resolvem handler em tempo de execução, então o typecheck passa. Eles entram nas Tasks 8 e 9; **não invente stubs**.

- [ ] **Step 7: Stage**

```bash
git add webapp/view/financialDocuments/ webapp/controller/financialDocuments/
```

---

## Task 8: Baixa e estorno

**Files:**
- Create: `webapp/view/financialDocuments/fragments/SettleDialog.fragment.xml`
- Modify: `webapp/controller/financialDocuments/Detail.controller.ts`

**Interfaces:**
- Consumes: `Detail` controller e `documentContext()`/`refreshDocument()` (Task 7); `ServerRoutes.financialDocumentsSettle` e `.financialDocumentsReverseSettlement` (Task 1).

- [ ] **Step 1: Criar o fragmento do diálogo de baixa**

`webapp/view/financialDocuments/fragments/SettleDialog.fragment.xml`. **Todo campo de valor usa `sap.ui.model.odata.type.Double`** — `Edm.Decimal` seria serializado como string e o backend devolveria 400 sem nomear o campo:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
<Dialog id="financialSettleDialog" title="Baixar título">
  <content>
    <VBox class="sapUiSmallMargin" width="560px">
      <f:Form editable="true">
        <f:layout>
          <f:ColumnLayout columnsM="2" columnsL="2" columnsXL="2"/>
        </f:layout>
        <f:formContainers>
          <f:FormContainer>
            <f:formElements>
              <f:FormElement label="Conta financeira">
                <f:fields>
                  <Input
                    value="{viewModel>/settleDialog/financialAccountCode}"
                    required="true"
                    showValueHelp="true"
                    valueHelpOnly="true"
                    valueHelpRequest=".openFinancialAccountsValueHelp"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Data da baixa">
                <f:fields>
                  <DatePicker
                    value="{viewModel>/settleDialog/settlementDate}"
                    required="true"
                    displayFormat="dd/MM/yyyy"
                    valueFormat="yyyy-MM-dd"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Valor">
                <f:fields>
                  <Input
                    value="{path: 'viewModel>/settleDialog/amount', type: 'sap.ui.model.odata.type.Double'}"
                    required="true"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Juros">
                <f:fields>
                  <Input value="{path: 'viewModel>/settleDialog/interestAmount', type: 'sap.ui.model.odata.type.Double'}"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Multa">
                <f:fields>
                  <Input value="{path: 'viewModel>/settleDialog/fineAmount', type: 'sap.ui.model.odata.type.Double'}"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Desconto">
                <f:fields>
                  <Input value="{path: 'viewModel>/settleDialog/discountAmount', type: 'sap.ui.model.odata.type.Double'}"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Documento">
                <f:fields>
                  <Input value="{viewModel>/settleDialog/documentReference}" maxLength="50"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Observação">
                <f:fields>
                  <TextArea value="{viewModel>/settleDialog/notes}" rows="3" width="100%" maxLength="500"/>
                </f:fields>
              </f:FormElement>
            </f:formElements>
          </f:FormContainer>
        </f:formContainers>
      </f:Form>
    </VBox>
  </content>
  <footer>
    <OverflowToolbar>
      <ToolbarSpacer />
      <Button text="Baixar" type="Emphasized" press=".onConfirmSettle"/>
      <Button text="Fechar" press=".onCloseSettleDialog"/>
    </OverflowToolbar>
  </footer>
</Dialog>
</core:FragmentDefinition>
```

- [ ] **Step 2: Acrescentar o value help de conta financeira ao `Detail.controller.ts`**

Não existe um pronto no `CommonController` — este é novo e usa o `applyValueHelp` genérico. Acrescente o import e o método:

```typescript
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
```

```typescript
  async openFinancialAccountsValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code");
  }
```

- [ ] **Step 3: Criar o diálogo de seleção de conta financeira**

`webapp/dialogs/fragments/FinancialAccountsSelectDialog.fragment.xml`, no molde dos demais `*SelectDialog` da pasta. Filtra inativas fora:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
>
  <TableSelectDialog
    id="FinancialAccountsSelectDialog"
    title="Contas Financeiras"
    search=".onSearchDialog"
    liveChange=".onSearchDialog"
    confirm=".onConfirmDialog"
    cancel=".onCloseDialog"
    items="{
      path: '/FinancialAccounts',
      filters: [ { path: 'Inactive', operator: 'EQ', value1: false } ],
      sorter: { path: 'Code' }
    }">
    <ColumnListItem>
      <cells>
        <Text text="{Code}"/>
        <Text text="{Name}"/>
      </cells>
    </ColumnListItem>
    <columns>
      <Column><header><Label text="Código"/></header></Column>
      <Column><header><Label text="Nome"/></header></Column>
    </columns>
  </TableSelectDialog>
</core:FragmentDefinition>
```

- [ ] **Step 4: Acrescentar baixa e estorno ao `Detail.controller.ts`**

Acrescente os imports necessários e os métodos. O valor sugerido é o saldo em aberto, e a data sugerida é hoje:

```typescript
import Dialog from "sap/m/Dialog";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
```

```typescript
  private _settleDialog: Dialog;

  async onSettle(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    if (ctx.getProperty("IsBlockedForSettlement")) {
      MessageBox.warning(
        "Título provisório não pode ser baixado. Ele será liberado quando o documento fiscal for confirmado.");
      return;
    }

    const openAmount = Number(ctx.getProperty("OpenAmount") ?? 0);

    if (openAmount <= 0) {
      MessageBox.warning("O título não tem saldo em aberto.");
      return;
    }

    (this.getModel("viewModel") as JSONModel).setProperty("/settleDialog", {
      financialAccountCode: "",
      settlementDate: new Date().toISOString().substring(0, 10),
      amount: openAmount,
      interestAmount: 0,
      fineAmount: 0,
      discountAmount: 0,
      documentReference: "",
      notes: "",
    });

    this._settleDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.SettleDialog");
    this._settleDialog.open();
  }

  onCloseSettleDialog(): void {
    this._settleDialog?.close();
  }

  async onConfirmSettle(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const viewModel = this.getModel("viewModel") as JSONModel;
    const form = viewModel.getProperty("/settleDialog") as {
      financialAccountCode: string; settlementDate: string; amount: number;
      interestAmount: number; fineAmount: number; discountAmount: number;
      documentReference: string; notes: string;
    };

    if (!form.financialAccountCode) {
      MessageBox.alert("Informe a conta financeira da baixa.");
      return;
    }

    if (!form.settlementDate) {
      MessageBox.alert("Informe a data da baixa.");
      return;
    }

    if (!(Number(form.amount) > 0)) {
      MessageBox.alert("O valor da baixa deve ser maior que zero.");
      return;
    }

    this.onCloseSettleDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialDocumentsSettle);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("FinancialAccountCode", form.financialAccountCode);
      action.setParameter("Amount", Number(form.amount));
      action.setParameter("SettlementDate", form.settlementDate);
      action.setParameter("InterestAmount", Number(form.interestAmount ?? 0));
      action.setParameter("FineAmount", Number(form.fineAmount ?? 0));
      action.setParameter("DiscountAmount", Number(form.discountAmount ?? 0));
      action.setParameter("DocumentReference", form.documentReference ?? "");
      action.setParameter("Notes", form.notes ?? "");
      await action.invoke();

      MessageToast.show("Baixa registrada.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao registrar a baixa.");
    } finally {
      this.setBusy(false);
    }
  }

  async onReverseSettlement(): Promise<void> {
    const oTable = this.byId("financialSettlementsTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione a baixa a estornar.");
      return;
    }

    const settlement = oTable.getContextByIndex(i) as Context;

    if (!await confirmDialog(
      "Estornar esta baixa ? Uma linha negativa será gravada no ledger; nada é apagado.",
      "Estornar baixa ?")) {
      return;
    }

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel)
        .bindContext(this.api.financialDocumentsReverseSettlement);
      action.setParameter("SettlementKey", settlement.getProperty("Key"));
      action.setParameter("Reason", "Estorno solicitado pela tela");
      await action.invoke();

      MessageToast.show("Baixa estornada.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao estornar a baixa.");
    } finally {
      this.setBusy(false);
    }
  }
```

- [ ] **Step 5: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos.

- [ ] **Step 6: Stage**

```bash
git add webapp/view/financialDocuments/ webapp/controller/financialDocuments/ webapp/dialogs/fragments/FinancialAccountsSelectDialog.fragment.xml
```

---

## Task 9: Correção de vencimento e cancelamento

**Files:**
- Create: `webapp/view/financialDocuments/fragments/SetDueDateDialog.fragment.xml`
- Modify: `webapp/controller/financialDocuments/Detail.controller.ts`

**Interfaces:**
- Consumes: `Detail` controller (Tasks 7 e 8); `ServerRoutes.financialDocumentsSetDueDate` e `.financialDocumentsCancel` (Task 1).

- [ ] **Step 1: Criar o diálogo de correção de vencimento**

`webapp/view/financialDocuments/fragments/SetDueDateDialog.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
<Dialog id="financialSetDueDateDialog" title="Corrigir vencimento">
  <content>
    <VBox class="sapUiSmallMargin" width="420px">
      <f:Form editable="true">
        <f:layout>
          <f:ColumnLayout columnsM="1" columnsL="1" columnsXL="1"/>
        </f:layout>
        <f:formContainers>
          <f:FormContainer>
            <f:formElements>
              <f:FormElement label="Novo vencimento">
                <f:fields>
                  <DatePicker
                    value="{viewModel>/dueDateDialog/dueDate}"
                    required="true"
                    displayFormat="dd/MM/yyyy"
                    valueFormat="yyyy-MM-dd"/>
                </f:fields>
              </f:FormElement>
            </f:formElements>
          </f:FormContainer>
        </f:formContainers>
      </f:Form>
      <Text text="A alteração fica registrada no log do título, com o valor anterior."
            class="sapUiTinyMarginTop"/>
    </VBox>
  </content>
  <footer>
    <OverflowToolbar>
      <ToolbarSpacer />
      <Button text="Salvar" type="Emphasized" press=".onConfirmSetDueDate"/>
      <Button text="Fechar" press=".onCloseSetDueDateDialog"/>
    </OverflowToolbar>
  </footer>
</Dialog>
</core:FragmentDefinition>
```

- [ ] **Step 2: Acrescentar correção de vencimento ao `Detail.controller.ts`**

```typescript
  private _dueDateDialog: Dialog;

  async onSetDueDate(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    const current = ctx.getProperty("DueDate") as string;

    (this.getModel("viewModel") as JSONModel).setProperty("/dueDateDialog", {
      dueDate: current ? String(current).substring(0, 10) : "",
    });

    this._dueDateDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.SetDueDateDialog");
    this._dueDateDialog.open();
  }

  onCloseSetDueDateDialog(): void {
    this._dueDateDialog?.close();
  }

  async onConfirmSetDueDate(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const dueDate = (this.getModel("viewModel") as JSONModel)
      .getProperty("/dueDateDialog/dueDate") as string;

    if (!dueDate) {
      MessageBox.alert("Informe o novo vencimento.");
      return;
    }

    this.onCloseSetDueDateDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialDocumentsSetDueDate);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("DueDate", dueDate);
      await action.invoke();

      MessageToast.show("Vencimento alterado.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao alterar o vencimento.");
    } finally {
      this.setBusy(false);
    }
  }
```

- [ ] **Step 3: Usar o prompt de motivo que JÁ EXISTE**

⚠️ Correção de rumo, feita durante a execução. Esta etapa mandava criar um `ReasonDialog.fragment.xml`
com `promptReason`. **Não crie nada disso.** O repositório já tem
`DialogHelper.promptDialog(title, label, placeholder?)` em `webapp/dialogs/DialogHelper.ts`
(atenção: `dialogs/DialogHelper`, singular — não confundir com `helpers/DialogHelpers`, plural, que
só exporta `confirmDialog`; foi essa confusão que gerou a etapa errada). Quatro controllers já o
usam para exatamente este fim — motivo de auditoria — entre eles
`shipmentLoads/Detail.controller.ts` e `salesShipmentReleases/Main.controller.ts`.

Contrato: campo obrigatório com validação embutida, resolve com o texto informado ou **string
vazia** se o usuário desistir, e destrói o diálogo sozinho. Portanto:

```typescript
    const reason = await DialogHelper.promptDialog(
      "Cancelar título", "Informe o motivo do cancelamento:");
    if (!reason) return;
```

O que continua valendo é o PORQUÊ: `sap.m.MessageBox` não aceita campo de entrada. Pedir o motivo
num MessageBox e mandar uma constante grava auditoria falsa e mente para o usuário, que leu
"Informe o motivo" e não teve onde digitar.

- [ ] **Step 4: Acrescentar o cancelamento ao `Detail.controller.ts`**

```typescript
  async onCancelDocument(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    const reason = await DialogHelper.promptDialog(
      "Cancelar título", "Informe o motivo do cancelamento:");
    if (!reason) return;

    await this.doCancelDocument(ctx, reason);
  }

  private async doCancelDocument(ctx: Context, reason: string): Promise<void> {
    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialDocumentsCancel);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("Reason", reason);
      await action.invoke();

      MessageToast.show("Título cancelado.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao cancelar o título.");
    } finally {
      this.setBusy(false);
    }
  }
```

- [ ] **Step 5: Travar o valor da baixa pelo saldo em aberto**

A revisão da Task 8 apontou que `onConfirmSettle` valida `amount > 0` mas não valida contra o saldo.
O campo já NASCE com `OpenAmount`, mas nada impede o usuário de aumentar. O backend recusa
(`FinancialDocumentsSettlementGuardService.EnsureCanSettle`) com mensagem que nomeia os dois
valores, então não há risco de dado — é uma ida-e-volta de 400 numa tela de dinheiro, que é
justamente onde o usuário menos tolera erro técnico. Acrescentar em `onConfirmSettle`, logo depois
da validação de `amount > 0`:

```typescript
    const openAmount = Number(ctx.getProperty("OpenAmount") ?? 0);

    if (amount > openAmount) {
      MessageBox.warning(
        `O valor da baixa (${formatter.formatDecimal(amount, 2)}) excede o saldo em aberto ` +
        `(${formatter.formatDecimal(openAmount, 2)}).`);
      return;
    }
```

O formatter da casa é **`formatter.formatDecimal(value, 2)`** (`webapp/model/formatter.ts`): aceita
`number | string` e devolve pt-BR com separador de milhar. Use-o — não escreva um `toLocaleString`
privado, que duplica o que já existe.

- [ ] **Step 6: Religar o estorno da Task 8 ao motivo real**

A Task 8 gravou `action.setParameter("Reason", "Estorno solicitado pela tela")` — constante, pelo
mesmo defeito que o cancelamento tinha. Usando o mesmo `DialogHelper.promptDialog` do Step 3, editar
`onReverseSettlement` em `Detail.controller.ts`:

- trocar o `confirmDialog(...)` atual por:

  ```typescript
    const reason = await DialogHelper.promptDialog(
      "Estornar baixa", "Informe o motivo do estorno:");
    if (!reason) return;
  ```

  O diálogo de motivo JÁ é a confirmação — dois diálogos em sequência para a mesma ação é ruído;
- enviar `reason` no lugar da constante em `setParameter("Reason", ...)`.

Se `confirmDialog` deixar de ser usado no arquivo, remover o import (o lint reprova import órfão).

- [ ] **Step 7: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos. Confirme que os quatro handlers referenciados pela view (`onSettle`, `onReverseSettlement`, `onSetDueDate`, `onCancelDocument`) agora existem no controller — a view XML não avisa se faltar. Confirme também que NENHUM `setParameter("Reason", ...)` do arquivo recebe literal de string.

- [ ] **Step 8: Stage**

```bash
git add webapp/view/financialDocuments/ webapp/controller/financialDocuments/
```

---

## Task 10: Adiantamentos

**Files:**
- Create: `webapp/view/financialAdvances/Main.view.xml`
- Create: `webapp/view/financialAdvances/fragments/CreateAdvanceDialog.fragment.xml`
- Create: `webapp/controller/financialAdvances/Main.controller.ts`

**Interfaces:**
- Consumes: `FinancialDocumentsBaseController` (Task 4); `ServerRoutes.financialAdvancesCreate` (Task 1).

- [ ] **Step 1: Criar a view da lista**

`webapp/view/financialAdvances/Main.view.xml` — mesma estrutura das outras listas, com uma coluna a mais (Direção, porque esta tela mostra os dois lados) e o botão de inclusão:

```xml
<mvc:View
	controllerName="siagrob1.controller.financialAdvances.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:t="sap.ui.table"
	xmlns:f="sap.f"
	core:require="{
		formatter: 'siagrob1/model/formatter'
	}">

	<f:DynamicPage busyIndicatorDelay="0" busy="{ui>/busy}">
		<f:title>
			<f:DynamicPageTitle>
				<f:heading>
					<Title text="Adiantamentos"/>
				</f:heading>
			</f:DynamicPageTitle>
		</f:title>
		<f:header>
			<f:DynamicPageHeader>
				<f:content>
					<core:Fragment fragmentName="siagrob1.view.financialDocuments.fragments.Filterbar" type="XML" />
				</f:content>
			</f:DynamicPageHeader>
		</f:header>
		<f:content>
			<t:Table
				id="financialAdvancesTable"
				busyIndicatorDelay="0"
				selectionMode="Single"
				selectionBehavior="Row"
				class="sapUiSizeCondensed"
				visibleRowCountMode="Auto"
				enableBusyIndicator="true"
				alternateRowColors="true"
				rows="{
					path: '/FinancialDocuments',
					sorter: {
						path: 'DueDate'
					}
				}"
			>
				<t:extension>
					<OverflowToolbar>
						<Title text="Adiantamentos" />
						<ToolbarSpacer />
						<Button type="Emphasized" icon="sap-icon://add" text="Incluir" press=".onCreate"/>
						<Button type="Transparent" text="Visualizar" press=".onDetail"/>
						<Button type="Transparent" text="Exportar Excel" press=".onExcel"/>
						<Button type="Transparent" text="Atualizar" press=".onRefresh"/>
					</OverflowToolbar>
				</t:extension>
				<t:columns>
					<t:Column label="Título" width="10rem" sortProperty="Code">
						<t:template><Text text="{Code}" wrapping="false"/></t:template>
					</t:Column>
					<t:Column label="Direção" width="9rem" hAlign="Center" sortProperty="Direction">
						<t:template>
							<Text text="{
								path: 'Direction',
								targetType: 'any',
								formatter: 'formatter.formatFinancialDirection'
							}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Parceiro" width="24rem" sortProperty="CardName">
						<t:template><Text text="({CardCode}) {CardName}" wrapping="false"/></t:template>
					</t:Column>
					<t:Column label="Situação" width="11rem" hAlign="Center" sortProperty="Status">
						<t:template>
							<ObjectStatus
								inverted="true"
								text="{ path: 'Status', targetType: 'any', formatter: 'formatter.formatFinancialStatus' }"
								state="{ path: 'Status', targetType: 'any', formatter: 'formatter.stateFinancialStatus' }" />
						</t:template>
					</t:Column>
					<t:Column label="Vencimento" width="11rem" hAlign="Center" sortProperty="DueDate">
						<t:template>
							<Text text="{path: 'DueDate', type: 'sap.ui.model.odata.type.Date', formatOptions: { style: 'short' }}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Valor" width="11rem" hAlign="End" sortProperty="NetAmount">
						<t:template>
							<Text text="{
								path: 'NetAmount',
								type: 'sap.ui.model.odata.type.Decimal',
								constraints: { precision: 18, scale: 2 },
								formatOptions: { decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
							}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Crédito disponível" width="13rem" hAlign="End">
						<t:template>
							<Text text="{
								path: 'AvailableAdvanceAmount',
								type: 'sap.ui.model.odata.type.Decimal',
								constraints: { precision: 18, scale: 2 },
								formatOptions: { decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
							}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Contrato" width="12rem" sortProperty="OriginDocNumber">
						<t:template><Text text="{OriginDocNumber}" wrapping="false"/></t:template>
					</t:Column>
				</t:columns>
			</t:Table>
		</f:content>
	</f:DynamicPage>

</mvc:View>
```

- [ ] **Step 2: Criar o diálogo de inclusão**

`webapp/view/financialAdvances/fragments/CreateAdvanceDialog.fragment.xml`. O tipo de contrato é `Select` porque a action recebe `"Purchase"` ou `"Sales"` como string:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
<Dialog id="createAdvanceDialog" title="Novo adiantamento">
  <content>
    <VBox class="sapUiSmallMargin" width="520px">
      <f:Form editable="true">
        <f:layout>
          <f:ColumnLayout columnsM="1" columnsL="1" columnsXL="1"/>
        </f:layout>
        <f:formContainers>
          <f:FormContainer>
            <f:formElements>
              <f:FormElement label="Tipo de contrato">
                <f:fields>
                  <Select selectedKey="{viewModel>/advanceDialog/contractType}" change=".onAdvanceContractTypeChange">
                    <core:ListItem key="Purchase" text="Compra (a pagar)"/>
                    <core:ListItem key="Sales" text="Venda (a receber)"/>
                  </Select>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Contrato">
                <f:fields>
                  <Input
                    value="{viewModel>/advanceDialog/contractCode}"
                    required="true"
                    showValueHelp="true"
                    valueHelpOnly="true"
                    valueHelpRequest=".openAdvanceContractValueHelp"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Valor">
                <f:fields>
                  <Input
                    value="{path: 'viewModel>/advanceDialog/amount', type: 'sap.ui.model.odata.type.Double'}"
                    required="true"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Vencimento">
                <f:fields>
                  <DatePicker
                    value="{viewModel>/advanceDialog/dueDate}"
                    required="true"
                    displayFormat="dd/MM/yyyy"
                    valueFormat="yyyy-MM-dd"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Observação">
                <f:fields>
                  <TextArea value="{viewModel>/advanceDialog/comments}" rows="3" width="100%" maxLength="500"/>
                </f:fields>
              </f:FormElement>
            </f:formElements>
          </f:FormContainer>
        </f:formContainers>
      </f:Form>
    </VBox>
  </content>
  <footer>
    <OverflowToolbar>
      <ToolbarSpacer />
      <Button text="Incluir" type="Emphasized" press=".onConfirmCreateAdvance"/>
      <Button text="Fechar" press=".onCloseAdvanceDialog"/>
    </OverflowToolbar>
  </footer>
</Dialog>
</core:FragmentDefinition>
```

- [ ] **Step 3: Criar o controller**

`webapp/controller/financialAdvances/Main.controller.ts`. O value help de contrato troca de entity set conforme o tipo escolhido, e trocar o tipo limpa o contrato já selecionado — senão fica um contrato de compra num adiantamento de venda:

```typescript
import { SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/ui/table/Table";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { FinancialDocumentsBaseController } from "siagrob1/controller/financialDocuments/FinancialDocumentsBaseController";

export default class Main extends FinancialDocumentsBaseController {
  formatter = { ...formatter }

  private _advanceDialog: Dialog;

  protected get tableId(): string { return "financialAdvancesTable"; }
  /** Esta tela mostra os dois lados; a direcao vem do contrato escolhido na inclusao. */
  protected get direction(): "Payable" | "Receivable" | null { return null; }
  protected get natureFilter(): string | null { return "Nature eq 'Advance'"; }
  protected get originRoute(): string { return "financialAdvances"; }

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("financialAdvances")
      .attachPatternMatched(() => this.onRouteMatched());
  }

  async onCreate(): Promise<void> {
    (this.getModel("viewModel") as JSONModel).setProperty("/advanceDialog", {
      contractType: "Purchase",
      contractCode: "",
      contractKey: null,
      amount: 0,
      dueDate: "",
      comments: "",
    });

    this._advanceDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialAdvances.fragments.CreateAdvanceDialog");
    this._advanceDialog.open();
  }

  onCloseAdvanceDialog(): void {
    this._advanceDialog?.close();
  }

  /** Trocar o tipo invalida o contrato ja escolhido — senao sobra contrato de compra num
   *  adiantamento de venda, e a action falharia com "Contrato nao encontrado". */
  onAdvanceContractTypeChange(): void {
    const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setProperty("/advanceDialog/contractCode", "");
    viewModel.setProperty("/advanceDialog/contractKey", null);
  }

  async openAdvanceContractValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const contractType = viewModel.getProperty("/advanceDialog/contractType") as string;
    const dialogName = contractType === "Sales"
      ? "SalesContractsSelectDialog"
      : "PurchaseContractsSelectDialog";

    const oSelected = await DialogHelper.openTableSelectDialog(
      this,
      dialogName,
      ["Code", "CardName"],
      [new Filter("Status", FilterOperator.EQ, "Approved")]);

    if (!oSelected) return;

    viewModel.setProperty("/advanceDialog/contractCode", oSelected.getProperty("Code") as string);
    viewModel.setProperty("/advanceDialog/contractKey", oSelected.getProperty("Key") as string);
  }

  async onConfirmCreateAdvance(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const form = viewModel.getProperty("/advanceDialog") as {
      contractType: string; contractKey: string; amount: number;
      dueDate: string; comments: string;
    };

    if (!form.contractKey) {
      MessageBox.alert("Selecione o contrato.");
      return;
    }

    if (!(Number(form.amount) > 0)) {
      MessageBox.alert("O valor do adiantamento deve ser maior que zero.");
      return;
    }

    if (!form.dueDate) {
      MessageBox.alert("Informe o vencimento do adiantamento.");
      return;
    }

    this.onCloseAdvanceDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialAdvancesCreate);
      action.setParameter("ContractType", form.contractType);
      action.setParameter("ContractKey", form.contractKey);
      action.setParameter("Amount", Number(form.amount));
      action.setParameter("DueDate", form.dueDate);
      action.setParameter("Comments", form.comments ?? "");
      await action.invoke();

      MessageToast.show("Adiantamento incluído.");
      this.onRefresh();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao incluir o adiantamento.");
    } finally {
      this.setBusy(false);
    }
  }

  onExcel(): void {
    const table = this.byId(this.tableId) as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Adiantamentos.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        hierarchyLevel: "Level",
        context: { sheetName: "Adiantamentos" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () { oSheet.destroy(); });
  }
}
```

- [ ] **Step 4: Conferir os nomes de propriedade dos diálogos de contrato**

`PurchaseContractsSelectDialog.fragment.xml` e `SalesContractsSelectDialog.fragment.xml` **já existem** em `webapp/dialogs/fragments/` — verificado. Abra os dois e confirme que as propriedades que o `openAdvanceContractValueHelp` lê (`Code` e `Key`) e as que ele passa como colunas de busca (`Code`, `CardName`) são mesmo os nomes usados ali. Se um deles filtrar ou exibir por outro nome, ajuste a chamada — **não** edite os diálogos, que são compartilhados com outras telas.

- [ ] **Step 5: Verificar**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros novos.

- [ ] **Step 6: Stage**

```bash
git add webapp/view/financialAdvances/ webapp/controller/financialAdvances/ webapp/dialogs/fragments/
```

---

## Task 11: Origem do botão Voltar e verificação de ponta a ponta

**Files:**
- Modify: `webapp/controller/financialDocuments/Detail.controller.ts`
- Modify: `webapp/controller/financialDocuments/FinancialDocumentsBaseController.ts`

**Interfaces:**
- Consumes: tudo das Tasks 4 a 10.

- [ ] **Step 1: Marcar os campos de vencimento como obrigatórios nos formulários de contrato**

Requisito do spec (seção Frontend) ainda não coberto: *"Nos formulários de contrato, marcar `StandardCashFlowDate` como obrigatório em contrato de preço fixo, e `FinancialDueDate` como obrigatório na fixação — o servidor recusa de qualquer jeito, mas descobrir isso só ao aprovar é experiência ruim."*

O backend agora **recusa a aprovação** de um contrato de preço fixo sem previsão de pagamento, e a confirmação de uma fixação sem vencimento financeiro. Sem esta marcação o usuário só descobre no clique de Aprovar.

Nos quatro arquivos abaixo, localize o campo e acrescente `required="true"` ao controle:

- `webapp/view/purchaseContracts/fragments/PurchaseContractForm.fragment.xml` — campo ligado a `{StandardCashFlowDate}`
- `webapp/view/salesContracts/fragments/SalesContractForm.fragment.xml` — campo ligado a `{StandardCashFlowDate}`
- `webapp/view/purchaseContracts/fragments/PriceFixationDialog.fragment.xml` — campo ligado a `{FinancialDueDate}`
- `webapp/view/salesContracts/fragments/PriceFixationDialog.fragment.xml` — campo ligado a `{FinancialDueDate}`

**Só o atributo `required`.** Não mexa em binding, em layout, nem na lógica de gravação — estas telas são de outro módulo, estão em produção, e o servidor já é a trava real. A marcação é sinalização visual antecipada, não validação nova.

⚠️ **Edite apenas estes quatro arquivos.** Verifiquei: `StandardCashFlowDate` aparece em **11** arquivos de view e `FinancialDueDate` em **6** — os demais são filterbars, telas de liberação de entrega e diálogos de detalhe, onde o campo é somente leitura ou critério de busca. Marcar `required` em qualquer um deles quebraria uma tela que não tem nada a ver com esta feature. Cada um dos quatro arquivos indicados contém **exatamente uma** ocorrência do campo — se encontrar mais de uma, pare e reporte.

Se algum dos quatro campos não existir no arquivo indicado, **pare e reporte** em vez de criá-lo: o campo pode ter mudado de fragmento e criar um duplicado quebraria a tela.

- [ ] **Step 2: Verificar os gates de código**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`
Expected: sem erros.

**Não rode `yarn test`.** Ele executa `lint` + `test-ui5` com gate de cobertura de 50%, e a cobertura real deste repositório é ~2,4% — falha sempre, e não é regressão desta feature.

- [ ] **Step 3: Verificar no navegador, pelo caminho do usuário**

Suba a stack: backend `SiagroB1.Web` e `SiagroB1.Gateway` no profile `yktb` (`ASPNETCORE_ENVIRONMENT=Yokotobi-Development`), frontend com `yarn start:dev`. Login `admin` / `1234`.

1. O menu **Financeiro** aparece com as quatro entradas, e **cada uma navega** (se aparecer e não navegar, o `name` da rota não bate com a `MENU_ITEMS.Key`).
2. Contas Financeiras: incluir um caixa e um banco; conferir que os campos bancários só aparecem quando o tipo é Banco; editar um e confirmar que o código não é editável.
3. Contas a Pagar: a lista traz os provisórios existentes; filtrar por situação e por faixa de vencimento; limpar os filtros e ver a lista voltar inteira; exportar Excel.
4. Abrir o detalhe de um provisório: o botão **Baixar não aparece** (é bloqueado); as abas de Baixas e Log carregam sem erro.
5. Contas a Receber: mesma conferência, e confirme que a lista **não** mostra os mesmos títulos de Contas a Pagar.
6. Adiantamentos: incluir um adiantamento contra um contrato de compra aprovado; abrir o detalhe; **baixar** (o botão aparece aqui); conferir o saldo em aberto ir a zero e a linha aparecer em Baixas; **estornar** e ver a linha negativa e o saldo voltar.
7. Corrigir o vencimento de um título e conferir a linha nova no Log de Alterações, com valor anterior e novo.
8. Entrar no detalhe a partir de cada uma das três listas e confirmar que **Voltar** devolve à lista de origem.
9. Abrir um contrato de compra de preço fixo e confirmar que a **previsão de pagamento** aparece marcada como obrigatória; abrir o diálogo de fixação de preço e confirmar o mesmo no **vencimento financeiro**.

**Derrube a stack ao terminar**, matando por PID nas portas 50000/5246/8080 — parar a task não basta, o file watcher já ressuscitou os três processos neste projeto.

- [ ] **Step 4: Stage**

```bash
git add webapp/view/purchaseContracts/ webapp/view/salesContracts/
```

---

## Fora do escopo deste plano

- **Totais no cabeçalho das listas** (`FinancialDocumentsGetTotals`) — a function existe no backend, mas a revisão final apontou que ela inclui adiantamentos nos totais de Pagar/Receber enquanto as listas os excluem, e a intenção não está fixada. Entra quando essa divergência for decidida.
- **Aba Financeiro no detalhe do contrato** (`FinancialDocumentsGetByContract`) — a function existe; a tela de contrato é de outro módulo e a mudança lá merece o seu próprio plano.
- **Geração sob demanda com simulação** (`FinancialDocumentsGenerateBacklog`) — é operação de implantação, não rotina; uma tela para ela só se justifica se o cliente for rodá-la mais de uma vez.
- **Retenções, documento firme e amortização de adiantamento** — Fase 2 do backend, ainda não construída.
