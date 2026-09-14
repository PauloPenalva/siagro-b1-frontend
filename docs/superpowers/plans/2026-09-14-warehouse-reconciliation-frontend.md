# Conferência de Saldo de Armazém: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GAC-1164 screens:
- **Conferência de Saldo de Armazém:** list, create, edit and detail, with approval, cancellation and attachments.
- **Aprovação de Conferências:** the approval screen.
- **Motivos de Conferência:** the reasons register.
- **Type labels:** "Perda Armazém"/"Sobra Armazém" for storage transaction types 13/14.

**Architecture:**
- **Module layout:** three new modules under `webapp/{controller,view}/`: `warehouseReconciliations` (with an `approval` sub-folder) and `warehouseReconciliationReasons`.
- **Patterns followed:**
  - `ownershipTransfers` for the list, filterbar and Excel export.
  - `financialAccounts` for `Form` + `ColumnLayout` CRUD.
  - `purchaseContracts/approval` for the IconTabBar approval list.
- **Data access:**
  - Entity CRUD goes through the OData v4 model (`bindList().create()` + `submitBatch`).
  - Actions, the balance preview and attachments use `fetch`, through one helper that shows the backend's business message. The backend answers `BadRequest(string)`, so the body is the message itself.

**Tech Stack:** OpenUI5 1.141 + TypeScript, OData v4, `sap.ui.table`, `sap.uxap`, `sap.ui.layout.form.Form`.

**Spec:** `../siagro-b1-backend/docs/superpowers/specs/2026-09-14-warehouse-reconciliation-design.md`
**Backend contract:** Task 8 of `../siagro-b1-backend/docs/superpowers/plans/2026-09-14-warehouse-reconciliation-backend.md`. Implement the backend first.

## Global Constraints

**Language and scope**
- User-facing text is pt-BR, hardcoded in the XML/TS (these modules do not use i18n). Identifiers are English.
- Only third-party warehouses are allowed. The server enforces this; the screen only warns early.

**UI5 binding rules**
- **Enum and date bindings** in expressions and formatters need `targetType: 'any'`.
- **`sap.ui.model.odata.type.DateTimeOffset`** always needs `constraints: { precision: 7 }` and `formatOptions: { pattern: 'dd/MM/yyyy' }`.
- **Editable decimals** use `sap.ui.model.odata.type.Double` with `decimals: 3`. Never `Decimal`, and never `type="Number"` on `sap.m.Input`.
- **XML comments:** never write `--` inside a comment (it kills the whole fragment), and never put a comment between attributes. Write `&&` in expressions as `&amp;&amp;`.
- **Selects bound to OData `selectedKey`** use `forceSelection="false"`.

**Backend payload formats**
- The backend's function/REST JSON may come back in camelCase. Read both casings through the normalizer from Task 1.

**Workflow**
- **New files:** run `git add` immediately. **Never commit or push.**
- **Gates:** `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint` (no new findings in new files). `yarn test` is known to fail on the 50% coverage gate; do not treat that as a regression, and stop the dev server before running it.
- **Browser verification:** Web + Gateway with `--launch-profile yktb`, then `yarn start:dev` (port 8080), login `admin`/`1234`. Kill all three processes by port (50000/5246/8080) at the end.

---

## File map

**Create**
- `webapp/types/WarehouseReconciliationBalancePreview.ts`
- `webapp/controller/warehouseReconciliations/BaseController.ts`, `Main.controller.ts`, `Add.controller.ts`, `Edit.controller.ts`, `Detail.controller.ts`
- `webapp/view/warehouseReconciliations/Main.view.xml`, `Add.view.xml`, `Edit.view.xml`, `Detail.view.xml`
- `webapp/view/warehouseReconciliations/fragments/Filterbar.fragment.xml`, `Form.fragment.xml`, `Attachments.fragment.xml`, `AttachmentUploadDialog.fragment.xml`, `DecisionDialog.fragment.xml`
- `webapp/controller/warehouseReconciliations/approval/Main.controller.ts`, `Detail.controller.ts`
- `webapp/view/warehouseReconciliations/approval/Main.view.xml`, `Detail.view.xml`
- `webapp/controller/warehouseReconciliationReasons/Main.controller.ts`, `Add.controller.ts`, `Edit.controller.ts`
- `webapp/view/warehouseReconciliationReasons/Main.view.xml`, `Add.view.xml`, `Edit.view.xml`, `fragments/Form.fragment.xml`

**Modify**
- `webapp/manifest.json`: routes after `ownershipTransfersDetail` (~line 522), targets after `ownershipTransfersDetail` (~line 1473)
- `webapp/model/ServerRoutes.ts`
- `webapp/model/formatter.ts`: the `formatStorageTransactionType` block (~433) plus new status/direction formatters
- Export valueMaps: `controller/ownershipTransfers/BaseController.ts` (~254), `controller/storageTransactions/BaseController.ts` (~86), `controller/storageInvoices/BaseController.ts` (~83), `controller/purchaseOrders/allocation/BaseController.ts` (~39). `purchaseContracts/allocation` stays unchanged because types 13/14 are never allocatable.
- `webapp/controller/storageTransactions/Main.controller.ts` (~49-54): Perda/Sobra join the Romaneios list's default scope (read-only)
- `webapp/view/storageTransactions/fragments/Filterbar.fragment.xml` (~63)

---

### Task 1: Routes, server routes, preview type, formatters and the 13/14 label sweep

**Files:**
- Modify: `webapp/manifest.json`
- Modify: `webapp/model/ServerRoutes.ts`
- Create: `webapp/types/WarehouseReconciliationBalancePreview.ts`
- Modify: `webapp/model/formatter.ts`
- Modify: the 5 export valueMaps and `view/storageTransactions/fragments/Filterbar.fragment.xml`

**Interfaces:**
- Produces:
  - **Route names**, which must equal the backend menu keys: `warehouseReconciliations`,
    `warehouseReconciliationsApproval` and `warehouseReconciliationReasons`. Also
    `warehouseReconciliationsNew`, `warehouseReconciliationsEdit`, `warehouseReconciliationsDetail`,
    `warehouseReconciliationsApprovalDetail`, `warehouseReconciliationReasonsAdd` and
    `warehouseReconciliationReasonsEdit`.
  - **`ServerRoutes` keys**: `warehouseReconciliationsSendApproval`, `…WithdrawApproval`,
    `…Approval`, `…Reject`, `…Cancel`, `…GetBalancePreview`, `…AttachmentsList`,
    `…AttachmentUpload` and `…AttachmentsDownload`. All are absolute `/odata/...` strings used with
    `fetch`.
  - **Type and normalizer**: `WarehouseReconciliationBalancePreview` and
    `normalizeBalancePreview(raw: unknown): WarehouseReconciliationBalancePreview`.
  - **Formatters**: `formatWarehouseReconciliationStatus`, `stateWarehouseReconciliationStatus`,
    `formatWarehouseReconciliationDirection` and `stateWarehouseReconciliationDirection`.

- [ ] **Step 1: Add the routes to `manifest.json`.** Add the routes after the `ownershipTransfersDetail` route object:

```json
        {
          "pattern": "warehouse-reconciliations",
          "name": "warehouseReconciliations",
          "target": "warehouseReconciliations"
        },
        {
          "pattern": "warehouse-reconciliations/new",
          "name": "warehouseReconciliationsNew",
          "target": "warehouseReconciliationsNew"
        },
        {
          "pattern": "warehouse-reconciliations/{id}/edit",
          "name": "warehouseReconciliationsEdit",
          "target": "warehouseReconciliationsEdit"
        },
        {
          "pattern": "warehouse-reconciliations/{id}/detail",
          "name": "warehouseReconciliationsDetail",
          "target": "warehouseReconciliationsDetail"
        },
        {
          "pattern": "warehouse-reconciliations-approval",
          "name": "warehouseReconciliationsApproval",
          "target": "warehouseReconciliationsApproval"
        },
        {
          "pattern": "warehouse-reconciliations-approval/{id}",
          "name": "warehouseReconciliationsApprovalDetail",
          "target": "warehouseReconciliationsApprovalDetail"
        },
        {
          "pattern": "warehouse-reconciliation-reasons",
          "name": "warehouseReconciliationReasons",
          "target": "warehouseReconciliationReasons"
        },
        {
          "pattern": "warehouse-reconciliation-reasons/new",
          "name": "warehouseReconciliationReasonsAdd",
          "target": "warehouseReconciliationReasonsAdd"
        },
        {
          "pattern": "warehouse-reconciliation-reasons/{id}/edit",
          "name": "warehouseReconciliationReasonsEdit",
          "target": "warehouseReconciliationReasonsEdit"
        },
```

  Add the targets after the `ownershipTransfersDetail` target object, keeping the file's existing indentation:

```json
        "warehouseReconciliations": {
          "id": "warehouseReconciliations",
          "level": 1,
          "name": "siagrob1.view.warehouseReconciliations.Main",
          "clearControlAggregation": true
        },
        "warehouseReconciliationsNew": {
          "id": "warehouseReconciliationsNew",
          "level": 2,
          "name": "siagrob1.view.warehouseReconciliations.Add",
          "clearControlAggregation": true
        },
        "warehouseReconciliationsEdit": {
          "id": "warehouseReconciliationsEdit",
          "level": 2,
          "name": "siagrob1.view.warehouseReconciliations.Edit",
          "clearControlAggregation": true
        },
        "warehouseReconciliationsDetail": {
          "id": "warehouseReconciliationsDetail",
          "level": 2,
          "name": "siagrob1.view.warehouseReconciliations.Detail",
          "clearControlAggregation": true
        },
        "warehouseReconciliationsApproval": {
          "id": "warehouseReconciliationsApproval",
          "level": 1,
          "name": "siagrob1.view.warehouseReconciliations.approval.Main",
          "clearControlAggregation": true
        },
        "warehouseReconciliationsApprovalDetail": {
          "id": "warehouseReconciliationsApprovalDetail",
          "level": 2,
          "name": "siagrob1.view.warehouseReconciliations.approval.Detail",
          "clearControlAggregation": true
        },
        "warehouseReconciliationReasons": {
          "id": "warehouseReconciliationReasons",
          "level": 1,
          "name": "siagrob1.view.warehouseReconciliationReasons.Main",
          "clearControlAggregation": true
        },
        "warehouseReconciliationReasonsAdd": {
          "id": "warehouseReconciliationReasonsAdd",
          "level": 2,
          "name": "siagrob1.view.warehouseReconciliationReasons.Add",
          "clearControlAggregation": true
        },
        "warehouseReconciliationReasonsEdit": {
          "id": "warehouseReconciliationReasonsEdit",
          "level": 2,
          "name": "siagrob1.view.warehouseReconciliationReasons.Edit",
          "clearControlAggregation": true
        },
```

  Validate the JSON:

