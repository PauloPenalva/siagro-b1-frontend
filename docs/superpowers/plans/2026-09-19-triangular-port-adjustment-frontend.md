# Troca nota — romaneios de quebra/sobra de descarga — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the new discharge transactions (types 16/17) everywhere a user meets them:
- the "Entregas" table of the purchase contract;
- the storage-transaction type labels;
- a new read-only screen, "Ajustes de Descarga".

Then prove the whole flow in the browser.

**Architecture:** No new OData entity. The screen calls
`GET /odata/PurchaseDischargesList(DateFrom='…',DateTo='…')` through `sendJson` into a JSONModel and
filters on the client with `sap.ui.model.Filter`. The Entregas table already reads `Origin` from
`PurchaseContractsGetAllocationsByContract`, so the new origins are just entries in
`ALLOCATION_ORIGINS`.

**Tech Stack:** OpenUI5 + TypeScript (transpiled by ui5 middleware), `sap.ui.table.Table`,
`sap.ui.comp.filterbar.FilterBar`, QUnit.

**Spec:** `../siagro-b1-backend/docs/superpowers/specs/2026-09-19-triangular-port-adjustment-design.md`
(§4 Telas).

**Depends on:** the backend plan
`../siagro-b1-backend/docs/superpowers/plans/2026-09-19-triangular-port-adjustment-backend.md`, which
must be done first:
- `Origin` values `DischargeLoss`/`DischargeGain`;
- DTO fields `DischargeInvoiceNumber`/`DischargeLoadCode`;
- the `PurchaseDischargesList` function;
- the menu key `purchaseDischarges`.

## Global Constraints

- **User-facing text is pt-BR and hard-coded in the view/controller.** This app does not use i18n;
  `i18n.properties` is effectively empty.
- **Type labels:** "Quebra Descarga" (16, `PurchaseDischargeLoss`) and "Sobra Descarga" (17,
  `PurchaseDischargeGain`), the same wording as the backend report helper.
- **Transaction types reach the frontend as enum names** (`"PurchaseDischargeLoss"`), never numbers.
- **The list DTO is PascalCase** (`[JsonPropertyName]` in the backend), so the TS type is PascalCase.
- **`sap.ui.table` text columns need `wrapping="false"`**, or the text is cut
  (memory "sales-invoices-list-type-filter-and-column-widths").
- **FilterBar controls bind to the JSONModel `filter`**, never to a suspended OData binding
  (memory "filterbar-suspended-binding-icontabbar-crash").
- **XML comments must not contain `--`**, or the fragment silently fails to load
  (memory "xml-comment-double-hyphen-kills-fragment").
- **Git:** `git add` each new file right away. Commit only after the user's review, with a subject
  that mirrors the backend commit. **Never push.** Check the branch first.
- **Gates:**
  - `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint`;
  - unit tests through the QUnit page (see Task 1);
  - `yarn test` never passes because of the coverage gate (memory "frontend-yarn-test-coverage-gate"),
    so do not use it as the gate. Stop the dev server before running it, if at all.

## File map

| File | Responsibility |
|---|---|
| `webapp/helpers/AllocationOriginHelpers.ts` (modify) | Origins `DischargeLoss`/`DischargeGain` + tooltip |
| `webapp/view/purchaseContracts/fragments/PurchaseContractAllocations.fragment.xml` (modify) | Tooltip parts |
| `webapp/test/unit/helpers/AllocationOriginHelpers.qunit.ts` (modify) | Tests |
| `webapp/model/formatter.ts` (modify) | `formatStorageTransactionType` labels |
| `webapp/controller/{storageTransactions,storageInvoices,ownershipTransfers,purchaseOrders/allocation}/BaseController.ts` (modify) | Export valueMaps |
| `webapp/view/storageTransactions/fragments/Filterbar.fragment.xml` (modify) | Type filter items |
| `webapp/types/PurchaseDischarge.ts` (create) | Row type |
| `webapp/model/ServerRoutes.ts` (modify) | `purchaseDischargesList` |
| `webapp/view/purchaseDischarges/Main.view.xml` (create) | Screen |
| `webapp/view/purchaseDischarges/fragments/Filterbar.fragment.xml` (create) | Filters |
| `webapp/controller/purchaseDischarges/Main.controller.ts` (create) | Load + client filters + open contract |
| `webapp/manifest.json` (modify) | Route `purchaseDischarges` + target |

