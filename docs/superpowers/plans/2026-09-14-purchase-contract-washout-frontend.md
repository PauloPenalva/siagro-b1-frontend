# Washout no Contrato de Compra — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the washout screens.
- **Contract detail:** register and reverse washouts from the purchase contract detail, with a
  "Washouts" section and a "Lavado" total in the header.
- **Approval:** a new "Aprovação de Washouts" screen under Compras.
- **Labels:** the new notification, change log and financial origin labels.

**Architecture:**
- **Contract detail.** New UI lives in the existing `purchaseContracts` module, in a new fragment
  plus two dialogs handled by `PurchaseContractsBaseController`.
- **Approval screen.** It mirrors `purchaseContracts/priceFixationApproval`.
- **Data access:**
  - OData actions are invoked via `ODataModel.bindContext(...).invoke()`, same as the fixation
    actions.
  - The fixation choices for the dialog are read with `sendJson("GET", ...)` from
    `helpers/FetchHelpers.ts`. The response is plain OData JSON with PascalCase properties.

**Tech Stack:** OpenUI5 1.141 + TypeScript, OData v4, `sap.ui.table`, `sap.uxap`, `sap.ui.layout.form.Form`.

**Spec:** `../siagro-b1-backend/docs/superpowers/specs/2026-09-14-purchase-contract-washout-design.md` (§7).

**Backend contract:** `../siagro-b1-backend/docs/superpowers/plans/2026-09-14-purchase-contract-washout-backend.md`.
Implement the backend first. The frontend depends on:
- **Entity set** `PurchaseContractsWashouts`: its GET returns only the `InApproval` washouts.
- **Navigation** `PurchaseContracts({key})/Washouts`, plus GET by key.
- **Entity properties:** `Key`, `PurchaseContractKey`, `Sequence`, `PriceFixationKey`,
  `FixedVolume`, `UnfixedVolume`, `ContractPrice`, `MarketPrice`, `PenaltyAmount`, `Amount`,
  `DueDate`, `Reason`, `Status` (`InApproval`, `Approved`, `Rejected`, `Reversed`),
  `ApprovalComments`, `ReversalReason`, `FinancialDocumentKey`, `CreatedBy`, `CreatedAt`.
- **Navigations:** `PurchaseContract`, `PriceFixation`, `FinancialDocument`.
- **Actions:**
  - `PurchaseContractsWashoutCreate(PurchaseContractKey, Washout)`
  - `PurchaseContractsWashoutApproval(Key, Comments)`
  - `PurchaseContractsWashoutReject(Key, Comments)`
  - `PurchaseContractsWashoutReverse(Key, Reason)`
- **Totals DTO:** gains `WashedOutVolume`.
- **Enums:**
  - `NotificationEventType`: `WashoutCreated`, `WashoutApproved`, `WashoutRejected`, `WashoutReversed`.
  - `FinancialDocumentOrigin`: `PurchaseContractWashout`.
  - Financial change log field: `NetAmount`.
  - Contract change log field: `Washout`.
- **Menu Key** `purchaseContractsWashoutApproval`.

## Global Constraints

**Language**
- User-facing text is pt-BR, hardcoded in the XML/TS (the module does not use i18n). Identifiers are English.

**UI5 binding rules**
- **Enum bindings** in expressions and formatters need `targetType: 'any'`.
- **`sap.ui.model.odata.type.DateTimeOffset`** always needs `constraints: { precision: 7 }` and
  `formatOptions: { pattern: 'dd/MM/yyyy' }`.
- **Decimal display:**
  - OData bindings use `sap.ui.model.odata.type.Double`, like the fixations fragment.
  - JSONModel dialog inputs use `sap.ui.model.type.Float`, like `PriceFixationDialog`.
- **Decimals read in TS:** `Context.getProperty` returns `Edm.Decimal` values as STRINGS. Always
  wrap them in `Number(...)`.
- **XML comments:** never write `--` inside an XML comment, and never put a comment between
  attributes. Write `&&` in expressions as `&amp;&amp;`.
- **Selects bound to a JSONModel `selectedKey`:** set the items in the model BEFORE opening the
  dialog.
- **Deferred model writes:** never `await` a `setProperty` on a deferred update group.
- **List refresh:** after an action, refresh the table's own list binding (`$$ownRequest`), never
  `model.refresh()`.

**Workflow**
- **New files:** run `git add` immediately. **Never commit or push.**
- **Gates:** `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint` (no new findings in touched files).
  `yarn test` is known to fail on the 50% coverage gate; do not treat that as a regression.
- **Browser verification:**
  - Web and Gateway run with `--launch-profile yktb`.
  - Port 8080 belongs to another app of the user, so serve the frontend on 8090:
    `npx ui5 serve --port 8090`. Do not touch 8080.
  - The USER logs in: never type credentials.
  - At the end, stop only the processes you started.

---

## File map

**Create**
- `webapp/types/PurchaseContractWashout.ts`
- `webapp/helpers/WashoutHelpers.ts`
- `webapp/view/purchaseContracts/fragments/PurchaseContractWashouts.fragment.xml`
- `webapp/view/purchaseContracts/fragments/WashoutDialog.fragment.xml`
- `webapp/view/purchaseContracts/fragments/WashoutReverseDialog.fragment.xml`
- `webapp/controller/purchaseContracts/washoutApproval/Main.controller.ts`
- `webapp/view/purchaseContracts/washoutApproval/Main.view.xml`
- `webapp/view/purchaseContracts/washoutApproval/fragments/WashoutDecisionDialog.fragment.xml`

**Modify**
- `webapp/model/ServerRoutes.ts` (~108)
- `webapp/model/formatter.ts` (~236, ~720, ~919, ~1073)
- `webapp/types/PurchaseContractsTotal.ts`
- `webapp/view/notificationGroups/fragments/Subscriptions.fragment.xml` (~61)
- `webapp/view/financialDocuments/fragments/Form.fragment.xml` (~35)
- `webapp/controller/purchaseContracts/PurchaseContractsBaseController.ts` (~161 fields, ~396 helpers, ~770 totals)
- `webapp/controller/purchaseContracts/Detail.controller.ts` (~58)
- `webapp/view/purchaseContracts/Detail.view.xml` (~212 header, ~238 sections)
- `webapp/manifest.json` (routes ~372, targets ~1368)

---

### Task 1: Routes, types, helpers, formatters and labels