```powershell
Get-Content webapp\manifest.json -Raw | ConvertFrom-Json | Out-Null
```

  Expected: no error.

- [ ] **Step 2: Add the ServerRoutes entries.** Add these before the closing `}` of `ServerRoutes.ts`:

```ts
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
```

- [ ] **Step 3: Create the preview type.** `webapp/types/WarehouseReconciliationBalancePreview.ts`:

```ts
/** Prévia de saldo da Conferência de Saldo de Armazém. */
export type WarehouseReconciliationBalancePreview = {
  systemBalance: number;
  isOwnWarehouse: boolean;
  lastApprovedReferenceDate: string | null;
  hasOpenReconciliation: boolean;
};

type RawPreview = Record<string, unknown>;

/**
 * A function OData devolve o DTO sem envelope e a caixa das chaves depende do serializador
 * (as respostas REST deste backend saem em camelCase). Lê as duas formas para não falhar
 * em silêncio com `undefined`.
 */
export function normalizeBalancePreview(raw: unknown): WarehouseReconciliationBalancePreview {
  const o = (raw ?? {}) as RawPreview;
  const pick = (camel: string, pascal: string) => o[camel] ?? o[pascal];

  return {
    systemBalance: Number(pick("systemBalance", "SystemBalance") ?? 0),
    isOwnWarehouse: Boolean(pick("isOwnWarehouse", "IsOwnWarehouse")),
    lastApprovedReferenceDate: (pick("lastApprovedReferenceDate", "LastApprovedReferenceDate") as string) ?? null,
    hasOpenReconciliation: Boolean(pick("hasOpenReconciliation", "HasOpenReconciliation")),
  };
}
```

- [ ] **Step 4: Add the formatters.** In `webapp/model/formatter.ts`:
  - Inside `formatStorageTransactionType`, add these lines after `m.set("PurchasePriceComplement", "Compl.Preço");`:

```ts
    m.set("WarehouseLoss", "Perda Armazém");
    m.set("WarehouseGain", "Sobra Armazém");
```

  - After the `stateOwnershipTransferStatus` entry, add:

```ts
  formatWarehouseReconciliationStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Draft", "Rascunho");
    m.set("InApproval", "Em aprovação");
    m.set("Approved", "Aprovada");
    m.set("Rejected", "Rejeitada");
    m.set("Cancelled", "Cancelada");

    return m.get(value);
  },

  stateWarehouseReconciliationStatus: (value: string) => {
    const m = new Map<string, string>();
    m.set("Draft", "None");
    m.set("InApproval", "Warning");
    m.set("Approved", "Success");
    m.set("Rejected", "Error");
    m.set("Cancelled", "Error");

    return m.get(value);
  },

  /** Diferença negativa = Perda, positiva = Sobra. Aceita número ou string (JSON model/OData). */
  formatWarehouseReconciliationDirection: (difference: number | string) => {
    const n = Number(difference);
    if (!difference && difference !== 0) return "";
    if (n < 0) return "Perda";
    if (n > 0) return "Sobra";
    return "Sem diferença";
  },

  stateWarehouseReconciliationDirection: (difference: number | string) => {
    const n = Number(difference);
    if (n < 0) return "Error";
    if (n > 0) return "Success";
    return "None";
  },
```

- [ ] **Step 5: Sweep the labels.**
  - **ownershipTransfers, storageTransactions and storageInvoices export valueMaps.** In each
    `valueMap` that lists `"PurchasePriceComplement": "Compl.Preço",`
    (`controller/ownershipTransfers/BaseController.ts`, `controller/storageTransactions/BaseController.ts`,
    `controller/storageInvoices/BaseController.ts`), add:

```ts
            "WarehouseLoss": "Perda Armazém",
            "WarehouseGain": "Sobra Armazém",
```

  - **purchaseContracts allocation export.** Leave `controller/purchaseContracts/allocation/BaseController.ts`
    **unchanged**. It lists allocations, and 13/14 are never allocatable.
  - **purchaseOrders allocation export.** In `controller/purchaseOrders/allocation/BaseController.ts`,
    add after `PurchasePriceComplement: "Compl.Preço"` (put a comma on the previous line):

```ts
        WarehouseLoss: "Perda Armazém",
        WarehouseGain: "Sobra Armazém"
```

  - **Romaneios filterbar.** In `view/storageTransactions/fragments/Filterbar.fragment.xml`, add after
    `<core:ListItem key="PurchasePriceComplement" text="Compl.Preço"/>`:

```xml
              <core:ListItem key="WarehouseLoss" text="Perda Armazém"/>
              <core:ListItem key="WarehouseGain" text="Sobra Armazém"/>
```

  - **Do NOT touch** the type `Select` in `storageTransactions/fragments/Form.fragment.xml` or
    `shippingTransaction/fragments/Form.fragment.xml`. These types must not be created by hand.

- [ ] **Step 6: Run the gates.**

Run: `yarn ts-typecheck` and `yarn lint`
Expected: no new errors in the changed files.

- [ ] **Step 7: Stage the new file.**

```bash
git add webapp/types/WarehouseReconciliationBalancePreview.ts
```

---

### Task 2: Fetch helper and the reasons register

**Files:**
- Create: `webapp/helpers/FetchHelpers.ts`
- Create: `webapp/controller/warehouseReconciliationReasons/Main.controller.ts`, `Add.controller.ts`, `Edit.controller.ts`
- Create: `webapp/view/warehouseReconciliationReasons/Main.view.xml`, `Add.view.xml`, `Edit.view.xml`, `fragments/Form.fragment.xml`

**Interfaces:**
- Consumes: routes `warehouseReconciliationReasons`, `…Add` and `…Edit` (Task 1). The backend entity set is `WarehouseReconciliationReasons` (Key, Code, Description, Active).
- Produces:
  - `readErrorMessage(response: Response): Promise<string>`
  - `sendJson(method: "GET" | "POST" | "DELETE", url: string, payload?: object): Promise<FetchResult>`, where `FetchResult = { ok: boolean; data?: unknown; message?: string }`

- [ ] **Step 1: Create the fetch helper.** `webapp/helpers/FetchHelpers.ts`:

```ts
/**
 * Chamadas ao backend fora do modelo OData (actions, functions sem envelope, DELETE com mensagem).
 *
 * O backend responde erro de negócio como `BadRequest(string)`: o corpo JÁ É a mensagem, então
 * `responseJSON.message` seria undefined e o usuário veria só um texto genérico. Aceita também o
 * envelope OData `{ error: { message } }` e `{ message }`.
 */
export type FetchResult = { ok: boolean; data?: unknown; message?: string };

export async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.text())?.trim();
  if (!body) {
    return "";
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    const o = parsed as { message?: string; error?: { message?: string } };
    return o?.error?.message ?? o?.message ?? body;
  } catch {
    return body;
  }
}

export async function sendJson(
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: object
): Promise<FetchResult> {
  const response = await fetch(url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    return { ok: false, message: message || `Erro ${response.status} ao comunicar com o servidor.` };
  }

  const text = await response.text();
  return { ok: true, data: text ? (JSON.parse(text) as unknown) : undefined };
}
```

- [ ] **Step 2: Create the reason form.** `view/warehouseReconciliationReasons/fragments/Form.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
  <f:Form id="warehouseReconciliationReasonForm" editable="true">
    <f:layout>
      <f:ColumnLayout columnsM="1" columnsL="2" columnsXL="2"/>
    </f:layout>
    <f:formContainers>
      <f:FormContainer title="Motivo">
        <f:formElements>
          <f:FormElement label="Código">
            <f:fields>
              <Input value="{Code}" maxLength="20" required="true" liveChange=".validateField"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Descrição">
            <f:fields>
              <Input value="{Description}" maxLength="100" required="true" liveChange=".validateField"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Ativo" visible="{ui>/reasonActiveVisible}">
            <f:fields>
              <CheckBox selected="{Active}"/>
            </f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>
    </f:formContainers>
  </f:Form>
</core:FragmentDefinition>
```

- [ ] **Step 3: Create the views.** `view/warehouseReconciliationReasons/Main.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.warehouseReconciliationReasons.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:t="sap.ui.table"
	xmlns:f="sap.f">

	<f:DynamicPage busyIndicatorDelay="0" busy="{ui>/busy}">
		<f:title>
			<f:DynamicPageTitle>
				<f:heading>
					<Title text="Motivos de Conferência de Saldo"/>
				</f:heading>
			</f:DynamicPageTitle>
		</f:title>
		<f:content>
			<t:Table
				id="warehouseReconciliationReasonsTable"
				busyIndicatorDelay="0"
				selectionMode="Single"
				selectionBehavior="Row"
				class="sapUiSizeCondensed"
				visibleRowCountMode="Auto"
				alternateRowColors="true"
				rows="{
					path: '/WarehouseReconciliationReasons',
					sorter: { path: 'Code' }
				}"
			>
				<t:extension>
					<OverflowToolbar>
						<Title text="Motivos" />
						<ToolbarSpacer />
						<Button type="Emphasized" icon="sap-icon://add" text="Incluir" press=".onCreate"/>
						<Button type="Transparent" text="Editar" press=".onEdit"/>
						<Button type="Transparent" text="Excluir" press=".onDelete"/>
						<Button type="Transparent" text="Atualizar" press=".onRefresh"/>
					</OverflowToolbar>
				</t:extension>
				<t:columns>
					<t:Column label="Código" width="12rem" sortProperty="Code">
						<t:template>
							<Text text="{Code}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Descrição" width="30rem" sortProperty="Description">
						<t:template>
							<Text text="{Description}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Ativo" width="7rem" hAlign="Center" sortProperty="Active">
						<t:template>
							<CheckBox selected="{Active}" editable="false"/>
						</t:template>
					</t:Column>
				</t:columns>
			</t:Table>
		</f:content>
	</f:DynamicPage>
</mvc:View>
```

  `view/warehouseReconciliationReasons/Add.view.xml`. `Edit.view.xml` is identical except that
  `controllerName` ends in `.Edit` and both titles read `Editar Motivo de Conferência`.

```xml
<mvc:View
	controllerName="siagrob1.controller.warehouseReconciliationReasons.Add"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:uxap="sap.uxap">

  <uxap:ObjectPageLayout showFooter="true" busy="{ui>/busy}" busyIndicatorDelay="0">
    <uxap:headerTitle>
      <uxap:ObjectPageDynamicHeaderTitle>
        <uxap:expandedHeading>
          <Title text="Novo Motivo de Conferência"/>
        </uxap:expandedHeading>
        <uxap:snappedHeading>
          <Title text="Novo Motivo de Conferência"/>
        </uxap:snappedHeading>
      </uxap:ObjectPageDynamicHeaderTitle>
    </uxap:headerTitle>
    <uxap:sections>
      <uxap:ObjectPageSection titleUppercase="false" title="Dados do Motivo">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.warehouseReconciliationReasons.fragments.Form" type="XML" />
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

- [ ] **Step 4: Create the controllers.** `controller/warehouseReconciliationReasons/Main.controller.ts`:

```ts
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { sendJson } from "siagrob1/helpers/FetchHelpers";