---

### Task 1: New origins in the Entregas table

**Files:**
- Modify: `webapp/helpers/AllocationOriginHelpers.ts`
- Modify: `webapp/view/purchaseContracts/fragments/PurchaseContractAllocations.fragment.xml` (Origem column tooltip, ~lines 72-75)
- Test: `webapp/test/unit/helpers/AllocationOriginHelpers.qunit.ts`

**Interfaces:**
- Produces:
  `allocationOriginTooltip(key: string, reconciliationCode: string, dischargeInvoiceNumber?: string, dischargeLoadCode?: string): string`.

- [ ] **Step 1: Update the tests first**

In `AllocationOriginHelpers.qunit.ts`, replace the last test ("a legenda lista…") and append the new
ones:

```ts
QUnit.test("a legenda lista cada origem uma vez, começando pela normal", function (assert) {
	const keys = ALLOCATION_ORIGINS.map((o) => o.key);
	assert.deepEqual(keys, ["Standard", "WarehouseLoss", "DischargeLoss", "DischargeGain"]);
	assert.strictEqual(ALLOCATION_ORIGINS[0].legend, "Normal");
});

QUnit.test("quebra de descarga (troca nota) é destacada em vermelho", function (assert) {
	assert.strictEqual(allocationOriginHighlight("DischargeLoss"), "Error");
	assert.strictEqual(allocationOriginState("DischargeLoss"), "Error");
	assert.strictEqual(allocationOriginText("DischargeLoss"), "Quebra de descarga");
	assert.ok(allocationOriginIcon("DischargeLoss").startsWith("sap-icon://"));
});

QUnit.test("sobra de descarga (troca nota) é destacada em verde", function (assert) {
	assert.strictEqual(allocationOriginHighlight("DischargeGain"), "Success");
	assert.strictEqual(allocationOriginText("DischargeGain"), "Sobra de descarga");
});

QUnit.test("tooltip da descarga cita a nota de venda e a carga", function (assert) {
	assert.strictEqual(
		allocationOriginTooltip("DischargeLoss", null, "000002376", "CG000009"),
		"Conferência da nota 000002376 (carga CG000009)");
	assert.strictEqual(allocationOriginTooltip("DischargeGain", null, "000002376", null), "Conferência da nota 000002376");
	assert.strictEqual(allocationOriginTooltip("DischargeLoss", null, null, null), "");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run `yarn start` (or `npx ui5 serve --port 8090` if port 8080 is taken by EfisCloud) and open
`http://localhost:8080/test/Test.qunit.html?testsuite=test-resources/siagrob1/testsuite.qunit&test=unit/unitTests`.
Filter on "AllocationOriginHelpers".

Expected: the 4 new or changed tests FAIL (unknown origin → "", and the keys list is too short).

- [ ] **Step 3: Implement**

In `AllocationOriginHelpers.ts`, first update the header comment to mention troca nota:
"…(GAC-1164) e os romaneios de quebra/sobra de descarga da troca nota (tipos 16/17)".

Then append to `ALLOCATION_ORIGINS`, after the `WarehouseLoss` entry:

```ts
  {
    key: "DischargeLoss",
    legend: "Quebra de descarga",
    text: "Quebra de descarga",
    highlight: "Error",
    state: "Error",
    icon: "sap-icon://trend-down",
  },
  {
    key: "DischargeGain",
    legend: "Sobra de descarga",
    text: "Sobra de descarga",
    highlight: "Success",
    state: "Success",
    icon: "sap-icon://trend-up",
  },
```

Replace `allocationOriginTooltip`:

```ts
export function allocationOriginTooltip(
  key: string,
  reconciliationCode: string,
  dischargeInvoiceNumber?: string,
  dischargeLoadCode?: string
): string {
  const origin = originOf(key).key;

  if (origin === "WarehouseLoss" && reconciliationCode) {
    return `Conferência de saldo de armazém ${reconciliationCode}`;
  }

  // Troca nota: o romaneio 16/17 nasce da Conferência de Entregas da nota de venda.
  if ((origin === "DischargeLoss" || origin === "DischargeGain") && dischargeInvoiceNumber) {
    return dischargeLoadCode
      ? `Conferência da nota ${dischargeInvoiceNumber} (carga ${dischargeLoadCode})`
      : `Conferência da nota ${dischargeInvoiceNumber}`;
  }

  return "";
}
```