**Files:**
- Create: `webapp/types/PurchaseContractWashout.ts`, `webapp/helpers/WashoutHelpers.ts`
- Modify:
  - `webapp/model/ServerRoutes.ts` (after `purchaseContractsPriceFixationCancel`, ~108)
  - `webapp/types/PurchaseContractsTotal.ts`
  - `webapp/model/formatter.ts`
  - `webapp/view/notificationGroups/fragments/Subscriptions.fragment.xml` (~61)
  - `webapp/view/financialDocuments/fragments/Form.fragment.xml` (~35)

**Interfaces:**
- Produces:
  - **Routes:** `api.purchaseContractsWashoutCreate`, `api.purchaseContractsWashoutApproval`,
    `api.purchaseContractsWashoutReject`, `api.purchaseContractsWashoutReverse`.
  - **Types:**
    - `WashoutFixationOption { Key: string; Text: string; Price: number; Remaining: number }`
    - `WashoutDialogState` (fields below)
    - `WashoutReverseState { key: string; summary: string; reason: string }`
  - **Helpers:**
    - `calculateWashoutAmount(marketPrice: number, contractPrice: number, fixedVolume: number, penaltyAmount: number): number`
    - `formatNumberPtBr(value: number, decimals: number): string`
  - **Formatters:** `formatWashoutCode(sequence)`, `formatWashoutStatus(value)`,
    `stateWashoutStatus(value)`, `formatFinancialOrigin(value)`.
  - **`PurchaseContractsTotals.WashedOutVolume`.**

- [ ] **Step 1: Add the action routes**

In `webapp/model/ServerRoutes.ts`, right after the line `purchaseContractsPriceFixationCancel: '/PurchaseContractsPriceFixationCancel(...)',`, add:

```ts

  // Washout do contrato de compra, invocado por bindContext. Nas actions de decisão e de
  // estorno, Key é a chave do WASHOUT, não a do contrato.
  purchaseContractsWashoutCreate: '/PurchaseContractsWashoutCreate(...)',
  purchaseContractsWashoutApproval: '/PurchaseContractsWashoutApproval(...)',
  purchaseContractsWashoutReject: '/PurchaseContractsWashoutReject(...)',
  purchaseContractsWashoutReverse: '/PurchaseContractsWashoutReverse(...)',
```

- [ ] **Step 2: Add the types**

In `webapp/types/PurchaseContractsTotal.ts`, add `WashedOutVolume?: number,` as the last member.

Create `webapp/types/PurchaseContractWashout.ts`:

```ts
/**
 * Uma fixação confirmada oferecida no diálogo "Registrar Washout", com o quanto dela ainda pode
 * ser lavado (volume menos os washouts em aprovação e aprovados). É só auxílio visual: a trava
 * real é a do servidor.
 */
export type WashoutFixationOption = {
  Key: string;
  Text: string;
  Price: number;
  Remaining: number;
};

/** Estado do diálogo "Registrar Washout" (viewModel>/washout). */
export type WashoutDialogState = {
  contractKey: string;
  isPaf: boolean;
  fixations: WashoutFixationOption[];
  priceFixationKey: string;
  contractPrice: number;
  fixedVolume: number;
  unfixedVolume: number;
  marketPrice: number;
  penaltyAmount: number;
  amount: number;
  dueDate: Date | null;
  reason: string;
  availablePhysical: number;
  availableToRelease: number;
  availableToPricing: number;
};

/** Estado do diálogo de estorno (viewModel>/washoutReverse). */
export type WashoutReverseState = {
  key: string;
  summary: string;
  reason: string;
};
```

- [ ] **Step 3: Add the helpers**

Create `webapp/helpers/WashoutHelpers.ts`:

```ts
/**
 * Espelho da regra do backend (PurchaseContractWashout.CalculateAmount), só para a prévia do
 * diálogo: round(max(mercado - contrato, 0) x volume fixado, 2) + round(multa, 2). O valor
 * gravado é sempre o calculado no servidor.
 */
export function calculateWashoutAmount(
  marketPrice: number,
  contractPrice: number,
  fixedVolume: number,
  penaltyAmount: number
): number {
  const difference = Math.max(marketPrice - contractPrice, 0) * fixedVolume;
  return roundTo2(difference) + roundTo2(penaltyAmount);
}

export function formatNumberPtBr(value: number, decimals: number): string {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function roundTo2(value: number): number {
  return Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
}
```

- [ ] **Step 4: Add the formatters**

In `webapp/model/formatter.ts`:

Right after `formatPriceFixationStatus` (ends ~244), add:

```ts
  /** Código de exibição do washout: "WO-" + sequencial do contrato. */
  formatWashoutCode: (sequence: number | string) =>
    sequence === null || sequence === undefined || sequence === "" ? "" : `WO-${sequence}`,

  formatWashoutStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("InApproval", "Em Aprovação");
    m.set("Approved", "Aprovado");
    m.set("Rejected", "Rejeitado");
    m.set("Reversed", "Estornado");

    return m.get(value) ?? "";
  },

  stateWashoutStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("InApproval", "Warning");
    m.set("Approved", "Success");
    m.set("Rejected", "Error");
    m.set("Reversed", "None");

    return m.get(value) ?? "None";
  },
```

In `formatContractChangeLogField`, after `m.set("PriceFixation", "Fixação de preço");`, add:

```ts
    m.set("Washout", "Washout");
```

In `formatNotificationEventType`, after the `PriceFixationReversed` line, add:

```ts
    m.set("WashoutCreated", "Washout incluído");
    m.set("WashoutApproved", "Washout aprovado");
    m.set("WashoutRejected", "Washout rejeitado");
    m.set("WashoutReversed", "Washout estornado");
```

In `formatFinancialChangeLogField`, after `m.set("Contract", "Contrato");`, add:

```ts
    // Provisório ajustado no lugar pelo washout.
    m.set("NetAmount", "Valor");
```

Right after `formatFinancialChangeLogField`, add:

```ts
  /** Origem do documento financeiro (enum FinancialDocumentOrigin). */
  formatFinancialOrigin: (value: string) => {
    const m = new Map<string, string>();
    m.set("Manual", "Manual");
    m.set("PurchaseContractPriceFixation", "Fixação de contrato de compra");
    m.set("SalesContractPriceFixation", "Fixação de contrato de venda");
    m.set("PurchaseInvoice", "Documento de entrada");
    m.set("SalesInvoice", "Documento de saída");
    m.set("FinancialDocument", "Documento financeiro");
    m.set("PurchaseContractWashout", "Washout de contrato de compra");

    return m.get(value) ?? value ?? "";
  },
```