/**
 * @namespace siagrob1.controller.warehouseReconciliationReasons
 */
export default class Main extends CommonController {

  // O router reaproveita a view: sem refresh ao entrar, o motivo recém-gravado não apareceria.
  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationReasons")
      .attachPatternMatched(() => this.onRefresh());
  }

  onRefresh(): void {
    (this.byId("warehouseReconciliationReasonsTable").getBinding("rows") as ODataListBinding)?.refresh();
  }

  onCreate(): void {
    this.navTo("warehouseReconciliationReasonsAdd");
  }

  onEdit(): void {
    const ctx = this.selectedContext();
    if (!ctx) return;
    this.navTo("warehouseReconciliationReasonsEdit", { id: ctx.getProperty("Key") as string });
  }

  async onDelete(): Promise<void> {
    const ctx = this.selectedContext();
    if (!ctx) return;

    if (!(await DialogHelper.confirmDialog("Excluir o motivo selecionado ?"))) return;

    this.setBusy(true);
    try {
      // fetch e não context.delete(): o motivo em uso volta 400 com mensagem de negócio
      // ("desative em vez de excluir") que precisa chegar inteira ao usuário.
      const result = await sendJson("DELETE", `/odata/WarehouseReconciliationReasons(${ctx.getProperty("Key") as string})`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Motivo excluído.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  private selectedContext(): Context | null {
    const table = this.byId("warehouseReconciliationReasonsTable") as Table;
    const i = table.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione um motivo.");
      return null;
    }
    return table.getContextByIndex(i) as Context;
  }
}
```

  `controller/warehouseReconciliationReasons/Add.controller.ts`:

```ts
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * @namespace siagrob1.controller.warehouseReconciliationReasons
 */
export default class Add extends CommonController {

  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationReasonsAdd")
      .attachPatternMatched(() => this.prepare());
  }

  private prepare(): void {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    // Motivo nasce ativo; desativar é decisão da edição.
    uiModel.setProperty("/reasonActiveVisible", false);

    this.resetModelChanges();

    const oBinding = (this.getModel() as ODataModel).bindList("/WarehouseReconciliationReasons");
    const oContext = oBinding.create({ Code: "", Description: "", Active: true }, false, false, false);
    this.getView().setBindingContext(oContext);
  }

  async onSave(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    if (!String(ctx?.getProperty("Code") ?? "").trim() || !String(ctx?.getProperty("Description") ?? "").trim()) {
      MessageBox.warning("Informe o código e a descrição do motivo.");
      return;
    }

    const oModel = this.getModel() as ODataModel;
    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      MessageToast.show("Motivo incluído.");
      this.navTo("warehouseReconciliationReasons");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("warehouseReconciliationReasons");
  }
}
```

  `controller/warehouseReconciliationReasons/Edit.controller.ts`:

```ts
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * @namespace siagrob1.controller.warehouseReconciliationReasons
 */
export default class Edit extends CommonController {

  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationReasonsEdit")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/reasonActiveVisible", true);

    this.resetModelChanges();
    this.bindElement(`/WarehouseReconciliationReasons(${id})`);
  }

  async onSave(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    if (!String(ctx?.getProperty("Code") ?? "").trim() || !String(ctx?.getProperty("Description") ?? "").trim()) {
      MessageBox.warning("Informe o código e a descrição do motivo.");
      return;
    }

    const oModel = this.getModel() as ODataModel;
    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      MessageToast.show("Motivo alterado.");
      this.navTo("warehouseReconciliationReasons");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("warehouseReconciliationReasons");
  }
}
```

- [ ] **Step 5: Run the gates.**

Run: `yarn ts-typecheck`, `yarn lint` and `yarn ui5lint`
Expected: no new errors or findings in these files. Also parse every new XML file:

```powershell
Get-ChildItem webapp\view\warehouseReconciliationReasons -Recurse -Filter *.xml | ForEach-Object { [xml](Get-Content $_.FullName -Raw) | Out-Null }
```

- [ ] **Step 6: Stage the new files.**

```bash
git add webapp/helpers/FetchHelpers.ts webapp/controller/warehouseReconciliationReasons webapp/view/warehouseReconciliationReasons
```

---

### Task 3: Reconciliation form, list, create and edit

**Files:**
- Create: `webapp/controller/warehouseReconciliations/BaseController.ts`
- Create: `webapp/controller/warehouseReconciliations/Main.controller.ts`, `Add.controller.ts`, `Edit.controller.ts`
- Create: `webapp/view/warehouseReconciliations/Main.view.xml`, `Add.view.xml`, `Edit.view.xml`
- Create: `webapp/view/warehouseReconciliations/fragments/Form.fragment.xml`, `Filterbar.fragment.xml`

**Interfaces:**
- Consumes:
  - `sendJson` (Task 2)
  - `normalizeBalancePreview`, `ServerRoutes.warehouseReconciliationsGetBalancePreview` and the Task 1 formatters
  - `CommonController.applyValueHelp` (protected), `openUnitsOfMeasureValueHelp`, `getBranchInfo()`, `getSystemSetup()`, `resetModelChanges()`, `bindElement()` and `orderExportColumns()`
- Produces:
  - Abstract `BaseController` with:
    - `initReconciliationModel()` and `wr()`
    - `referenceDateOf(ctx)` and `todayAtNoonIso()`
    - `refreshPreview(ctx)`, `updateDifference(ctx)` and `afterKeyFieldsChanged()`
    - `onWarehouseValueHelp`, `onItemValueHelp`, `onReferenceDateChange` and `onReportedBalanceChange`
    - `validateReconciliation(ctx)`
    - the protected flag `warnIfOpen`
  - A view model named `wr` with `/preview/{systemBalance,difference,lastApprovedReferenceDate,hasOpenReconciliation}`, `/dialog/{title,confirmText,action,text,textLabel,textRequired}` and `/attachment/description`.
  - Form fragment id `warehouseReconciliationForm`. It reads `ui>/editable`.

- [ ] **Step 1: Create the base controller.** `controller/warehouseReconciliations/BaseController.ts`:

```ts
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import CommonController from "../common/CommonController";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  normalizeBalancePreview,
  WarehouseReconciliationBalancePreview,
} from "siagrob1/types/WarehouseReconciliationBalancePreview";

/**
 * Base das telas da Conferência de Saldo de Armazém (GAC-1164).
 *
 * O saldo do sistema e a diferença mostrados no formulário são PRÉVIA: o servidor recalcula e
 * congela os dois no envio e na aprovação. O que vale para a decisão é o snapshot gravado.
 *
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export abstract class BaseController extends CommonController {

  /** Só a inclusão avisa sobre conferência em aberto: na edição, a aberta é a própria. */
  protected warnIfOpen = false;

  protected initReconciliationModel(): JSONModel {
    const model = new JSONModel({
      preview: { systemBalance: null, difference: null, lastApprovedReferenceDate: null, hasOpenReconciliation: false },
      dialog: { title: "", confirmText: "", action: "", text: "", textLabel: "", textRequired: false },
      attachment: { description: "" },
    });
    this.getView().setModel(model, "wr");
    return model;
  }

  protected wr(): JSONModel {
    return this.getModel("wr") as JSONModel;
  }

  protected resetPreview(): void {
    this.wr().setProperty("/preview", {
      systemBalance: null, difference: null, lastApprovedReferenceDate: null, hasOpenReconciliation: false,
    });
  }

  /**
   * Meio-dia com o fuso local: evita que a conversão de fuso no servidor jogue a data para o dia
   * anterior (00:00 em -03:00 é 21:00 da véspera em UTC).
   */
  protected todayAtNoonIso(): string {
    const d = new Date();
    const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00:00` +
      `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
  }

  /** `yyyy-MM-dd` da data de referência do contexto. */
  protected referenceDateOf(ctx: Context): string | null {
    const raw = ctx?.getProperty("ReferenceDate") as string | Date | null;
    if (!raw) return null;
    if (raw instanceof Date) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
    }
    // DateTimeOffset serializado com o fuso do servidor: os 10 primeiros caracteres são a data.
    return String(raw).substring(0, 10);
  }

  protected updateDifference(ctx: Context): void {
    const system = this.wr().getProperty("/preview/systemBalance") as number | null;
    const reported = Number(ctx?.getProperty("ReportedBalance") ?? 0);
    this.wr().setProperty(
      "/preview/difference",
      system === null ? null : Math.round((reported - system) * 1000) / 1000
    );
  }

  protected async refreshPreview(ctx: Context): Promise<WarehouseReconciliationBalancePreview | null> {
    const warehouseCode = ctx?.getProperty("WarehouseCode") as string;
    const itemCode = ctx?.getProperty("ItemCode") as string;
    const referenceDate = this.referenceDateOf(ctx);

    if (!warehouseCode || !itemCode || !referenceDate) {
      this.resetPreview();
      return null;
    }

    const literal = (v: string) => encodeURIComponent(v.replace(/'/g, "''"));
    const url = `${this.api.warehouseReconciliationsGetBalancePreview}` +
      `(WarehouseCode='${literal(warehouseCode)}',ItemCode='${literal(itemCode)}',ReferenceDate='${referenceDate}')`;

    const result = await sendJson("GET", url);
    if (!result.ok) {
      MessageBox.error(result.message);
      return null;
    }

    const preview = normalizeBalancePreview(result.data);
    this.wr().setProperty("/preview/systemBalance", preview.systemBalance);
    this.wr().setProperty("/preview/lastApprovedReferenceDate", preview.lastApprovedReferenceDate);
    this.wr().setProperty("/preview/hasOpenReconciliation", preview.hasOpenReconciliation);
    this.updateDifference(ctx);
    return preview;
  }

  /** Reavalia a prévia e as travas que o servidor aplicará, para o usuário errar cedo. */
  protected async afterKeyFieldsChanged(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    const preview = await this.refreshPreview(ctx);
    if (!preview) return;

    if (preview.isOwnWarehouse) {
      MessageBox.warning("A conferência de saldo só pode ser feita para armazém de terceiros.");
      await ctx.setProperty("WarehouseCode", "");
      await ctx.setProperty("WarehouseName", null, null);
      this.resetPreview();
      return;
    }

    if (this.warnIfOpen && preview.hasOpenReconciliation) {
      MessageBox.warning("Já existe uma conferência em rascunho ou em aprovação para este armazém e produto.");
    }
  }

  async onWarehouseValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    await this.applyValueHelp(ev, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"], "Code");
    await this.afterKeyFieldsChanged();
  }

  async onItemValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    await this.applyValueHelp(ev, "ItemsSelectDialog", ["ItemCode", "ItemName"], "ItemCode");
    await this.afterKeyFieldsChanged();
  }

  onReferenceDateChange(): void {
    void this.afterKeyFieldsChanged();
  }

  onReportedBalanceChange(): void {
    this.updateDifference(this.getView().getBindingContext() as Context);
  }

  /** Obrigatórios lidos do contexto: o Form com ColumnLayout não tem `getContent()`. */
  protected validateReconciliation(ctx: Context): boolean {
    const missing: string[] = [];
    const empty = (p: string) => !String(ctx?.getProperty(p) ?? "").trim();

    if (empty("BranchCode")) missing.push("Filial");
    if (empty("ReferenceDate")) missing.push("Data de referência");
    if (empty("WarehouseCode")) missing.push("Armazém");
    if (empty("ItemCode")) missing.push("Produto");
    if (empty("UnitOfMeasureCode")) missing.push("Unidade de medida");
    if (empty("ReasonKey")) missing.push("Motivo");

    if (missing.length) {
      MessageBox.warning(`Preencha os campos obrigatórios: ${missing.join(", ")}.`);
      return false;
    }

    if (Number(ctx.getProperty("ReportedBalance")) < 0) {
      MessageBox.warning("O saldo informado pelo armazém não pode ser negativo.");
      return false;
    }

    return true;
  }
}
```

- [ ] **Step 2: Create the form fragment.** `view/warehouseReconciliations/fragments/Form.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
    core:require="{ formatter: 'siagrob1/model/formatter' }"