In the fragment, extend the Origem tooltip `parts`:

```xml
            tooltip="{
              parts: ['allocationModel>Origin', 'allocationModel>WarehouseReconciliationCode',
                      'allocationModel>DischargeInvoiceNumber', 'allocationModel>DischargeLoadCode'],
              formatter: '.formatter.allocationOriginTooltip'
            }" />
```

- [ ] **Step 4: Run the tests to verify they pass**

Reload the QUnit page, filtered on "AllocationOriginHelpers". Expected: all PASS.

Then run `yarn ts-typecheck` and `yarn lint`. Expected: clean.

- [ ] **Step 5: Stage**

```bash
git add webapp/helpers/AllocationOriginHelpers.ts webapp/view/purchaseContracts/fragments/PurchaseContractAllocations.fragment.xml webapp/test/unit/helpers/AllocationOriginHelpers.qunit.ts
```

---

### Task 2: Type labels for 16/17

**Files:**
- Modify: `webapp/model/formatter.ts` (`formatStorageTransactionType`, ~line 545)
- Modify: the export `valueMap`s in:
  - `webapp/controller/storageTransactions/BaseController.ts` (~91)
  - `webapp/controller/storageInvoices/BaseController.ts` (~88)
  - `webapp/controller/ownershipTransfers/BaseController.ts` (~259)
  - `webapp/controller/purchaseOrders/allocation/BaseController.ts` (~49)
- Modify: `webapp/view/storageTransactions/fragments/Filterbar.fragment.xml` (~59)

- [ ] **Step 1: Add the labels**

In `formatStorageTransactionType`, after the `WarehouseGain` line:

```ts
      m.set("PurchaseDischargeLoss", "Quebra Descarga");
      m.set("PurchaseDischargeGain", "Sobra Descarga");
```

In each of the four `valueMap`s, after `"WarehouseGain": "Sobra Armazém",`:

```ts
            "PurchaseDischargeLoss": "Quebra Descarga",
            "PurchaseDischargeGain": "Sobra Descarga",
```

In `storageTransactions/fragments/Filterbar.fragment.xml`, after the `WarehouseGain` item:

```xml
              <core:ListItem key="PurchaseDischargeLoss" text="Quebra Descarga"/>
              <core:ListItem key="PurchaseDischargeGain" text="Sobra Descarga"/>
```

Before editing, confirm there is no other copy:
`grep -rn "\"WarehouseGain\"\|key=\"WarehouseGain\"" webapp`. Every hit must get the pair; list them in
the report.

- [ ] **Step 2: Gates and stage**

Run: `yarn ts-typecheck && yarn lint` — expected: clean.

```bash
git add webapp/model/formatter.ts webapp/controller/storageTransactions/BaseController.ts webapp/controller/storageInvoices/BaseController.ts webapp/controller/ownershipTransfers/BaseController.ts webapp/controller/purchaseOrders/allocation/BaseController.ts webapp/view/storageTransactions/fragments/Filterbar.fragment.xml
```

---

### Task 3: Screen "Ajustes de Descarga"

**Files:**
- Create: `webapp/types/PurchaseDischarge.ts`
- Modify: `webapp/model/ServerRoutes.ts`
- Create: `webapp/view/purchaseDischarges/Main.view.xml`
- Create: `webapp/view/purchaseDischarges/fragments/Filterbar.fragment.xml`
- Create: `webapp/controller/purchaseDischarges/Main.controller.ts`
- Modify: `webapp/manifest.json` (route next to `warehouseReconciliations` ~line 528, target next to ~line 1530)

**Interfaces:**
- Consumes: `GET /odata/PurchaseDischargesList(DateFrom='yyyy-MM-dd',DateTo='yyyy-MM-dd')`, which
  returns a `PurchaseDischarge[]` in PascalCase; menu key / route name `purchaseDischarges`.