- [ ] **Step 5: Add the labels to the existing screens**

In `webapp/view/notificationGroups/fragments/Subscriptions.fragment.xml`, right after the `PriceFixationReversed` `core:ListItem`, add:

```xml
            <core:ListItem key="WashoutCreated" text="Washout incluído" />
            <core:ListItem key="WashoutApproved" text="Washout aprovado" />
            <core:ListItem key="WashoutRejected" text="Washout rejeitado" />
            <core:ListItem key="WashoutReversed" text="Washout estornado" />
```

In `webapp/view/financialDocuments/fragments/Form.fragment.xml`, right BEFORE the `Contrato de origem` `f:FormElement`, add:

```xml
          <f:FormElement label="Origem">
            <f:fields>
              <Text text="{path: 'OriginType', targetType: 'any', formatter: 'formatter.formatFinancialOrigin'}"/>
            </f:fields>
          </f:FormElement>
```

- [ ] **Step 6: Run the gates**

Run: `yarn ts-typecheck`, then `yarn lint`. Expected: both pass with no new findings.

- [ ] **Step 7: Stage**

```powershell
git add webapp/types/PurchaseContractWashout.ts webapp/helpers/WashoutHelpers.ts
```

---

### Task 2: Contract detail (header total, Washouts section, register and reverse dialogs)

**Files:**
- Create:
  - `webapp/view/purchaseContracts/fragments/PurchaseContractWashouts.fragment.xml`
  - `webapp/view/purchaseContracts/fragments/WashoutDialog.fragment.xml`
  - `webapp/view/purchaseContracts/fragments/WashoutReverseDialog.fragment.xml`
- Modify:
  - `webapp/controller/purchaseContracts/PurchaseContractsBaseController.ts`
  - `webapp/controller/purchaseContracts/Detail.controller.ts:58`
  - `webapp/view/purchaseContracts/Detail.view.xml` (header VBox "Saldo:" ~199-213; sections after "Fixação de Preços" ~238)

**Interfaces:**
- Consumes (from Task 1):
  - Routes: `api.purchaseContractsWashoutCreate`, `api.purchaseContractsWashoutReverse`.
  - Types and helpers: `WashoutDialogState`, `WashoutFixationOption`, `WashoutReverseState`,
    `calculateWashoutAmount`, `formatNumberPtBr`.
  - Formatters: `formatWashoutCode`, `formatWashoutStatus`, `stateWashoutStatus`.
- Produces (view handlers):
  - `onOpenWashoutDialog`, `onWashoutValuesChange`, `onConfirmWashout`, `onCloseWashoutDialog`
  - `onReverseWashout`, `onConfirmWashoutReverse`, `onCloseWashoutReverseDialog`
  - Table id `purchaseContractWashoutsTable`.

- [ ] **Step 1: Create the Washouts section fragment**

`webapp/view/purchaseContracts/fragments/PurchaseContractWashouts.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:t="sap.ui.table"
    xmlns:core="sap.ui.core"
>
  <!--
    Somente leitura: washout muda por action (registrar, aprovar na fila, estornar), nunca por
    edição na grade. A tabela tem cache próprio ($$ownRequest) para ser refrescada sozinha.
    O título vem pela navegação FinancialDocument; o autoExpandSelect monta o $expand.
  -->
  <t:Table
    id="purchaseContractWashoutsTable"
    class="sapUiSizeCondensed"
    alternateRowColors="true"
    enableBusyIndicator="true"
    enableSelectAll="false"
    selectionBehavior="Row"
    selectionMode="Single"
    busyIndicatorDelay="0"
    rows="{
      path: 'Washouts',
      parameters: { '$$ownRequest': true, '$orderby': 'Sequence desc' }
    }"
    >
    <t:extension>
      <OverflowToolbar>
        <content>
          <Title text="Washouts do Contrato de Compra" />
          <ToolbarSpacer />
          <Button
            visible="{= ${path: 'Status', targetType: 'any'} === 'Approved' &amp;&amp; !${ui>/readonly} }"
            text="Registrar Washout"
            tooltip="Registrar a desistência de volume não entregue pelo produtor"
            type="Transparent"
            icon="sap-icon://add"
            press=".onOpenWashoutDialog"
          />
          <Button
            visible="{= ${path: 'Status', targetType: 'any'} === 'Approved' &amp;&amp; !${ui>/readonly} }"
            text="Estornar"
            tooltip="Estornar washout aprovado: cancela o título a receber e restaura o provisório"
            type="Transparent"
            icon="sap-icon://undo"
            press=".onReverseWashout"
          />
        </content>
      </OverflowToolbar>
    </t:extension>
    <t:columns>
      <t:Column label="Código" width="6rem">
        <t:template>
          <Text text="{path: 'Sequence', formatter: '.formatter.formatWashoutCode'}" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Status" width="8rem">
        <t:template>
          <ObjectStatus
            text="{path: 'Status', targetType: 'any', formatter: '.formatter.formatWashoutStatus'}"
            state="{path: 'Status', targetType: 'any', formatter: '.formatter.stateWashoutStatus'}"/>
        </t:template>
      </t:Column>
      <t:Column label="Vol. Fixado" hAlign="End">
        <t:template>
          <Text text="{path: 'FixedVolume', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
        </t:template>
      </t:Column>
      <t:Column label="Vol. Não Fixado" hAlign="End">
        <t:template>
          <Text text="{path: 'UnfixedVolume', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
        </t:template>
      </t:Column>
      <t:Column label="Preço Contrato" hAlign="End">
        <t:template>
          <Text text="{path: 'ContractPrice', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 4, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
        </t:template>
      </t:Column>
      <t:Column label="Preço Mercado" hAlign="End">
        <t:template>
          <Text text="{path: 'MarketPrice', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 4, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
        </t:template>
      </t:Column>
      <t:Column label="Multa" hAlign="End">
        <t:template>
          <Text text="{path: 'PenaltyAmount', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 2, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
        </t:template>
      </t:Column>
      <t:Column label="Valor a Receber" hAlign="End">
        <t:template>
          <Text text="{path: 'Amount', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 2, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
        </t:template>
      </t:Column>
      <t:Column label="Vencimento">
        <t:template>
          <Text text="{path: 'DueDate', type: 'sap.ui.model.odata.type.DateTimeOffset', constraints: { precision: 7 }, formatOptions: { pattern: 'dd/MM/yyyy' }}"/>
        </t:template>
      </t:Column>
      <t:Column label="Título">
        <t:template>
          <Text text="{FinancialDocument/Code}" wrapping="false"/>
        </t:template>
      </t:Column>
      <t:Column label="Motivo" width="14rem">
        <t:template>
          <Text text="{Reason}" wrapping="false" tooltip="{Reason}"/>
        </t:template>
      </t:Column>
      <t:Column label="Registrado por">
        <t:template>
          <Text text="{CreatedBy}" wrapping="false"/>
        </t:template>
      </t:Column>
    </t:columns>
  </t:Table>
</core:FragmentDefinition>
```