>
  <f:Form id="warehouseReconciliationForm" editable="true">
    <f:layout>
      <f:ColumnLayout columnsM="2" columnsL="3" columnsXL="3"/>
    </f:layout>
    <f:formContainers>
      <f:FormContainer title="Identificação">
        <f:formElements>
          <f:FormElement label="Número">
            <f:fields>
              <Input value="{Code}" editable="false"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Status">
            <f:fields>
              <ObjectStatus
                inverted="true"
                state="{ path: 'Status', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationStatus' }"
                text="{ path: 'Status', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationStatus' }"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Filial">
            <f:fields>
              <Select
                editable="{ui>/editable}"
                forceSelection="false"
                required="true"
                selectedKey="{BranchCode}"
                items="{ path: '/Branchs', sorter: { path: 'Code' } }">
                <core:ListItem key="{Code}" text="{ShortName}" additionalText="{Code}"/>
              </Select>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Data de referência">
            <f:fields>
              <DatePicker
                value="{
                  path: 'ReferenceDate',
                  type: 'sap.ui.model.odata.type.DateTimeOffset',
                  constraints: { precision: 7 },
                  formatOptions: { pattern: 'dd/MM/yyyy' }
                }"
                editable="{ui>/editable}"
                required="true"
                change=".onReferenceDateChange"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Motivo">
            <f:fields>
              <Select
                visible="{ui>/editable}"
                forceSelection="false"
                required="true"
                selectedKey="{ReasonKey}"
                items="{ path: '/WarehouseReconciliationReasons', parameters: { $filter: 'Active eq true' }, sorter: { path: 'Description' } }">
                <core:ListItem key="{Key}" text="{Description}"/>
              </Select>
              <Input visible="{= !${ui>/editable} }" value="{Reason/Description}" editable="false"/>
            </f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>

      <f:FormContainer title="Armazém e produto">
        <f:formElements>
          <f:FormElement label="Armazém de terceiros">
            <f:fields>
              <Input
                value="{WarehouseCode}"
                editable="{ui>/editable}"
                required="true"
                showValueHelp="true"
                valueHelpOnly="true"
                valueHelpRequest=".onWarehouseValueHelp">
                <customData>
                  <core:CustomData key="descriptionProperty" value="WarehouseName:Name"/>
                </customData>
              </Input>
              <Input value="{WarehouseName}" editable="false"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Produto">
            <f:fields>
              <Input
                value="{ItemCode}"
                editable="{ui>/editable}"
                required="true"
                showValueHelp="true"
                valueHelpOnly="true"
                valueHelpRequest=".onItemValueHelp">
                <customData>
                  <core:CustomData key="descriptionProperty" value="ItemName"/>
                </customData>
              </Input>
              <Input value="{ItemName}" editable="false"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Un. Med.">
            <f:fields>
              <Input
                value="{UnitOfMeasureCode}"
                editable="{ui>/editable}"
                required="true"
                showValueHelp="true"
                valueHelpOnly="true"
                valueHelpRequest=".openUnitsOfMeasureValueHelp"/>
            </f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>

      <f:FormContainer title="Saldos">
        <f:formElements>
          <f:FormElement label="Saldo informado pelo armazém">
            <f:fields>
              <Input
                required="true"
                editable="{ui>/editable}"
                change=".onReportedBalanceChange"
                value="{
                  path: 'ReportedBalance',
                  type: 'sap.ui.model.odata.type.Double',
                  formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
                }"
                description="{UnitOfMeasureCode}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Saldo do sistema na data (prévia)">
            <f:fields>
              <ObjectNumber
                number="{
                  path: 'wr>/preview/systemBalance',
                  type: 'sap.ui.model.type.Float',
                  formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
                }"
                unit="{UnitOfMeasureCode}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Diferença (prévia)" visible="{ui>/editable}">
            <f:fields>
              <ObjectNumber
                state="{ path: 'wr>/preview/difference', formatter: 'formatter.stateWarehouseReconciliationDirection' }"
                number="{
                  path: 'wr>/preview/difference',
                  type: 'sap.ui.model.type.Float',
                  formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
                }"
                unit="{ path: 'wr>/preview/difference', formatter: 'formatter.formatWarehouseReconciliationDirection' }"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Saldo do sistema (snapshot)" visible="{= !${ui>/editable} }">
            <f:fields>
              <ObjectNumber
                number="{
                  path: 'SystemBalance',
                  type: 'sap.ui.model.type.Float',
                  formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
                }"
                unit="{UnitOfMeasureCode}"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Diferença (snapshot)" visible="{= !${ui>/editable} }">
            <f:fields>
              <ObjectNumber
                state="{ path: 'Difference', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationDirection' }"
                number="{
                  path: 'Difference',
                  type: 'sap.ui.model.type.Float',
                  formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }
                }"
                unit="{ path: 'Difference', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationDirection' }"/>
            </f:fields>
          </f:FormElement>
          <f:FormElement label="Observações">
            <f:fields>
              <TextArea value="{Comments}" editable="{ui>/editable}" rows="3" maxLength="500"/>
            </f:fields>
          </f:FormElement>
        </f:formElements>
      </f:FormContainer>
    </f:formContainers>
  </f:Form>
</core:FragmentDefinition>
```

- [ ] **Step 3: Create the add and edit views.** `view/warehouseReconciliations/Add.view.xml`. `Edit.view.xml` is identical except that
  `controllerName` ends in `.Edit` and both titles read `Editar Conferência de Saldo`.

```xml
<mvc:View
	controllerName="siagrob1.controller.warehouseReconciliations.Add"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:uxap="sap.uxap">

  <uxap:ObjectPageLayout showFooter="true" busy="{ui>/busy}" busyIndicatorDelay="0">
    <uxap:headerTitle>
      <uxap:ObjectPageDynamicHeaderTitle>
        <uxap:expandedHeading>
          <Title text="Nova Conferência de Saldo de Armazém"/>
        </uxap:expandedHeading>
        <uxap:snappedHeading>
          <Title text="Nova Conferência de Saldo de Armazém"/>
        </uxap:snappedHeading>
      </uxap:ObjectPageDynamicHeaderTitle>
    </uxap:headerTitle>
    <uxap:sections>
      <uxap:ObjectPageSection titleUppercase="false" title="Dados da Conferência">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.warehouseReconciliations.fragments.Form" type="XML" />
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

- [ ] **Step 4: Create the add and edit controllers.** `controller/warehouseReconciliations/Add.controller.ts`:

```ts
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Add extends BaseController {
  protected warnIfOpen = true;

  onInit(): void {
    this.initReconciliationModel();
    this.getRouter().getRoute("warehouseReconciliationsNew")
      .attachPatternMatched(() => void this.prepare());
  }

  private async prepare(): Promise<void> {
    (this.getModel("ui") as JSONModel).setProperty("/editable", true);
    this.resetModelChanges();
    this.resetPreview();

    this.setBusy(true);
    try {
      const branchInfo = await this.getBranchInfo();
      const systemSetup = this.getSystemSetup();
      const oBinding = (this.getModel() as ODataModel).bindList("/WarehouseReconciliations");

      // Toda propriedade editável precisa existir no create inicial, nem que seja null.
      const oContext = oBinding.create({
        Status: "Draft",
        BranchCode: branchInfo?.code ?? null,
        WarehouseCode: "",
        WarehouseName: null,
        ItemCode: "",
        ItemName: null,
        UnitOfMeasureCode: systemSetup.DefaultUoM ?? "",
        ReferenceDate: this.todayAtNoonIso(),
        ReportedBalance: 0,
        ReasonKey: null,
        Comments: null,
      }, false, false, false);

      this.getView().setBindingContext(oContext);
    } finally {
      this.setBusy(false);
    }
  }

  async onSave(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    if (!this.validateReconciliation(ctx)) return;

    const oModel = this.getModel() as ODataModel;
    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      MessageToast.show("Conferência gravada em rascunho.");
      this.navTo("warehouseReconciliationsDetail", { id: ctx.getProperty("Key") as string });
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("warehouseReconciliations");
  }
}
```

  `controller/warehouseReconciliations/Edit.controller.ts`:

```ts
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Edit extends BaseController {

  onInit(): void {
    this.initReconciliationModel();
    this.getRouter().getRoute("warehouseReconciliationsEdit")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", true);
    this.resetModelChanges();
    this.resetPreview();

    this.bindElement(`/WarehouseReconciliations(${id})`);
    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      const ctx = this.getView().getBindingContext() as Context;
      if (ctx?.getProperty("Status") !== "Draft") {
        MessageBox.warning("Somente conferências em rascunho podem ser alteradas.");
        this.navTo("warehouseReconciliationsDetail", { id });
        return;
      }
      void this.refreshPreview(ctx);
    });
  }

  async onSave(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    if (!this.validateReconciliation(ctx)) return;

    const oModel = this.getModel() as ODataModel;
    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      MessageToast.show("Conferência alterada.");
      this.navTo("warehouseReconciliationsDetail", { id: ctx.getProperty("Key") as string });
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    const ctx = this.getView().getBindingContext() as Context;
    this.resetModelChanges();
    this.navTo("warehouseReconciliationsDetail", { id: ctx?.getProperty("Key") as string });
  }
}
```