- [ ] **Step 1: Row type and route constant**

`webapp/types/PurchaseDischarge.ts`:

```ts
/** Linha de /odata/PurchaseDischargesList (PascalCase explícito no DTO do backend). */
export type PurchaseDischarge = {
  Key: string;
  Code: string;
  TransactionType: "PurchaseDischargeLoss" | "PurchaseDischargeGain";
  Status: string;
  TransactionDate: string | null;
  SupplierCode: string;
  SupplierName: string | null;
  PurchaseContractKey: string | null;
  PurchaseContractCode: string | null;
  ShipmentLoadCode: string | null;
  SalesInvoiceNumber: string | null;
  Volume: number;
  UnitOfMeasureCode: string;
  CreatedBy: string | null;
};
```

In `ServerRoutes.ts`, before the closing `}`:

```ts
  // Troca nota: romaneios de quebra/sobra de descarga (tela "Ajustes de Descarga").
  purchaseDischargesList: '/odata/PurchaseDischargesList',
```

- [ ] **Step 2: Filter bar fragment**

`webapp/view/purchaseDischarges/fragments/Filterbar.fragment.xml`:

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:fb="sap.ui.comp.filterbar"
>
<fb:FilterBar search=".onSearch" showClearOnFB="true" clear=".onClearFilters">
  <fb:filterGroupItems>
    <fb:FilterGroupItem name="dateFrom" label="Data de" groupName="GroupDateFrom" visibleInFilterBar="true" mandatory="true">
      <fb:control>
        <DatePicker value="{ path: 'filter>/DateFrom', type: 'sap.ui.model.type.String' }" displayFormat="dd/MM/yyyy" valueFormat="yyyy-MM-dd"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="dateTo" label="Data até" groupName="GroupDateTo" visibleInFilterBar="true" mandatory="true">
      <fb:control>
        <DatePicker value="{ path: 'filter>/DateTo', type: 'sap.ui.model.type.String' }" displayFormat="dd/MM/yyyy" valueFormat="yyyy-MM-dd"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="type" label="Tipo" groupName="GroupType" visibleInFilterBar="true">
      <fb:control>
        <Select forceSelection="false" selectedKey="{ path: 'filter>/TransactionType', type: 'sap.ui.model.type.String' }">
          <core:ListItem key="" text="Todos"/>
          <core:ListItem key="PurchaseDischargeLoss" text="Quebra Descarga"/>
          <core:ListItem key="PurchaseDischargeGain" text="Sobra Descarga"/>
        </Select>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="supplier" label="Fornecedor" groupName="GroupSupplier" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" value="{filter>/Supplier}" placeholder="Código ou nome"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="contract" label="Contrato de compra" groupName="GroupContract" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" value="{filter>/ContractCode}"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="load" label="Carga" groupName="GroupLoad" visibleInFilterBar="true">
      <fb:control>
        <Input showClearIcon="true" value="{filter>/LoadCode}"/>
      </fb:control>
    </fb:FilterGroupItem>
    <fb:FilterGroupItem name="cancelled" label="Cancelados" groupName="GroupCancelled" visibleInFilterBar="true">
      <fb:control>
        <CheckBox text="Mostrar cancelados" selected="{filter>/ShowCancelled}"/>
      </fb:control>
    </fb:FilterGroupItem>
  </fb:filterGroupItems>