- [ ] **Step 2: Create the register dialog**

`webapp/view/purchaseContracts/fragments/WashoutDialog.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
<!--
  Estado em viewModel>/washout (WashoutDialogState). Os itens do Select são gravados no modelo
  ANTES de abrir: selectedKey de JSONModel com itens chegando depois renderiza vazio.
-->
<Dialog id="purchaseContractWashoutDialog" title="Registrar Washout">
  <content>
    <VBox class="sapUiSmallMargin" width="480px">
      <MessageStrip
        text="Saldo físico: {path: 'viewModel>/washout/availablePhysical', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, groupingEnabled: true }} · Não liberado: {path: 'viewModel>/washout/availableToRelease', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, groupingEnabled: true }}"
        type="Information"
        showIcon="true"
        class="sapUiSmallMarginBottom"
      />
      <f:Form editable="true">
        <f:layout>
          <f:ColumnLayout columnsM="1" columnsL="1" columnsXL="1"/>
        </f:layout>
        <f:formContainers>
          <f:FormContainer>
            <f:formElements>
              <f:FormElement label="Fixação" visible="{= ${viewModel>/washout/fixations}.length > 0 }">
                <f:fields>
                  <Select
                    width="100%"
                    forceSelection="false"
                    items="{viewModel>/washout/fixations}"
                    selectedKey="{viewModel>/washout/priceFixationKey}"
                    change=".onWashoutValuesChange">
                    <core:Item key="{viewModel>Key}" text="{viewModel>Text}"/>
                  </Select>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Preço da Fixação">
                <f:fields>
                  <Text text="{path: 'viewModel>/washout/contractPrice', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 4, groupingEnabled: true }}"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Volume Fixado">
                <f:fields>
                  <Input
                    value="{path: 'viewModel>/washout/fixedVolume', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, groupingEnabled: true }}"
                    change=".onWashoutValuesChange"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Volume Não Fixado" visible="{viewModel>/washout/isPaf}">
                <f:fields>
                  <Input
                    value="{path: 'viewModel>/washout/unfixedVolume', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, groupingEnabled: true }}"
                    description="a fixar: {path: 'viewModel>/washout/availableToPricing', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, groupingEnabled: true }}"
                    change=".onWashoutValuesChange"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Preço de Mercado">
                <f:fields>
                  <Input
                    value="{path: 'viewModel>/washout/marketPrice', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 4, groupingEnabled: true }}"
                    change=".onWashoutValuesChange"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Multa">
                <f:fields>
                  <Input
                    value="{path: 'viewModel>/washout/penaltyAmount', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 2, groupingEnabled: true }}"
                    change=".onWashoutValuesChange"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Valor a Receber">
                <f:fields>
                  <ObjectNumber
                    number="{path: 'viewModel>/washout/amount', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 2, groupingEnabled: true }}"
                    unit="BRL"
                    emphasized="true"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Vencimento do Título">
                <f:fields>
                  <DatePicker
                    value="{path: 'viewModel>/washout/dueDate', type: 'sap.ui.model.type.Date', formatOptions: { pattern: 'dd/MM/yyyy' }}"
                    required="{= ${viewModel>/washout/amount} > 0 }"/>
                </f:fields>
              </f:FormElement>
              <f:FormElement label="Motivo">
                <f:fields>
                  <TextArea
                    value="{viewModel>/washout/reason}"
                    rows="3"
                    width="100%"
                    maxLength="500"
                    required="true"
                    placeholder="Por que o produtor não vai entregar"/>
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
      <Button text="Registrar" type="Emphasized" press=".onConfirmWashout"/>
      <Button text="Fechar" press=".onCloseWashoutDialog" />
    </OverflowToolbar>
  </footer>
</Dialog>
</core:FragmentDefinition>
```

- [ ] **Step 3: Create the reverse dialog**

`webapp/view/purchaseContracts/fragments/WashoutReverseDialog.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
>
<Dialog id="purchaseContractWashoutReverseDialog" title="Estornar Washout">
  <content>
    <VBox class="sapUiSmallMargin" width="460px">
      <MessageStrip
        text="{viewModel>/washoutReverse/summary}"
        type="Warning"
        showIcon="true"
        class="sapUiSmallMarginBottom"
      />
      <TextArea
        value="{viewModel>/washoutReverse/reason}"
        rows="4"
        width="100%"
        maxLength="500"
        placeholder="Motivo do estorno (obrigatório)"
      />
    </VBox>
  </content>
  <footer>
    <OverflowToolbar>
      <ToolbarSpacer />
      <Button text="Estornar" type="Emphasized" press=".onConfirmWashoutReverse"/>
      <Button text="Fechar" press=".onCloseWashoutReverseDialog" />
    </OverflowToolbar>
  </footer>
</Dialog>
</core:FragmentDefinition>
```

- [ ] **Step 4: Add the handlers to the base controller**

In `webapp/controller/purchaseContracts/PurchaseContractsBaseController.ts`:

Add to the imports:

```ts
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { calculateWashoutAmount, formatNumberPtBr } from "siagrob1/helpers/WashoutHelpers";
import { WashoutDialogState, WashoutFixationOption, WashoutReverseState } from "siagrob1/types/PurchaseContractWashout";
```

Right after `private _priceFixationDetailsDialog: Dialog;`, add:

```ts
  private _washoutDialog: Dialog;
  private _washoutReverseDialog: Dialog;
```

Right after the method `refreshPriceFixationsList()` (ends ~396), add:

```ts
  /**
   * Abre "Registrar Washout". As fixações e os washouts ativos do contrato são lidos antes de
   * abrir, para o Select nascer com os itens e o saldo de cada fixação já descontado. Os saldos
   * do cabeçalho vêm de PurchaseContractsTotals (viewModel). Tudo aqui é auxílio visual: as
   * travas reais são as do servidor (PurchaseContractsWashoutGuard).
   */
  async onOpenWashoutDialog() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.alert("Contrato não carregado.");
      return;
    }

    const contractKey = ctx.getProperty("Key") as string;
    const isPaf = (ctx.getProperty("Type") as string) === "ToBeDetermined";
    const viewModel = this.getModel("viewModel") as JSONModel;

    let fixations: WashoutFixationOption[];
    this.setBusy(true);
    try {
      fixations = await this.loadWashoutFixationOptions(contractKey);
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao carregar as fixações do contrato.");
      return;
    } finally {
      this.setBusy(false);
    }

    const firstAvailable = fixations.find(f => f.Remaining > 0) ?? fixations[0];

    const state: WashoutDialogState = {
      contractKey,
      isPaf,
      fixations,
      priceFixationKey: firstAvailable?.Key ?? "",
      contractPrice: firstAvailable?.Price ?? 0,
      fixedVolume: 0,
      unfixedVolume: 0,
      marketPrice: 0,
      penaltyAmount: 0,
      amount: 0,
      dueDate: null,
      reason: "",
      availablePhysical: Number(viewModel.getProperty("/AvaiableVolume") ?? 0),
      availableToRelease: Number(viewModel.getProperty("/TotalAvailableToRelease") ?? 0),
      availableToPricing: isPaf ? Number(viewModel.getProperty("/AvailableVolumeToPricing") ?? 0) : 0,
    };
    viewModel.setProperty("/washout", state);

    this._washoutDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.purchaseContracts.fragments.WashoutDialog"
    );

    this._washoutDialog?.open();
  }

  onCloseWashoutDialog() {
    this._washoutDialog?.close();
  }

  /** Recalcula a prévia do valor sempre que fixação, volume, mercado ou multa mudam. */
  onWashoutValuesChange() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const state = viewModel.getProperty("/washout") as WashoutDialogState;
    const fixation = state.fixations.find(f => f.Key === state.priceFixationKey);
    const contractPrice = fixation?.Price ?? 0;

    viewModel.setProperty("/washout/contractPrice", contractPrice);
    viewModel.setProperty(
      "/washout/amount",
      calculateWashoutAmount(
        Number(state.marketPrice ?? 0),
        contractPrice,
        Number(state.fixedVolume ?? 0),
        Number(state.penaltyAmount ?? 0)
      )
    );
  }

  async onConfirmWashout() {
    this.onWashoutValuesChange();

    const viewModel = this.getModel("viewModel") as JSONModel;
    const state = viewModel.getProperty("/washout") as WashoutDialogState;
    const fixedVolume = Number(state.fixedVolume ?? 0);
    const unfixedVolume = state.isPaf ? Number(state.unfixedVolume ?? 0) : 0;
    const reason = (state.reason ?? "").trim();

    if (fixedVolume < 0 || unfixedVolume < 0) {
      MessageBox.error("Os volumes do washout não podem ser negativos.");
      return;
    }
    if (fixedVolume + unfixedVolume <= 0) {
      MessageBox.error("Informe o volume do washout.");
      return;
    }
    if (fixedVolume > 0 && !state.priceFixationKey) {
      MessageBox.error("Selecione a fixação de preço do volume fixado.");
      return;
    }
    if (!reason) {
      MessageBox.error("Informe o motivo do washout.");
      return;
    }
    if (state.amount > 0 && !state.dueDate) {
      MessageBox.error("Informe o vencimento do título a receber.");
      return;
    }

    this.onCloseWashoutDialog();
    this.setBusy(true);

    // Mesmo padrão da criação de fixação: action com parâmetro de entidade, invocada pelo
    // ODataModel; em seguida refrescamos a lista e os totais.
    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(this.api.purchaseContractsWashoutCreate);
    action.setParameter("PurchaseContractKey", state.contractKey);
    action.setParameter("Washout", {
      PriceFixationKey: fixedVolume > 0 ? state.priceFixationKey : null,
      FixedVolume: fixedVolume,
      UnfixedVolume: unfixedVolume,
      MarketPrice: Number(state.marketPrice ?? 0),
      PenaltyAmount: Number(state.penaltyAmount ?? 0),
      DueDate: state.dueDate ?? null,
      Reason: reason,
    });

    try {
      await action.invoke();
      MessageToast.show("Washout enviado para aprovação.");
      this.refreshContractTotals();
      this.refreshWashoutsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao registrar washout.");
    } finally {
      this.setBusy(false);
    }
  }

  async onReverseWashout() {
    const oTable = this.byId("purchaseContractWashoutsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione um washout para estornar.");
      return;
    }

    const ctx = oTable.getContextByIndex(selected);

    if ((ctx.getProperty("Status") as string) !== "Approved") {
      MessageBox.error(
        "Só é possível estornar washout aprovado. Washout em aprovação é rejeitado na tela de aprovação."
      );
      return;
    }

    const amount = Number(ctx.getProperty("Amount") ?? 0);
    const state: WashoutReverseState = {
      key: ctx.getProperty("Key") as string,
      summary:
        `WO-${ctx.getProperty("Sequence") as number}: o volume volta ao saldo, o provisório da fixação é restaurado` +
        (amount > 0 ? ` e o título a receber de R$ ${formatNumberPtBr(amount, 2)} é cancelado.` : "."),
      reason: "",
    };
    (this.getModel("viewModel") as JSONModel).setProperty("/washoutReverse", state);

    this._washoutReverseDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.purchaseContracts.fragments.WashoutReverseDialog"
    );

    this._washoutReverseDialog?.open();
  }

  onCloseWashoutReverseDialog() {
    this._washoutReverseDialog?.close();
  }

  async onConfirmWashoutReverse() {
    const state = (this.getModel("viewModel") as JSONModel).getProperty("/washoutReverse") as WashoutReverseState;
    const reason = (state.reason ?? "").trim();

    if (!reason) {
      MessageBox.error("Informe o motivo do estorno.");
      return;
    }

    this.onCloseWashoutReverseDialog();
    this.setBusy(true);

    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(this.api.purchaseContractsWashoutReverse);
    action.setParameter("Key", state.key);
    action.setParameter("Reason", reason);

    try {
      await action.invoke();
      MessageToast.show("Washout estornado.");
      this.refreshContractTotals();
      this.refreshWashoutsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao estornar washout.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Fixações confirmadas do contrato com o saldo lavável de cada uma (volume menos washouts em
   * aprovação e aprovados). Lido por fetch, fora do modelo: é dado de diálogo, não de tela, e
   * o filtro é feito aqui para não depender de $filter sobre enum.
   */
  private async loadWashoutFixationOptions(contractKey: string): Promise<WashoutFixationOption[]> {
    type FixationRow = { Key: string; FixationDate?: string; FixationVolume: number | string; FixationPrice: number | string; Status: string };
    type WashoutRow = { PriceFixationKey?: string; FixedVolume: number | string; Status: string };

    const [fixations, washouts] = await Promise.all([
      sendJson("GET", `/odata/PurchaseContracts(${contractKey})/PriceFixations`),
      sendJson("GET", `/odata/PurchaseContracts(${contractKey})/Washouts`),
    ]);

    if (!fixations.ok) throw new Error(fixations.message);
    if (!washouts.ok) throw new Error(washouts.message);

    const activeWashouts = ((washouts.data as { value?: WashoutRow[] })?.value ?? [])
      .filter(w => w.Status === "InApproval" || w.Status === "Approved");

    return ((fixations.data as { value?: FixationRow[] })?.value ?? [])
      .filter(f => f.Status === "Confirmed")
      .map(f => {
        const volume = Number(f.FixationVolume ?? 0);
        const price = Number(f.FixationPrice ?? 0);
        const washed = activeWashouts
          .filter(w => w.PriceFixationKey === f.Key)
          .reduce((sum, w) => sum + Number(w.FixedVolume ?? 0), 0);
        const remaining = volume - washed;
        const date = f.FixationDate ? new Date(f.FixationDate).toLocaleDateString("pt-BR") : "";

        return {
          Key: f.Key,
          Price: price,
          Remaining: remaining,
          Text: `${date} · ${formatNumberPtBr(volume, 3)} @ ${formatNumberPtBr(price, 4)} · saldo ${formatNumberPtBr(remaining, 3)}`,
        };
      });
  }

  /** Mesmo motivo de refreshPriceFixationsList: a tabela tem $$ownRequest e cache próprio. */
  private refreshWashoutsList() {
    const oBinding = (this.byId("purchaseContractWashoutsTable") as Table)
      .getBinding("rows") as ODataListBinding;
    oBinding?.refresh();

    this.refreshChangeLogs();
  }
```