- [ ] **Step 5: Create the filterbar.** `view/warehouseReconciliations/fragments/Filterbar.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:fb="sap.ui.comp.filterbar"
>
<fb:FilterBar search=".onSearch" showClearOnFB="true" clear=".onClearFilters">
  <fb:filterGroupItems>
    <fb:FilterGroupItem name="status" label="Status" groupName="GroupStatus" visibleInFilterBar="true">
      <fb:control>
        <Select forceSelection="false" selectedKey="{ path: 'filter>/Status', type: 'sap.ui.model.type.String' }">
          <core:ListItem key="" text="Todos"/>
          <core:ListItem key="Draft" text="Rascunho"/>
          <core:ListItem key="InApproval" text="Em aprovação"/>
          <core:ListItem key="Approved" text="Aprovada"/>
          <core:ListItem key="Rejected" text="Rejeitada"/>
          <core:ListItem key="Cancelled" text="Cancelada"/>
        </Select>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="code" label="Número" groupName="GroupCode" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" value="{filter>/Code}"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="warehouse" label="Armazém" groupName="GroupWarehouse" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" showValueHelp="true" valueHelpRequest=".openWarehouseValueHelp" value="{filter>/WarehouseCode}"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="item" label="Produto" groupName="GroupItem" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" showValueHelp="true" valueHelpRequest=".openItemValueHelp" value="{filter>/ItemCode}"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="dateFrom" label="Referência de" groupName="GroupDateFrom" visibleInFilterBar="true">
      <fb:control>
        <DatePicker value="{ path: 'filter>/DateFrom', type: 'sap.ui.model.type.String' }" displayFormat="dd/MM/yyyy" valueFormat="yyyy-MM-dd"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="dateTo" label="Referência até" groupName="GroupDateTo" visibleInFilterBar="true">
      <fb:control>
        <DatePicker value="{ path: 'filter>/DateTo', type: 'sap.ui.model.type.String' }" displayFormat="dd/MM/yyyy" valueFormat="yyyy-MM-dd"/>
      </fb:control>
    </fb:FilterGroupItem>
  </fb:filterGroupItems>
</fb:FilterBar>
</core:FragmentDefinition>
```

- [ ] **Step 6: Create the list view.** `view/warehouseReconciliations/Main.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.warehouseReconciliations.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:t="sap.ui.table"
	xmlns:f="sap.f"
	core:require="{ formatter: 'siagrob1/model/formatter' }">
  <f:DynamicPage busyIndicatorDelay="0" busy="{ui>/busy}">
    <f:title>
      <f:DynamicPageTitle>
        <f:heading>
          <Title text="Conferências de Saldo de Armazém"/>
        </f:heading>
      </f:DynamicPageTitle>
    </f:title>
    <f:header>
      <f:DynamicPageHeader>
        <f:content>
          <core:Fragment fragmentName="siagrob1.view.warehouseReconciliations.fragments.Filterbar" type="XML" />
        </f:content>
      </f:DynamicPageHeader>
    </f:header>
    <f:content>
      <t:Table
        id="warehouseReconciliationsTable"
        busyIndicatorDelay="0"
        selectionMode="Single"
        selectionBehavior="Row"
        class="sapUiSizeCondensed"
        visibleRowCountMode="Auto"
        alternateRowColors="true"
        rows="{
          path: '/WarehouseReconciliations',
          sorter: [ { path: 'RowId', descending: true } ]
        }">
        <t:extension>
          <OverflowToolbar>
            <Title text="Conferências" />
            <ToolbarSpacer />
            <Button type="Transparent" text="Exportar Excel" icon="sap-icon://excel-attachment" press=".onExcel"/>
            <Button type="Transparent" text="Visualizar" press=".onDetail"/>
            <Button type="Emphasized" icon="sap-icon://add" text="Criar" press=".onCreate"/>
          </OverflowToolbar>
        </t:extension>
        <t:columns>
          <t:Column label="Filial" width="6rem">
            <t:template><Text text="{Branch/ShortName}" wrapping="false"/></t:template>
          </t:Column>
          <t:Column label="Status" hAlign="Center" width="9rem" sortProperty="Status">
            <t:template>
              <ObjectStatus inverted="true"
                state="{ path: 'Status', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationStatus' }"
                text="{ path: 'Status', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationStatus' }"/>
            </t:template>
          </t:Column>
          <t:Column label="Número" width="9rem" sortProperty="Code">
            <t:template><Text text="{Code}" wrapping="false"/></t:template>
          </t:Column>
          <t:Column label="Referência" width="8rem" sortProperty="ReferenceDate">
            <t:template><Text wrapping="false" text="{ path: 'ReferenceDate', targetType: 'any', formatter: 'formatter.formatDate' }"/></t:template>
          </t:Column>
          <t:Column label="Armazém" width="18rem" sortProperty="WarehouseName">
            <t:template><Text wrapping="false" text="{WarehouseCode} - {WarehouseName}"/></t:template>
          </t:Column>
          <t:Column label="Produto" width="16rem" sortProperty="ItemName">
            <t:template><Text wrapping="false" text="{ItemCode} - {ItemName}"/></t:template>
          </t:Column>
          <t:Column label="Saldo Informado" hAlign="End" width="10rem">
            <t:template>
              <ObjectNumber number="{ path: 'ReportedBalance', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }" unit="{UnitOfMeasureCode}"/>
            </t:template>
          </t:Column>
          <t:Column label="Saldo Sistema" hAlign="End" width="10rem">
            <t:template>
              <ObjectNumber number="{ path: 'SystemBalance', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }" unit="{UnitOfMeasureCode}"/>
            </t:template>
          </t:Column>
          <t:Column label="Diferença" hAlign="End" width="10rem" sortProperty="Difference">
            <t:template>
              <ObjectNumber
                state="{ path: 'Difference', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationDirection' }"
                number="{ path: 'Difference', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }"
                unit="{ path: 'Difference', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationDirection' }"/>
            </t:template>
          </t:Column>
          <t:Column label="Motivo" width="14rem">
            <t:template><Text text="{Reason/Description}" wrapping="false"/></t:template>
          </t:Column>
          <t:Column label="Criado por" width="10rem">
            <t:template><Text text="{CreatedBy}" wrapping="false"/></t:template>
          </t:Column>
        </t:columns>
      </t:Table>
    </f:content>
  </f:DynamicPage>
</mvc:View>
```

- [ ] **Step 7: Create the list controller.** `controller/warehouseReconciliations/Main.controller.ts`:

```ts
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Main extends BaseController {

  onInit(): void {
    this.createFilterModel();
    this.getRouter().getRoute("warehouseReconciliations")
      .attachPatternMatched(() => this.applyFilters());
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  private applyFilters(): void {
    const binding = this.byId("warehouseReconciliationsTable").getBinding("rows") as ODataListBinding;
    const data = ((this.getModel("filter") as JSONModel).getData() ?? {}) as Record<string, string>;
    const filters: string[] = [];
    const quote = (v: string) => v.replace(/'/g, "''");

    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (!value) return;

      switch (key) {
        // Enum: $filter estático com o nome do membro (Filter do UI5 sobre enum estoura).
        case "Status": filters.push(`Status eq '${quote(value)}'`); break;
        case "DateFrom": filters.push(`ReferenceDate ge ${value}T00:00:00Z`); break;
        case "DateTo": filters.push(`ReferenceDate lt ${value}T23:59:59Z`); break;
        default: filters.push(`contains(${key},'${quote(value)}')`);
      }
    });

    binding.changeParameters({ $filter: filters.length ? filters.join(" and ") : undefined });
    binding.refresh();
  }

  onCreate(): void {
    this.navTo("warehouseReconciliationsNew");
  }

  onDetail(): void {
    const table = this.byId("warehouseReconciliationsTable") as Table;
    const i = table.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }
    this.navTo("warehouseReconciliationsDetail", { id: table.getContextByIndex(i).getProperty("Key") as string });
  }

  private createColumnConfig(): Column[] {
    const number = (label: string, property: string): Column =>
      ({ label, property, type: EdmType.Number, scale: 3, delimiter: true });

    return [
      {
        label: "Status", property: "Status", type: EdmType.Enumeration,
        valueMap: { Draft: "Rascunho", InApproval: "Em aprovação", Approved: "Aprovada", Rejected: "Rejeitada", Cancelled: "Cancelada" },
      },
      { label: "Número", property: "Code", type: EdmType.String },
      { label: "Referência", property: "ReferenceDate", type: EdmType.Date },
      { label: "Cod.Armazém", property: "WarehouseCode", type: EdmType.String },
      { label: "Armazém", property: "WarehouseName", type: EdmType.String },
      { label: "Cod.Produto", property: "ItemCode", type: EdmType.String },
      { label: "Produto", property: "ItemName", type: EdmType.String },
      number("Saldo Informado", "ReportedBalance"),
      number("Saldo Sistema", "SystemBalance"),
      number("Diferença", "Difference"),
      { label: "Un.Med.", property: "UnitOfMeasureCode", type: EdmType.String },
      { label: "Motivo", property: "Reason/Description", type: EdmType.String },
      { label: "Criado por", property: "CreatedBy", type: EdmType.String },
      { label: "Aprovado por", property: "ApprovedBy", type: EdmType.String },
    ];
  }

  onExcel(): void {
    const table = this.byId("warehouseReconciliationsTable") as Table;
    const settings: SpreadsheetSettings = {
      dataSource: table.getBinding("rows") as ODataListBinding,
      fileName: "Conferências de Saldo de Armazém.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        context: { sheetName: "Conferências" },
      },
    };

    const sheet = new Spreadsheet(settings);
    void sheet.build().finally(() => sheet.destroy());
  }
}
```

- [ ] **Step 8: Run the gates.**

Run: `yarn ts-typecheck`, `yarn lint` and `yarn ui5lint`
Expected: no new errors or findings. Also parse the new XML files:

```powershell
Get-ChildItem webapp\view\warehouseReconciliations -Recurse -Filter *.xml | ForEach-Object { [xml](Get-Content $_.FullName -Raw) | Out-Null }
```

- [ ] **Step 9: Stage the new files.**

```bash
git add webapp/controller/warehouseReconciliations webapp/view/warehouseReconciliations
```

---

### Task 4: Detail screen, cancellation, attachments, and Perda/Sobra in the Romaneios list