</fb:FilterBar>
</core:FragmentDefinition>
```

- [ ] **Step 3: View**

`webapp/view/purchaseDischarges/Main.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.purchaseDischarges.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:t="sap.ui.table"
	xmlns:f="sap.f"
	core:require="{ formatter: 'siagrob1/model/formatter' }">
  <f:DynamicPage busyIndicatorDelay="0" busy="{discharges>/busy}">
    <f:title>
      <f:DynamicPageTitle>
        <f:heading>
          <Title text="Ajustes de Descarga"/>
        </f:heading>
        <f:snappedContent>
          <Text text="Quebra e sobra de descarga da troca nota, lançadas no contrato de compra CIF ao encerrar a Conferência de Entregas."/>
        </f:snappedContent>
      </f:DynamicPageTitle>
    </f:title>
    <f:header>
      <f:DynamicPageHeader>
        <f:content>
          <core:Fragment fragmentName="siagrob1.view.purchaseDischarges.fragments.Filterbar" type="XML" />
        </f:content>
      </f:DynamicPageHeader>
    </f:header>
    <f:content>
      <t:Table
        id="purchaseDischargesTable"
        busyIndicatorDelay="0"
        selectionMode="Single"
        selectionBehavior="Row"
        class="sapUiSizeCondensed"
        visibleRowCountMode="Auto"
        alternateRowColors="true"
        rows="{ path: 'discharges>/rows' }">
        <t:extension>
          <OverflowToolbar>
            <Title text="Romaneios de descarga ({= ${discharges>/count} })" />
            <ToolbarSpacer />
            <Button type="Transparent" text="Abrir contrato" icon="sap-icon://display" press=".onOpenContract"/>
          </OverflowToolbar>
        </t:extension>
        <t:columns>
          <t:Column label="Tipo" width="10rem" sortProperty="TransactionType">
            <t:template>
              <ObjectStatus
                text="{ path: 'discharges>TransactionType', formatter: 'formatter.formatStorageTransactionType' }"
                state="{= ${discharges>TransactionType} === 'PurchaseDischargeLoss' ? 'Error' : 'Success' }"/>
            </t:template>
          </t:Column>
          <t:Column label="Status" width="8rem" sortProperty="Status">
            <t:template>
              <ObjectStatus inverted="true"
                text="{ path: 'discharges>Status', formatter: 'formatter.formatStorageTransactionStatus' }"
                state="{ path: 'discharges>Status', formatter: 'formatter.stateStorageTransactionStatus' }"/>
            </t:template>
          </t:Column>
          <t:Column label="Romaneio" width="9rem" sortProperty="Code">
            <t:template><Text text="{discharges>Code}" wrapping="false"/></t:template>
          </t:Column>
          <t:Column label="Data" width="7rem" sortProperty="TransactionDate">
            <t:template><Text wrapping="false" text="{ path: 'discharges>TransactionDate', formatter: 'formatter.formatDate' }"/></t:template>
          </t:Column>
          <t:Column label="Fornecedor" width="18rem" sortProperty="SupplierName">
            <t:template><Text wrapping="false" text="{discharges>SupplierCode} - {discharges>SupplierName}" tooltip="{discharges>SupplierCode} - {discharges>SupplierName}"/></t:template>
          </t:Column>
          <t:Column label="Contrato de compra" width="10rem" sortProperty="PurchaseContractCode">
            <t:template><Text text="{discharges>PurchaseContractCode}" wrapping="false"/></t:template>
          </t:Column>
          <t:Column label="Carga" width="8rem" sortProperty="ShipmentLoadCode">
            <t:template><Text text="{discharges>ShipmentLoadCode}" wrapping="false"/></t:template>
          </t:Column>
          <t:Column label="Nota de venda" width="9rem" sortProperty="SalesInvoiceNumber">
            <t:template><Text text="{discharges>SalesInvoiceNumber}" wrapping="false"/></t:template>
          </t:Column>
          <t:Column label="Volume" hAlign="End" width="10rem" sortProperty="Volume">
            <t:template>
              <ObjectNumber
                number="{ path: 'discharges>Volume', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }"
                unit="{discharges>UnitOfMeasureCode}"/>
            </t:template>
          </t:Column>
          <t:Column label="Criado por" width="10rem">
            <t:template><Text text="{discharges>CreatedBy}" wrapping="false"/></t:template>
          </t:Column>
        </t:columns>
      </t:Table>
    </f:content>
  </f:DynamicPage>
</mvc:View>
```

Before using `formatter.formatDate`, `formatter.formatStorageTransactionStatus` and
`formatter.stateStorageTransactionStatus`, check that they accept the plain values that arrive here:
an ISO date string and the status enum name. Read their bodies in `formatter.ts` (~lines 562 and 574
for status; `grep -n "formatDate:" webapp/model/formatter.ts`). If `formatDate` expects anything
else, use the one that `warehouseReconciliations/Main.view.xml` uses for `ReferenceDate` (the same
shape).

- [ ] **Step 4: Controller**

`webapp/controller/purchaseDischarges/Main.controller.ts`:

```ts
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import JSONListBinding from "sap/ui/model/json/JSONListBinding";
import CommonController from "../common/CommonController";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { PurchaseDischarge } from "siagrob1/types/PurchaseDischarge";