In `refreshContractTotals()`:
- Add `WashedOutVolume?: number;` to the inline `data` type.
- Add `viewModel.setProperty("/WashedOutVolume", data.WashedOutVolume ?? 0);` after the `/AvaiableVolume` line.

- [ ] **Step 5: Load the total on route match**

In `webapp/controller/purchaseContracts/Detail.controller.ts`, after
`viewModel.setProperty("/AvaiableVolume", data.AvaiableVolume ?? 0)`, add:

```ts
          viewModel.setProperty("/WashedOutVolume", data.WashedOutVolume ?? 0)
```

- [ ] **Step 6: Update the Detail view**

In `webapp/view/purchaseContracts/Detail.view.xml`, inside the last header `VBox` (the one holding
"Saldo:"), right after the "Saldo:" `HBox`, add:

```xml
          <HBox class="sapUiTinyMarginBottom">
            <Text text="Lavado:" class="sapUiMediumMarginEnd" />
            <ObjectNumber number="{
              path: 'viewModel>/WashedOutVolume',
              type: 'sap.ui.model.odata.type.Double',
              formatOptions:{
                decimals: 3,
                decimalSeparator: ',',
                groupingEnabled: true,
                groupingSeparator: '.'
              }
            }" unit="{UnitOfMeasureCode}"  />
          </HBox>
```

Right after the `ObjectPageSection` titled "Fixação de Preços", add:

```xml
      <uxap:ObjectPageSection titleUppercase="false" title="Washouts">
				<uxap:subSections>
					<uxap:ObjectPageSubSection titleUppercase="false">
						 <core:Fragment fragmentName="siagrob1.view.purchaseContracts.fragments.PurchaseContractWashouts" type="XML" />
					</uxap:ObjectPageSubSection>
				</uxap:subSections>
			</uxap:ObjectPageSection>
```

- [ ] **Step 7: Run the gates**

Run: `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint`. Expected: no new findings in the touched or created files.

- [ ] **Step 8: Stage**

```powershell
git add webapp/view/purchaseContracts/fragments/PurchaseContractWashouts.fragment.xml webapp/view/purchaseContracts/fragments/WashoutDialog.fragment.xml webapp/view/purchaseContracts/fragments/WashoutReverseDialog.fragment.xml
```

---

### Task 3: "Aprovação de Washouts" screen

**Files:**
- Create:
  - `webapp/controller/purchaseContracts/washoutApproval/Main.controller.ts`
  - `webapp/view/purchaseContracts/washoutApproval/Main.view.xml`
  - `webapp/view/purchaseContracts/washoutApproval/fragments/WashoutDecisionDialog.fragment.xml`
- Modify: `webapp/manifest.json` (route after `purchaseContractsPriceFixationApproval` ~372; target after ~1368)

**Interfaces:**
- Consumes:
  - From Task 1: `api.purchaseContractsWashoutApproval`, `api.purchaseContractsWashoutReject`,
    `formatNumberPtBr`, `formatWashoutCode`.
  - From the backend: `GET /PurchaseContractsWashouts`, which returns only the InApproval washouts.
- Produces: route and target `purchaseContractsWashoutApproval`. The name equals the backend menu Key.

- [ ] **Step 1: Register the route and target**

In `webapp/manifest.json`, right after the route object whose name is `purchaseContractsPriceFixationApproval`, add:

```json
        {
          "pattern": "purchase-contracts/washout-approval",
          "name": "purchaseContractsWashoutApproval",
          "target": "purchaseContractsWashoutApproval"
        },
```

Right after the target object `purchaseContractsPriceFixationApproval`, add:

```json
        "purchaseContractsWashoutApproval": {
          "id": "purchaseContractsWashoutApproval",
          "level": 1,
          "name": "siagrob1.view.purchaseContracts.washoutApproval.Main",
          "clearControlAggregation": true
        },
```

- [ ] **Step 2: Create the decision dialog**