**Files:**
- Modify: `webapp/controller/warehouseReconciliations/BaseController.ts`, adding attachment and decision-dialog helpers
- Create: `webapp/controller/warehouseReconciliations/Detail.controller.ts`
- Create: `webapp/view/warehouseReconciliations/Detail.view.xml`
- Create: `webapp/view/warehouseReconciliations/fragments/Attachments.fragment.xml`, `AttachmentUploadDialog.fragment.xml`, `DecisionDialog.fragment.xml`
- Modify: `webapp/controller/storageTransactions/Main.controller.ts` (~49-54), changing the default type scope

**Interfaces:**
- Consumes:
  - Task 3 `BaseController`
  - `sendJson` / `readErrorMessage` (Task 2)
  - `DialogHelper.createDialog(controller, name)`, whose fragment id is `viewId + "_" + name`
  - `DialogHelper.confirmDialog(title)`
  - ServerRoutes (Task 1)
- Produces, in `BaseController`:
  - `loadAttachments(key)`
  - `onOpenAttachmentUpload`, `onAttachmentFileChange`, `onConfirmAttachmentUpload`, `onCloseAttachmentUpload`
  - `onDownloadAttachment`, `onDeleteAttachment`
  - `openDecision(action, title, confirmText, textLabel, textRequired)`
  - `onConfirmDecision`, `onCloseDecision`
  - an overridable `executeDecision(action, text)`
  - `runAction(url, payload, successMessage): Promise<boolean>`
  - model flag `wr>/attachmentsReadonly`

- [ ] **Step 1: Add the attachment and decision helpers to the base controller.**
  - In `BaseController.ts`, add `attachmentsReadonly: false,` to the object passed to `new JSONModel({...})` in `initReconciliationModel()`.
  - Add these imports:

```ts
import Dialog from "sap/m/Dialog";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
```

  - Add these members inside the class:

```ts
  private _uploadDialog: Dialog;
  private _decisionDialog: Dialog;
  private _file: File;

  private static readonly UPLOAD_DIALOG = "siagrob1.view.warehouseReconciliations.fragments.AttachmentUploadDialog";
  private static readonly DECISION_DIALOG = "siagrob1.view.warehouseReconciliations.fragments.DecisionDialog";

  protected currentKey(): string {
    return (this.getView().getBindingContext() as Context)?.getProperty("Key") as string;
  }

  /** POST numa action; mostra a mensagem de negócio do servidor quando recusa. */
  protected async runAction(url: string, payload: object, successMessage: string): Promise<boolean> {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", url, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return false;
      }
      MessageToast.show(successMessage);
      return true;
    } finally {
      this.setBusy(false);
    }
  }

  protected async loadAttachments(key: string): Promise<void> {
    let model = this.getModel("attachments") as JSONModel;
    if (!model) {
      model = new JSONModel([]);
      this.getView().setModel(model, "attachments");
    }

    const result = await sendJson("GET", `${this.api.warehouseReconciliationsAttachmentsList}(ReconciliationKey=${key})`);
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    // Function sem envelope devolve o array cru; com envelope, { value: [...] }. Chaves em qualquer caixa.
    const data = result.data;
    const rows = (Array.isArray(data) ? data : ((data as { value?: unknown[] })?.value ?? [])) as Record<string, unknown>[];
    model.setData(rows.map((r) => ({
      Key: r.Key ?? r.key,
      Description: r.Description ?? r.description,
      FileName: r.FileName ?? r.fileName,
      CreatedBy: r.CreatedBy ?? r.createdBy,
      CreatedAt: r.CreatedAt ?? r.createdAt,
    })));
  }

  async onOpenAttachmentUpload(): Promise<void> {
    this._uploadDialog ??= await DialogHelper.createDialog(this, BaseController.UPLOAD_DIALOG);
    this.wr().setProperty("/attachment/description", "");
    this._file = undefined;
    (Fragment.byId(`${this.getView().getId()}_${BaseController.UPLOAD_DIALOG}`, "attachmentFileUploader") as FileUploader)?.clear();
    this._uploadDialog.open();
  }

  onAttachmentFileChange(ev: FileUploader$ChangeEvent): void {
    const files = ev.getParameter("files") as unknown as File[];
    this._file = files?.length ? files[0] : undefined;
  }

  onCloseAttachmentUpload(): void {
    this._uploadDialog?.close();
  }

  async onConfirmAttachmentUpload(): Promise<void> {
    const description = String(this.wr().getProperty("/attachment/description") ?? "").trim();
    if (!description || !this._file) {
      MessageBox.warning("Informe a descrição e selecione o arquivo.");
      return;
    }

    const key = this.currentKey();
    const file = this._file;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        resolve(text.includes(",") ? text.split(",")[1] : text);
      };
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsDataURL(file);
    });

    const ok = await this.runAction(this.api.warehouseReconciliationsAttachmentUpload, {
      ReconciliationKey: key,
      Description: description,
      FileName: file.name,
      ContentType: file.type || "application/octet-stream",
      File: base64,
    }, "Anexo enviado.");

    if (ok) {
      this._uploadDialog.close();
      await this.loadAttachments(key);
    }
  }

  private selectedAttachment(): Record<string, string> | null {
    const table = this.byId("warehouseReconciliationAttachmentsTable") as Table;
    const i = table?.getSelectedIndex() ?? -1;
    if (i < 0) {
      MessageBox.warning("Selecione um anexo.");
      return null;
    }
    return table.getContextByIndex(i).getObject() as Record<string, string>;
  }

  onDownloadAttachment(): void {
    const attachment = this.selectedAttachment();
    if (!attachment) return;

    fetch(`${this.api.warehouseReconciliationsAttachmentsDownload}(Key=${attachment.Key})`)
      .then((response) => {
        if (!response.ok) throw new Error("Erro ao baixar o anexo.");
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.FileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => MessageToast.show("Erro ao baixar o anexo."));
  }

  async onDeleteAttachment(): Promise<void> {
    const attachment = this.selectedAttachment();
    if (!attachment) return;
    if (!(await DialogHelper.confirmDialog("Remover o anexo selecionado ?"))) return;

    const result = await sendJson("DELETE", `/odata/WarehouseReconciliationAttachments(${attachment.Key})`);
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }
    await this.loadAttachments(this.currentKey());
  }

  protected async openDecision(
    action: string, title: string, confirmText: string, textLabel: string, textRequired: boolean
  ): Promise<void> {
    this._decisionDialog ??= await DialogHelper.createDialog(this, BaseController.DECISION_DIALOG);
    this.wr().setProperty("/dialog", { action, title, confirmText, textLabel, textRequired, text: "" });
    this._decisionDialog.open();
  }

  onCloseDecision(): void {
    this._decisionDialog?.close();
  }

  async onConfirmDecision(): Promise<void> {
    const dialog = this.wr().getProperty("/dialog") as { action: string; text: string; textLabel: string; textRequired: boolean };
    const text = String(dialog.text ?? "").trim();

    if (dialog.textRequired && !text) {
      MessageBox.warning(`Informe: ${dialog.textLabel}.`);
      return;
    }

    this._decisionDialog.close();
    await this.executeDecision(dialog.action, text || null);
  }

  /** Sobrescrito pelas telas que abrem o diálogo de decisão. */
  protected executeDecision(action: string, text: string | null): Promise<void> {
    return Promise.reject(new Error(`Ação não suportada: ${action} (${text ?? ""})`));
  }
```

- [ ] **Step 2: Create the fragments.** `view/warehouseReconciliations/fragments/Attachments.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:t="sap.ui.table"
    xmlns:core="sap.ui.core"
>
  <t:Table
    id="warehouseReconciliationAttachmentsTable"
    class="sapUiSizeCondensed"
    alternateRowColors="true"
    selectionBehavior="Row"
    selectionMode="Single"
    visibleRowCount="5"
    rows="{attachments>/}">
    <t:extension>
      <OverflowToolbar>
        <Title text="Anexos (extrato do armazém)"/>
        <ToolbarSpacer/>
        <Button visible="{= !${wr>/attachmentsReadonly} }" text="Anexar" type="Transparent" icon="sap-icon://attachment" press=".onOpenAttachmentUpload"/>
        <Button text="Download" type="Transparent" icon="sap-icon://download" press=".onDownloadAttachment"/>
        <Button visible="{= !${wr>/attachmentsReadonly} }" text="Remover" type="Transparent" icon="sap-icon://delete" press=".onDeleteAttachment"/>
      </OverflowToolbar>
    </t:extension>
    <t:columns>
      <t:Column label="Descrição">
        <t:template><Text text="{attachments>Description}" wrapping="false"/></t:template>
      </t:Column>
      <t:Column label="Arquivo">
        <t:template><Text text="{attachments>FileName}" wrapping="false"/></t:template>
      </t:Column>
      <t:Column label="Enviado por">
        <t:template><Text text="{attachments>CreatedBy}" wrapping="false"/></t:template>
      </t:Column>
    </t:columns>
  </t:Table>
</core:FragmentDefinition>
```

  `view/warehouseReconciliations/fragments/AttachmentUploadDialog.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:u="sap.ui.unified"
>
  <Dialog title="Anexar arquivo" contentWidth="30rem">
    <content>
      <VBox class="sapUiSmallMargin">
        <Label text="Descrição" required="true"/>
        <Input value="{wr>/attachment/description}" maxLength="100"/>
        <Label text="Arquivo" required="true" class="sapUiSmallMarginTop"/>
        <u:FileUploader id="attachmentFileUploader" width="100%" change=".onAttachmentFileChange"/>
      </VBox>
    </content>
    <footer>
      <OverflowToolbar>
        <ToolbarSpacer/>
        <Button text="Enviar" type="Emphasized" press=".onConfirmAttachmentUpload"/>
        <Button text="Fechar" press=".onCloseAttachmentUpload"/>
      </OverflowToolbar>
    </footer>
  </Dialog>
</core:FragmentDefinition>
```

  `view/warehouseReconciliations/fragments/DecisionDialog.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
>
  <Dialog title="{wr>/dialog/title}" contentWidth="30rem">
    <content>
      <VBox class="sapUiSmallMargin">
        <Label text="{wr>/dialog/textLabel}" required="{wr>/dialog/textRequired}"/>
        <TextArea value="{wr>/dialog/text}" rows="5" width="100%" maxLength="500"/>
      </VBox>
    </content>
    <footer>
      <OverflowToolbar>
        <ToolbarSpacer/>
        <Button text="{wr>/dialog/confirmText}" type="Emphasized" press=".onConfirmDecision"/>
        <Button text="Fechar" press=".onCloseDecision"/>
      </OverflowToolbar>
    </footer>
  </Dialog>
</core:FragmentDefinition>
```