type DischargeFilter = {
  DateFrom: string;
  DateTo: string;
  TransactionType: string;
  Supplier: string;
  ContractCode: string;
  LoadCode: string;
  ShowCancelled: boolean;
};

const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Troca nota: romaneios de quebra/sobra de descarga (tipos 16/17). Somente leitura — quem cria e
 * cancela é a Conferência de Entregas. O período vai ao servidor; o resto filtra no cliente.
 *
 * @namespace siagrob1.controller.purchaseDischarges
 */
export default class Main extends CommonController {

  onInit(): void {
    this.createFilterModel(Main.defaultFilter());
    this.getView().setModel(new JSONModel({ rows: [], count: 0, busy: false }), "discharges");

    this.getRouter().getRoute("purchaseDischarges")
      .attachPatternMatched(() => { void this.load(); });
  }

  /** Mês corrente até hoje; cancelados ocultos. Recriado a cada "Limpar". */
  private static defaultFilter(): DischargeFilter {
    const today = new Date();
    return {
      DateFrom: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
      DateTo: toIso(today),
      TransactionType: "",
      Supplier: "",
      ContractCode: "",
      LoadCode: "",
      ShowCancelled: false,
    };
  }

  onSearch(): void {
    void this.load();
  }

  onClearFilters(): void {
    this.createFilterModel(Main.defaultFilter());
    void this.load();
  }

  onOpenContract(): void {
    const table = this.byId("purchaseDischargesTable") as Table;
    const index = table.getSelectedIndex();
    const row = index < 0 ? null : table.getContextByIndex(index)?.getObject() as PurchaseDischarge | undefined;

    if (!row?.PurchaseContractKey) {
      MessageBox.information("Selecione um romaneio com contrato de compra.");
      return;
    }

    this.navTo("purchaseContractsDetail", { id: row.PurchaseContractKey });
  }

  private filterData(): DischargeFilter {
    return (this.getModel("filter") as JSONModel).getData() as DischargeFilter;
  }

  private async load(): Promise<void> {
    const f = this.filterData();
    const model = this.getModel("discharges") as JSONModel;

    if (!f.DateFrom || !f.DateTo) {
      MessageBox.warning("Informe o período (Data de / Data até).");
      return;
    }

    model.setProperty("/busy", true);
    const result = await sendJson(
      "GET",
      `${this.api.purchaseDischargesList}(DateFrom='${f.DateFrom}',DateTo='${f.DateTo}')`);
    model.setProperty("/busy", false);

    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    model.setProperty("/rows", (result.data as PurchaseDischarge[] | undefined) ?? []);
    this.applyClientFilters();
  }

  private applyClientFilters(): void {
    const f = this.filterData();
    const filters: Filter[] = [];

    if (!f.ShowCancelled)
      filters.push(new Filter("Status", FilterOperator.NE, "Cancelled"));

    if (f.TransactionType)
      filters.push(new Filter("TransactionType", FilterOperator.EQ, f.TransactionType));

    if (f.Supplier)
      filters.push(new Filter({
        filters: [
          new Filter("SupplierCode", FilterOperator.Contains, f.Supplier),
          new Filter("SupplierName", FilterOperator.Contains, f.Supplier),
        ],
        and: false,
      }));

    if (f.ContractCode)
      filters.push(new Filter("PurchaseContractCode", FilterOperator.Contains, f.ContractCode));

    if (f.LoadCode)
      filters.push(new Filter("ShipmentLoadCode", FilterOperator.Contains, f.LoadCode));

    const binding = (this.byId("purchaseDischargesTable") as Table).getBinding("rows") as JSONListBinding;
    binding.filter(filters.length ? [new Filter({ filters, and: true })] : []);

    (this.getModel("discharges") as JSONModel).setProperty("/count", binding.getLength());
  }
}
```

`navTo`, `getRouter`, `getModel` and `api` come from `CommonController`/`BaseController`, the same as
in `warehouseReconciliations/BaseController.ts`. If `navTo` has a different name there, use the one
that `purchaseContracts/Main.controller.ts:117` calls.

- [ ] **Step 5: Manifest**

In `routes`, after the `warehouseReconciliations` route:

```json
        {
          "pattern": "purchase-discharges",
          "name": "purchaseDischarges",
          "target": "purchaseDischarges"
        },