`webapp/view/purchaseContracts/washoutApproval/fragments/WashoutDecisionDialog.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
>
<Dialog id="washoutDecisionDialog" title="{viewModel>/washoutDecision/title}">
  <content>
    <VBox class="sapUiSmallMargin" width="460px">
      <MessageStrip
        text="{viewModel>/washoutDecision/summary}"
        type="Information"
        showIcon="true"
        class="sapUiSmallMarginBottom"
      />
      <TextArea
        value="{viewModel>/washoutDecision/comments}"
        rows="5"
        width="100%"
        maxLength="500"
        placeholder="{viewModel>/washoutDecision/placeholder}"
      />
    </VBox>
  </content>
  <footer>
    <OverflowToolbar>
      <ToolbarSpacer />
      <Button text="{viewModel>/washoutDecision/confirmText}" type="Emphasized" press=".onConfirmWashoutDecision"/>
      <Button text="Fechar" press=".onCloseWashoutDecisionDialog" />
    </OverflowToolbar>
  </footer>
</Dialog>
</core:FragmentDefinition>
```

- [ ] **Step 3: Create the view**

`webapp/view/purchaseContracts/washoutApproval/Main.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.purchaseContracts.washoutApproval.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
  xmlns:f="sap.f"
	core:require="{
		formatter: 'siagrob1/model/formatter'
	}">
  <f:DynamicPage busyIndicatorDelay="0" busy="{ui>/busy}">
    <f:title>
      <f:DynamicPageTitle>
        <f:heading>
          <Title text="Aprovação de Washouts"/>
        </f:heading>
      </f:DynamicPageTitle>
    </f:title>
    <f:content>
      <!-- O backend (PurchaseContractsWashoutsGetService.QueryPending) já restringe a InApproval. -->
      <Table
        id="washoutApprovalTable"
        growing="true"
        growingThreshold="20"
        growingScrollToLoad="true"
        alternateRowColors="true"
        fixedLayout="Strict"
        busyIndicatorDelay="0"
        mode="SingleSelectLeft"
        items="{
          path: '/PurchaseContractsWashouts',
          parameters: {
            $expand: 'PurchaseContract',
            $orderby: 'CreatedAt',
            $count: true
          }
        }"
        >
        <headerToolbar>
          <OverflowToolbar>
            <Title text="Washouts Aguardando Aprovação"/>
            <ToolbarSpacer/>
            <Button
              text="Ver Contrato"
              tooltip="Abrir o contrato de compra do washout selecionado"
              icon="sap-icon://document"
              press=".onViewContract"/>
            <Button text="Aprovar" type="Accept" icon="sap-icon://accept" press=".onApprove"/>
            <Button text="Rejeitar" type="Reject" icon="sap-icon://decline" press=".onReject"/>
            <Button tooltip="Atualizar" icon="sap-icon://refresh" press=".onRefresh"/>
          </OverflowToolbar>
        </headerToolbar>
        <columns>
          <Column><Text text="Contrato"/></Column>
          <Column><Text text="Fornecedor"/></Column>
          <Column hAlign="End"><Text text="Vol. Fixado"/></Column>
          <Column hAlign="End"><Text text="Vol. Não Fixado"/></Column>
          <Column hAlign="End"><Text text="Contrato / Mercado"/></Column>
          <Column hAlign="End"><Text text="Multa"/></Column>
          <Column hAlign="End"><Text text="Valor a Receber"/></Column>
          <Column><Text text="Vencimento"/></Column>
          <Column><Text text="Motivo"/></Column>
          <Column><Text text="Registrado por"/></Column>
        </columns>
        <items>
          <ColumnListItem>
            <cells>
              <ObjectIdentifier
                title="{PurchaseContract/Code}"
                text="{path: 'Sequence', formatter: '.formatter.formatWashoutCode'}"/>
              <Text text="{PurchaseContract/CardName}"/>
              <Text text="{path: 'FixedVolume', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
              <Text text="{path: 'UnfixedVolume', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
              <Text text="{path: 'ContractPrice', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 4, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }} / {path: 'MarketPrice', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 4, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
              <Text text="{path: 'PenaltyAmount', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 2, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"/>
              <ObjectNumber
                number="{path: 'Amount', type: 'sap.ui.model.odata.type.Double', formatOptions: { decimals: 2, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }}"
                unit="BRL"
                emphasized="true"/>
              <Text text="{path: 'DueDate', type: 'sap.ui.model.odata.type.DateTimeOffset', constraints: { precision: 7 }, formatOptions: { pattern: 'dd/MM/yyyy' }}"/>
              <Text text="{Reason}"/>
              <Text text="{CreatedBy}"/>
            </cells>
          </ColumnListItem>
        </items>
      </Table>
    </f:content>
  </f:DynamicPage>
</mvc:View>
```

- [ ] **Step 4: Create the controller**

`webapp/controller/purchaseContracts/washoutApproval/Main.controller.ts`:

```ts
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/m/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { formatNumberPtBr } from "siagrob1/helpers/WashoutHelpers";

type WashoutDecision = "Approve" | "Reject";

type WashoutDecisionState = {
  action: WashoutDecision;
  key: string;
  title: string;
  summary: string;
  comments: string;
  placeholder: string;
  confirmText: string;
};

/**
 * Fila de washouts em aprovação, de todos os contratos de compra. Espelha
 * purchaseContracts/priceFixationApproval.
 *
 * @namespace siagrob1.controller.purchaseContracts.washoutApproval
 */
export default class Main extends CommonController {

  private _decisionDialog: Dialog;

  onInit(): void {
    this.getRouter().getRoute("purchaseContractsWashoutApproval")
      .attachPatternMatched(() => this.onRefresh());
  }

  onRefresh(): void {
    const table = this.byId("washoutApprovalTable") as Table;
    (table.getBinding("items") as ODataListBinding)?.refresh();
  }

  onApprove(): void {
    void this.openDecisionDialog("Approve");
  }

  onReject(): void {
    void this.openDecisionDialog("Reject");
  }

  onViewContract(): void {
    const item = (this.byId("washoutApprovalTable") as Table).getSelectedItem();

    if (!item) {
      MessageBox.alert("Selecione um washout para ver o contrato.");
      return;
    }

    const contractKey = item.getBindingContext().getProperty("PurchaseContract/Key") as string;

    if (!contractKey) {
      MessageBox.error("Contrato do washout não encontrado.");
      return;
    }

    // readonly=true: o aprovador só visualiza; a tela de detalhe esconde toda ação.
    this.navTo("purchaseContractsDetail", { id: contractKey, "?query": { readonly: "true" } });
  }

  onCloseWashoutDecisionDialog(): void {
    this._decisionDialog?.close();
  }

  async onConfirmWashoutDecision(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const state = viewModel.getProperty("/washoutDecision") as WashoutDecisionState;
    const comments = (state.comments ?? "").trim();
    const isApprove = state.action === "Approve";

    if (!isApprove && !comments) {
      MessageBox.error("Informe o motivo da rejeição.");
      return;
    }

    this.onCloseWashoutDecisionDialog();
    this.setBusy(true);

    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(
      isApprove ? this.api.purchaseContractsWashoutApproval : this.api.purchaseContractsWashoutReject
    );
    action.setParameter("Key", state.key);
    action.setParameter("Comments", comments);

    try {
      await action.invoke();
      MessageToast.show(isApprove ? "Washout aprovado." : "Washout rejeitado.");
      this.onRefresh();
    } catch (err) {
      MessageBox.error(
        (err as Error).message || (isApprove ? "Erro ao aprovar washout." : "Erro ao rejeitar washout.")
      );
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Resumo do que se decide: volumes e o valor que vira título a receber. getProperty devolve
   * Edm.Decimal como string, daí o Number().
   */
  private async openDecisionDialog(action: WashoutDecision): Promise<void> {
    const item = (this.byId("washoutApprovalTable") as Table).getSelectedItem();

    if (!item) {
      MessageBox.alert("Selecione um washout.");
      return;
    }

    const ctx = item.getBindingContext() as Context;
    const fixedVolume = Number(ctx.getProperty("FixedVolume") ?? 0);
    const unfixedVolume = Number(ctx.getProperty("UnfixedVolume") ?? 0);
    const amount = Number(ctx.getProperty("Amount") ?? 0);
    const code = (ctx.getProperty("PurchaseContract/Code") as string) ?? "";
    const sequence = ctx.getProperty("Sequence") as number;
    const isApprove = action === "Approve";

    const state: WashoutDecisionState = {
      action,
      key: ctx.getProperty("Key") as string,
      title: isApprove ? "Aprovar Washout?" : "Rejeitar Washout?",
      summary:
        `Contrato ${code} WO-${sequence}: ${formatNumberPtBr(fixedVolume, 3)} fixado + ` +
        `${formatNumberPtBr(unfixedVolume, 3)} não fixado. Valor a receber: R$ ${formatNumberPtBr(amount, 2)}.`,
      comments: "",
      placeholder: isApprove ? "Comentários (opcional)" : "Motivo da rejeição (obrigatório)",
      confirmText: isApprove ? "Aprovar" : "Rejeitar",
    };
    (this.getModel("viewModel") as JSONModel).setProperty("/washoutDecision", state);

    this._decisionDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.purchaseContracts.washoutApproval.fragments.WashoutDecisionDialog"
    );

    this._decisionDialog?.open();
  }
}
```

- [ ] **Step 5: Run the gates**

1. Run `yarn ts-typecheck`, `yarn lint` and `yarn ui5lint`. Expected: no new findings.
2. Run the `mcp__plugin_ui5_ui5-mcp-server__run_manifest_validation` tool on `webapp/manifest.json`.
   Expected: no new errors.

- [ ] **Step 6: Stage**

```powershell
git add webapp/controller/purchaseContracts/washoutApproval webapp/view/purchaseContracts/washoutApproval
```

---

### Task 4: Browser verification through the user's path

Nothing is done until this passes from the home screen. An endpoint answering over curl does not count.

**Preconditions**
- The backend plan is complete and its migrations are applied to localhost.
- **Stack running:**
  - `dotnet run --project SiagroB1.Web --launch-profile yktb` and
    `dotnet run --project SiagroB1.Gateway --launch-profile yktb`, both in the background.
  - The frontend on port 8090: `npx ui5 serve --port 8090` (never 8080).
  - Record the PIDs you started.
- **Login:** ask the USER to log in at `http://localhost:8090` in the browser. Never type credentials.
- **Test data:** pick two approved contracts on the local database:
  - **FIX:** a fixed-price contract with a balance not yet released and an open provisional
    payable.
  - **PAF:** a to-be-determined contract with one confirmed fixation and unfixed volume left.

- [ ] **Step 1: Menu**

The Compras group shows "Aprovação de Washouts", and it opens the empty or pending queue without
console errors.

- [ ] **Step 2: Register on the FIX contract**

On the contract detail, open the "Washouts" section and click "Registrar Washout":
1. The Select comes with the automatic fixation already selected, and the price is shown.
2. Enter fixed volume 1.000, market above the contract price, a penalty, a due date and a reason.
   The "Valor a Receber" preview matches `(mercado − contrato) × 1.000 + multa`.
3. Click Registrar. The toast appears, the row shows WO-n "Em Aprovação", the header "Lavado"
   increases by 1.000, and "Saldo" and "Aguardando Liberação" drop by 1.000.
4. The Log de Alterações shows a "Washout" row.

- [ ] **Step 3: Guards reach the screen**

Try to register a volume above "Não liberado". A business message dialog appears (not the generic
technical error), and the network tab shows a 400 with the message.

- [ ] **Step 4: Approve**

In "Aprovação de Washouts":
1. The row appears with the contract code and WO-n. Approve it with a comment; the row disappears.
2. Back on the contract detail, the status is "Aprovado" and the Título column is filled.
3. **Contas a Receber:** the new receivable exists, with Origem "Washout de contrato de compra",
   the amount and the due date.
4. **Contas a Pagar:** the provisional of that contract is reduced by `1.000 × preço`, and its
   change log shows "Valor" old → new.

- [ ] **Step 5: Reverse**

On the contract detail, select the approved washout and click Estornar:
1. The reason is required.
2. After reversing, the row shows "Estornado", "Lavado" goes back, and the provisional amount is
   restored.
3. The receivable shows as "Cancelado".

- [ ] **Step 6: PAF, reject**

On the PAF contract, register a washout with fixed volume 0 and unfixed volume > 0:
1. The "Volume Não Fixado" field is visible.
2. "Volume a fixar" in the header drops by the same amount.
3. In the approval queue, click Rejeitar with no reason: it is refused. With a reason, the washout
   is rejected, and the contract's "Lavado" and "Volume a fixar" go back.

- [ ] **Step 7: Readonly and regressions**

1. Open the contract from the fixation approval queue ("Ver Contrato"). The washout buttons are
   hidden.
2. A contract with `Status` other than Approved shows no "Registrar Washout".
3. The console has no errors and the network tab has no 500 during the whole run.

- [ ] **Step 8: Tear down**

1. Stop only the processes you started (Web, Gateway, ui5 serve).
2. Report each step as pass or fail with evidence: screenshots or the key network responses.
3. Do not commit.