- [ ] **Step 3: Create the detail view.** `view/warehouseReconciliations/Detail.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.warehouseReconciliations.Detail"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:f="sap.ui.layout.form"
	xmlns:uxap="sap.uxap"
	core:require="{ formatter: 'siagrob1/model/formatter' }">

  <uxap:ObjectPageLayout showFooter="false" toggleHeaderOnTitleClick="true" busy="{ui>/busy}" busyIndicatorDelay="0">
    <uxap:headerTitle>
      <uxap:ObjectPageDynamicHeaderTitle>
        <uxap:expandedHeading>
          <Title text="Conferência de Saldo de Armazém"/>
        </uxap:expandedHeading>
        <uxap:snappedHeading>
          <Title text="Conferência {Code}"/>
        </uxap:snappedHeading>
        <uxap:actions>
          <Button text="Voltar para a lista" type="Transparent" press=".onBackToList"/>
          <Button text="Editar" type="Emphasized" press=".onEdit"
            visible="{= ${path: 'Status', targetType: 'any'} === 'Draft' }"/>
          <Button text="Enviar para aprovação" type="Accept" press=".onSendApproval"
            visible="{= ${path: 'Status', targetType: 'any'} === 'Draft' }"/>
          <Button text="Retirar da aprovação" type="Transparent" press=".onWithdrawApproval"
            visible="{= ${path: 'Status', targetType: 'any'} === 'InApproval' }"/>
          <Button text="Cancelar" type="Reject" press=".onCancelReconciliation"
            visible="{= ${path: 'Status', targetType: 'any'} === 'Draft' || ${path: 'Status', targetType: 'any'} === 'Approved' }"/>
        </uxap:actions>
      </uxap:ObjectPageDynamicHeaderTitle>
    </uxap:headerTitle>

    <uxap:headerContent>
      <HBox>
        <ObjectIdentifier title="{Code}" text="{WarehouseName} · {ItemName}" class="sapUiMediumMarginEnd"/>
        <ObjectStatus inverted="true" class="sapUiMediumMarginEnd"
          state="{ path: 'Status', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationStatus' }"
          text="{ path: 'Status', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationStatus' }"/>
        <ObjectStatus
          state="{ path: 'Difference', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationDirection' }"
          text="{ path: 'Difference', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationDirection' }"/>
      </HBox>
    </uxap:headerContent>

    <uxap:sections>
      <uxap:ObjectPageSection titleUppercase="false" title="Dados da Conferência">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.warehouseReconciliations.fragments.Form" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>

      <uxap:ObjectPageSection titleUppercase="false" title="Aprovação">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <f:Form editable="false">
              <f:layout>
                <f:ColumnLayout columnsM="2" columnsL="3" columnsXL="3"/>
              </f:layout>
              <f:formContainers>
                <f:FormContainer>
                  <f:formElements>
                    <f:FormElement label="Enviado por"><f:fields><Text text="{SentBy}"/></f:fields></f:FormElement>
                    <f:FormElement label="Aprovado por"><f:fields><Text text="{ApprovedBy}"/></f:fields></f:FormElement>
                    <f:FormElement label="Comentários da aprovação"><f:fields><Text text="{ApprovalComments}"/></f:fields></f:FormElement>
                    <f:FormElement label="Cancelado/Rejeitado por"><f:fields><Text text="{CanceledBy}"/></f:fields></f:FormElement>
                    <f:FormElement label="Motivo do cancelamento"><f:fields><Text text="{CancellationReason}"/></f:fields></f:FormElement>
                  </f:formElements>
                </f:FormContainer>
              </f:formContainers>
            </f:Form>
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>

      <uxap:ObjectPageSection titleUppercase="false" title="Anexos">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.warehouseReconciliations.fragments.Attachments" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
    </uxap:sections>
  </uxap:ObjectPageLayout>
</mvc:View>
```

- [ ] **Step 4: Create the detail controller.** `controller/warehouseReconciliations/Detail.controller.ts`:

```ts
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Detail extends BaseController {

  onInit(): void {
    this.initReconciliationModel();
    this.getRouter().getRoute("warehouseReconciliationsDetail")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);
    this.resetPreview();

    this.bindElement(`/WarehouseReconciliations(${id})`);
    this.afterDataReceived();
    void this.loadAttachments(id);
  }

  /** A prévia depende de armazém, produto e data, que só existem depois da leitura. */
  private afterDataReceived(): void {
    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      void this.refreshPreview(this.getView().getBindingContext() as Context);
    });
  }

  private reload(): void {
    this.afterDataReceived();
    this.getView().getElementBinding()?.refresh();
  }

  onBackToList(): void {
    this.navTo("warehouseReconciliations");
  }

  onEdit(): void {
    this.navTo("warehouseReconciliationsEdit", { id: this.currentKey() });
  }

  async onSendApproval(): Promise<void> {
    if (!(await DialogHelper.confirmDialog("Enviar a conferência para aprovação ?"))) return;
    if (await this.runAction(this.api.warehouseReconciliationsSendApproval, { Key: this.currentKey() },
      "Conferência enviada para aprovação.")) {
      this.reload();
    }
  }

  async onWithdrawApproval(): Promise<void> {
    if (!(await DialogHelper.confirmDialog("Retirar a conferência da aprovação ?"))) return;
    if (await this.runAction(this.api.warehouseReconciliationsWithdrawApproval, { Key: this.currentKey() },
      "Conferência retirada da aprovação.")) {
      this.reload();
    }
  }

  onCancelReconciliation(): void {
    void this.openDecision("Cancel", "Cancelar a conferência ?", "Cancelar conferência", "Motivo do cancelamento", true);
  }

  protected async executeDecision(action: string, text: string | null): Promise<void> {
    if (action !== "Cancel") return super.executeDecision(action, text);

    if (await this.runAction(this.api.warehouseReconciliationsCancel, { Key: this.currentKey(), Reason: text },
      "Conferência cancelada.")) {
      this.reload();
    }
  }
}
```

  Note: the detail view shows `Reason/Description` in read-only mode. `autoExpandSelect` builds the
  `$expand` from the binding, so no explicit `$expand` is needed. If the field is empty in the
  browser, pass `{ $expand: "Reason($select=Description)" }` to `bindElement`.

- [ ] **Step 5: Show Perda/Sobra in the Romaneios list.** In `controller/storageTransactions/Main.controller.ts`,
  replace the default scope and extend the comment above it:

```ts
    // 3. WarehouseLoss/WarehouseGain (Conferência de Saldo de Armazém, GAC-1164) entram no escopo
    //    para CONSULTA. Cancelar/estornar por esta tela é recusado pelo backend (origem 13).
    filters.push(
      filterData.TransactionType
        ? `TransactionType eq '${filterData.TransactionType}'`
        : `(TransactionType eq 'Receipt' or TransactionType eq 'Shipment' ` +
          `or TransactionType eq 'TechnicalLoss' or TransactionType eq 'SalesShipmentReturn' ` +
          `or TransactionType eq 'WarehouseLoss' or TransactionType eq 'WarehouseGain')`
    );
```

- [ ] **Step 6: Run the gates.**

Run: `yarn ts-typecheck`, `yarn lint` and `yarn ui5lint`, then run the XML parse loop from Task 3 Step 8 again.
Expected: no new errors or findings.

- [ ] **Step 7: Stage the new files.**

```bash
git add webapp/controller/warehouseReconciliations webapp/view/warehouseReconciliations
```

---

### Task 5: Approval screens

**Files:**
- Create: `webapp/controller/warehouseReconciliations/approval/Main.controller.ts`, `Detail.controller.ts`
- Create: `webapp/view/warehouseReconciliations/approval/Main.view.xml`, `Detail.view.xml`

**Interfaces:**
- Consumes: routes `warehouseReconciliationsApproval` and `warehouseReconciliationsApprovalDetail`; `BaseController` from Tasks 3/4 (`initReconciliationModel`, `refreshPreview`, `loadAttachments`, `openDecision`, `executeDecision`, `runAction`, `currentKey`); and the fragments `Form`, `Attachments` and `DecisionDialog`.
- Produces: the approval list with tabs Em aprovação/Aprovadas/Rejeitadas, and a detail screen with Aprovar (optional comments) and Rejeitar (required reason).

- [ ] **Step 1: Create the approval list view.** `view/warehouseReconciliations/approval/Main.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.warehouseReconciliations.approval.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:f="sap.f"
	core:require="{ formatter: 'siagrob1/model/formatter' }">
  <f:DynamicPage busyIndicatorDelay="0" busy="{ui>/busy}">
    <f:title>
      <f:DynamicPageTitle>
        <f:heading>
          <Title text="Aprovação de Conferências de Saldo"/>
        </f:heading>
      </f:DynamicPageTitle>
    </f:title>
    <f:content>
      <IconTabBar id="warehouseReconciliationsApprovalIconTabBar" expanded="true" expandable="false" select=".onFilterSelect">
        <items>
          <IconTabFilter icon="sap-icon://inspection" iconColor="Critical" text="Em aprovação" key="InApproval"
            count="{ path: '/WarehouseReconciliations/$count', parameters: { $filter: 'Status eq \'InApproval\'' } }"/>
          <IconTabFilter icon="sap-icon://accounting-document-verification" iconColor="Positive" text="Aprovadas" key="Approved"
            count="{ path: '/WarehouseReconciliations/$count', parameters: { $filter: 'Status eq \'Approved\'' } }"/>
          <IconTabFilter icon="sap-icon://document-text" iconColor="Negative" text="Rejeitadas" key="Rejected"
            count="{ path: '/WarehouseReconciliations/$count', parameters: { $filter: 'Status eq \'Rejected\'' } }"/>
        </items>
        <content>
          <Table
            id="warehouseReconciliationsApprovalTable"
            growing="true"
            growingThreshold="20"
            growingScrollToLoad="true"
            alternateRowColors="true"
            busyIndicatorDelay="0"
            items="{
              path: '/WarehouseReconciliations',
              parameters: { $filter: 'Status eq \'InApproval\'', $count: true },
              sorter: { path: 'SentAt', descending: true }
            }">
            <headerToolbar>
              <OverflowToolbar>
                <Title text="Conferências"/>
                <ToolbarSpacer/>
                <SearchField id="warehouseReconciliationsApprovalSearchField" width="30%" placeholder="Pesquisar..." search=".onSearch"/>
                <Button tooltip="Atualizar" icon="sap-icon://refresh" press=".onRefresh"/>
              </OverflowToolbar>
            </headerToolbar>
            <columns>
              <Column><Text text="Filial"/></Column>
              <Column><Text text="Status"/></Column>
              <Column width="25%"><Text text="Conferência"/></Column>
              <Column><Text text="Referência"/></Column>
              <Column hAlign="End"><Text text="Diferença"/></Column>
              <Column><Text text="Motivo"/></Column>
              <Column><Text text="Enviado por"/></Column>
            </columns>
            <items>
              <ColumnListItem type="Navigation" press=".onNavigateToDetail">
                <cells>
                  <Text text="{Branch/ShortName}"/>
                  <ObjectStatus inverted="true"
                    state="{ path: 'Status', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationStatus' }"
                    text="{ path: 'Status', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationStatus' }"/>
                  <ObjectIdentifier title="{WarehouseName} - {ItemName}" text="{Code}"/>
                  <Text text="{ path: 'ReferenceDate', targetType: 'any', formatter: 'formatter.formatDate' }"/>
                  <ObjectNumber
                    state="{ path: 'Difference', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationDirection' }"
                    number="{ path: 'Difference', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }"
                    unit="{UnitOfMeasureCode}"/>
                  <Text text="{Reason/Description}"/>
                  <Text text="{SentBy}"/>
                </cells>
              </ColumnListItem>
            </items>
          </Table>
        </content>
      </IconTabBar>
    </f:content>
  </f:DynamicPage>
</mvc:View>
```