```

In `targets`, after the `warehouseReconciliations` target:

```json
        "purchaseDischarges": {
          "id": "purchaseDischarges",
          "level": 1,
          "name": "siagrob1.view.purchaseDischarges.Main",
          "clearControlAggregation": true
        },
```

Run `mcp__plugin_ui5_ui5-mcp-server__run_manifest_validation` on the project. Expected: no new
errors.

- [ ] **Step 6: Gates and stage**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint`. Expected: clean, or only issues that already
existed before this plan. To tell them apart, run the same gates once before Task 1 and keep the
output.

```bash
git add webapp/types/PurchaseDischarge.ts webapp/model/ServerRoutes.ts webapp/view/purchaseDischarges webapp/controller/purchaseDischarges webapp/manifest.json
```

---

### Task 4: End-to-end verification in the browser (the user's path)

"Done" means reachable from the home screen and proven with real data, not a curl (memory
"verify-via-user-path-not-just-my-layer").

- [ ] **Step 1: Start the stack**

Follow memory "run-stack-locally": profile `yktb` (Web + Gateway), then `yarn start:dev`. Log in as
admin/1234. Both backend migrations (AppContext and CommonContext) must already be applied on
localhost (backend plan Tasks 1 and 8).

- [ ] **Step 2: Build the scenario on localhost**

1. Pick (or create) a purchase contract with **Condição de frete = CIF**, approved, with a shipment
   release.
2. Create a load with freight 0.
3. Create an Expedição from that purchase release and attach it to the load.
4. Bill the load and confirm the sales invoice.
5. In "Conferência de Entregas", close the item with a **loss**: delivered = quantity − 30, discount
   10.

- [ ] **Step 3: Check every place (screenshot each)**

1. The contract's "Entregas" shows a row with Tipo "Quebra Descarga", Origem "Quebra de descarga"
   (red stripe), and a tooltip with the invoice number and load. The legend lists the new origins.
   The contract balance (saldo) grew by 40.
2. The warehouse balance of the Expedição's warehouse and the purchase release's shipped quantity
   are **unchanged**.
3. The menu **Compras → Ajustes de Descarga** opens the new screen. The row is there, and "Abrir
   contrato" navigates to the contract.
4. Reopen the conference (Aberto). The row becomes "Cancelado" (visible only with "Mostrar
   cancelados"), Entregas no longer has it, and the balance is back.
5. Close again with a gain on a contract without balance. The refusal shows the business message
   ("A sobra de descarga … excede o saldo …"), not "Communication error".
6. Finish (Encerrar) the purchase contract, then try to close the conference. It is refused with "O
   contrato de compra … está encerrado; reabra-o…".
7. With the conference closed, try to cancel the sales invoice and to delete it. Both are refused
   with the discharge message.
8. The Romaneios screen (storageTransactions) shows the 16 with the label "Quebra Descarga", and
   cancelling/reversing it there is refused.

Record in the report anything that failed and was fixed, with the cause (memory: "the browser catches
what the gates don't").

- [ ] **Step 4: Stop the stack**

Stop the Web, the Gateway and the dev server.

- [ ] **Step 5: Draft the commit messages (both repos) for the user's review**

Show the branch and `git status --short` of each repo, plus the drafts. Commit only after the user
says yes. Frontend draft:

```
feat(purchase-contract): acertar compra CIF pela descarga na troca nota

A Conferência de Entregas passou a gerar romaneios de quebra/sobra de descarga
(tipos 16/17) no contrato de compra CIF. As Entregas do contrato ganham as duas
origens (com a nota e a carga no tooltip), os rótulos de tipo passam a conhecê-los
e a tela "Ajustes de Descarga" (Compras) lista os romaneios, somente leitura.

Atenção: a tela filtra no cliente; só o período vai ao servidor.
```