- [ ] **Step 2: Create the approval list controller.** `controller/warehouseReconciliations/approval/Main.controller.ts`:

```ts
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import SearchField, { SearchField$SearchEvent } from "sap/m/SearchField";
import IconTabBar from "sap/m/IconTabBar";
import { ListBase$ItemPressEvent } from "sap/m/ListBase";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations.approval
 */
export default class Main extends CommonController {

  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationsApproval")
      .attachPatternMatched(() => this.onFilterSelect());
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev?.getParameter("query")?.trim().replace(/'/g, "''");
    const status = (this.byId("warehouseReconciliationsApprovalIconTabBar") as IconTabBar).getSelectedKey() || "InApproval";
    let filter = `Status eq '${status}'`;

    if (query) {
      filter += ` and (${[
        `contains(Code,'${query}')`,
        `contains(WarehouseCode,'${query}')`,
        `contains(WarehouseName,'${query}')`,
        `contains(ItemCode,'${query}')`,
        `contains(ItemName,'${query}')`,
      ].join(" or ")})`;
    }

    (this.byId("warehouseReconciliationsApprovalTable").getBinding("items") as ODataListBinding)
      .changeParameters({ $filter: filter });
  }

  onFilterSelect(): void {
    const searchField = this.byId("warehouseReconciliationsApprovalSearchField") as SearchField;
    searchField.fireSearch({ query: searchField.getValue() });
  }

  onRefresh(): void {
    (this.byId("warehouseReconciliationsApprovalTable").getBinding("items") as ODataListBinding)?.refresh();
  }

  onNavigateToDetail(ev: ListBase$ItemPressEvent): void {
    const id = (ev.getSource()?.getBindingContext() as Context)?.getProperty("Key") as string;
    if (id) {
      this.navTo("warehouseReconciliationsApprovalDetail", { id });
    }
  }
}
```

- [ ] **Step 3: Create the approval detail view.** `view/warehouseReconciliations/approval/Detail.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.warehouseReconciliations.approval.Detail"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:uxap="sap.uxap"
	core:require="{ formatter: 'siagrob1/model/formatter' }">

  <uxap:ObjectPageLayout showFooter="false" busy="{ui>/busy}" busyIndicatorDelay="0">
    <uxap:headerTitle>
      <uxap:ObjectPageDynamicHeaderTitle>
        <uxap:expandedHeading>
          <Title text="Aprovar Conferência de Saldo"/>
        </uxap:expandedHeading>
        <uxap:snappedHeading>
          <Title text="Conferência {Code}"/>
        </uxap:snappedHeading>
        <uxap:actions>
          <Button text="Voltar para a lista" type="Transparent" press=".onBackToList"/>
          <Button text="Aprovar" type="Accept" press=".onApprove"
            visible="{= ${path: 'Status', targetType: 'any'} === 'InApproval' }"/>
          <Button text="Rejeitar" type="Reject" press=".onReject"
            visible="{= ${path: 'Status', targetType: 'any'} === 'InApproval' }"/>
        </uxap:actions>
      </uxap:ObjectPageDynamicHeaderTitle>
    </uxap:headerTitle>
    <uxap:headerContent>
      <HBox>
        <ObjectIdentifier title="{Code}" text="Enviado por {SentBy}" class="sapUiMediumMarginEnd"/>
        <ObjectStatus inverted="true" class="sapUiMediumMarginEnd"
          state="{ path: 'Status', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationStatus' }"
          text="{ path: 'Status', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationStatus' }"/>
        <ObjectStatus
          state="{ path: 'Difference', targetType: 'any', formatter: 'formatter.stateWarehouseReconciliationDirection' }"
          text="{ path: 'Difference', targetType: 'any', formatter: 'formatter.formatWarehouseReconciliationDirection' }"/>
      </HBox>
    </uxap:headerContent>
    <uxap:sections>
      <uxap:ObjectPageSection titleUppercase="false" title="Dados da Conferência">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.warehouseReconciliations.fragments.Form" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
      <uxap:ObjectPageSection titleUppercase="false" title="Anexos">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.warehouseReconciliations.fragments.Attachments" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
    </uxap:sections>
  </uxap:ObjectPageLayout>
</mvc:View>
```

- [ ] **Step 4: Create the approval detail controller.** `controller/warehouseReconciliations/approval/Detail.controller.ts`:

```ts
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import { BaseController } from "../BaseController";

/**
 * Tela do aprovador. O snapshot mostrado é o do envio; a aprovação recalcula no servidor, e a
 * prévia ao lado mostra o saldo de hoje até a data de referência para o aprovador comparar.
 *
 * @namespace siagrob1.controller.warehouseReconciliations.approval
 */
export default class Detail extends BaseController {

  onInit(): void {
    this.initReconciliationModel().setProperty("/attachmentsReadonly", true);
    this.getRouter().getRoute("warehouseReconciliationsApprovalDetail")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);
    this.resetPreview();

    this.bindElement(`/WarehouseReconciliations(${id})`);
    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      void this.refreshPreview(this.getView().getBindingContext() as Context);
    });
    void this.loadAttachments(id);
  }

  onBackToList(): void {
    this.navTo("warehouseReconciliationsApproval");
  }

  onApprove(): void {
    void this.openDecision("Approval", "Aprovar a conferência ?", "Aprovar", "Comentários (opcional)", false);
  }

  onReject(): void {
    void this.openDecision("Reject", "Rejeitar a conferência ?", "Rejeitar", "Motivo da rejeição", true);
  }

  protected async executeDecision(action: string, text: string | null): Promise<void> {
    const url = action === "Approval"
      ? this.api.warehouseReconciliationsApproval
      : action === "Reject" ? this.api.warehouseReconciliationsReject : null;

    if (!url) return super.executeDecision(action, text);

    const ok = await this.runAction(url, { Key: this.currentKey(), Comments: text },
      action === "Approval" ? "Conferência aprovada. Romaneio de perda/sobra gerado." : "Conferência rejeitada.");

    if (ok) {
      this.navTo("warehouseReconciliationsApproval");
    }
  }
}
```

- [ ] **Step 5: Run the gates.**

Run: `yarn ts-typecheck`, `yarn lint` and `yarn ui5lint`, then run the XML parse loop again.
Expected: no new errors or findings.

- [ ] **Step 6: Stage the new files.**

```bash
git add webapp/controller/warehouseReconciliations webapp/view/warehouseReconciliations
```

---

### Task 6: End-to-end verification in the browser (user path)

**Prerequisite:** the backend plan is complete and its migrations are applied on `IDX_SIAGRO_DEV` (localhost).

- [ ] **Step 1: Start the stack.**

```powershell
dotnet run --project ..\siagro-b1-backend\SiagroB1.Web --launch-profile yktb      # background
dotnet run --project ..\siagro-b1-backend\SiagroB1.Gateway --launch-profile yktb  # background
yarn start:dev                                                                    # background
```

  Open `http://localhost:8080` and ask the user to log in (`admin`/`1234`). Do not type the
  password into the form yourself.

- [ ] **Step 2: Confirm the payload shapes.** Run this in the browser console first:

```js
await fetch("/odata/WarehouseReconciliationsGetBalancePreview(WarehouseCode='<ARM>',ItemCode='<ITEM>',ReferenceDate='2026-09-14')").then(r => r.json())
```

  Expected: an object with systemBalance/isOwnWarehouse in either casing. The normalizer covers both.

- [ ] **Step 3: Run the user path from the home screen.**
  1. **Menus:** the Armazenagem menu shows "Conferência de Saldo de Armazém", "Aprovação de Conferências de Saldo" and "Motivos de Conferência de Saldo".
  2. **Reason lifecycle:** create reason `TESTE`. Deactivate it in Editar: it disappears from the reconciliation form's Motivo select. Delete it; an unused reason is deleted.
  3. **Own warehouse:** choose an own warehouse in the form. Expected: warning "só pode ser feita para armazém de terceiros", and the field is cleared.
  4. **Loss draft:** choose a third-party warehouse, a product with stock and today's date. "Saldo do sistema na data" is filled in. Enter a lower reported balance: Diferença is negative, labelled "Perda". Save: the detail screen opens in Rascunho.
  5. **Duplicate open reconciliation:** create a second one for the same warehouse and product. Expected: an early warning, and saving is refused with the business message, not a generic error.
  6. **Attachment:** attach a PDF in the detail screen, download it, then remove it.
  7. **Send:** click "Enviar para aprovação". Expected: status Em aprovação, and the "Retirar da aprovação" button appears.
  8. **Approve:** in the approval screen, the item is in "Em aprovação". Open it, click Aprovar, and add a comment. Expected: success toast and the item moves to "Aprovadas".
  9. **Generated romaneio:** in Romaneios de Movimentação, a "Perda Armazém" row appears, Confirmado, dated on the reference date, for the absolute quantity. Trying to cancel or reverse it there shows the backend refusal.
  10. **Balance after approval:** a new reconciliation for the same pair shows a preview balance lower by exactly that quantity.
  11. **Date guard:** a reconciliation dated before the approved one is refused with the "anterior à última aprovada" message.
  12. **Gain and cancel order:** create, send and approve a Sobra. Cancelling the older Perda is refused with "Somente a última…". Cancelling the Sobra with a reason works, and its romaneio becomes Cancelado.
  13. **Draft cancel and reject:** a Draft cancels. Another reconciliation, sent and then rejected with a reason, ends as Rejeitada.
  14. **Excel:** the reconciliations list exports to Excel.
  15. **Console and network:** DevTools shows no 500 and no binding errors (`FormatException`, `Illegal ... DateTimeOffset`).

- [ ] **Step 4: Stop the stack.** Kill by port and check again at the end:

```powershell
50000,5246,8080 | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } }
```

- [ ] **Step 5: Final state.** Run `git -C siagro-b1-frontend status --short`. Expected: every new file shows `A`, and nothing is committed.
