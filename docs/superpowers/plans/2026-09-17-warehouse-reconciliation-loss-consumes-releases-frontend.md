# Conferência de Saldo de Armazém — a Perda consome as liberações — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Distribuição da perda" grid to the reconciliation screens.

- **Create/edit:** the user types how much of the loss falls on each shipment release.
- **Detail/approval:** the saved distribution is shown with the generated transaction codes.
- **Gains:** the screen explains that only losses are accepted.

**Architecture:**
- **Draft grid.** It lives in the `wr` JSONModel and is filled by the existing balance preview,
  which now returns `Releases`. It is saved after the reconciliation itself by calling the action
  `WarehouseReconciliationsDistributeLoss` through `sendJson`, the same pattern as the other
  actions of this screen.
- **Read-only grid.** It comes from the function `WarehouseReconciliationsListReleases`.
- **Fragment.** One new fragment holds both grids, and the four existing views include it.

**Tech Stack:** OpenUI5 1.141 + TypeScript, `sap.m.Table`, JSONModel, `fetch` via `siagrob1/helpers/FetchHelpers.sendJson`.

**Spec:** `../siagro-b1-backend/docs/superpowers/specs/2026-09-14-warehouse-reconciliation-design.md` §9 (§9.8 and §9.9 for the screens).
**Backend contract:** `../siagro-b1-backend/docs/superpowers/plans/2026-09-17-warehouse-reconciliation-loss-consumes-releases-backend.md`, Tasks 3, 4 and 7. **That plan must be complete first.**

## Global Constraints

- **Language:** labels and messages are pt-BR; identifiers are English.
- **Terms:** the screen word is "Perda". Nothing new says "Sobra", but the existing "Sobra"
  formatter stays for history.
- **Git:** `git add` every new or changed file. **Never commit or push.**
- **Tables:** use `sap.m.Table` for these grids. In `sap.ui.table`, text without `wrapping=false`
  gets cut.
- **XML comments:** they must never contain `--`, because `Fragment.load` then returns nulls
  silently (memory "`--` em comentário XML mata o fragmento").
- **REST casing:** REST/function responses arrive in camelCase. Normalize both casings, like
  `normalizeBalancePreview` already does (memory "Resposta REST vem em camelCase").
- **Gates:** `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint`, plus the XML parse loop:

```powershell
Get-ChildItem webapp\view\warehouseReconciliations -Recurse -Filter *.xml | ForEach-Object { [xml](Get-Content $_.FullName -Raw) | Out-Null }
```

- **Tests:** `yarn test` never passes (coverage gate), so do not use it as a gate.

## Backend contract used here

| Endpoint | Shape |
|---|---|
| `GET /odata/WarehouseReconciliationsGetBalancePreview(WarehouseCode='..',ItemCode='..',ReferenceDate='yyyy-MM-dd')` | existing fields + `releases: [{ shipmentReleaseKey, releaseDate, status, origin, purchaseContractKey, purchaseContractCode, cardCode, cardName, balanceAtReferenceDate, currentBalance, canReceiveLoss }]`. `status` and `origin` are enum NAMES (`"Actived"`, `"Paused"`, `"Standard"`…). |
| `POST /odata/WarehouseReconciliationsDistributeLoss` body `{ Key, ShipmentReleaseKeys: [guid], Quantities: [number] }` | 200 empty; 400 with a business message. Draft only. An empty list clears the distribution. |
| `GET /odata/WarehouseReconciliationsListReleases(Key=<guid>)` | `[{ shipmentReleaseKey, releaseDate, purchaseContractCode, cardCode, cardName, quantity, purchaseTransactionCode, lossTransactionCode }]`, raw or wrapped in `{ value: [...] }` |

---

### Task 1: Types, routes and the distribution state in the base controller

**Files:**
- Modify: `webapp/types/WarehouseReconciliationBalancePreview.ts`
- Modify: `webapp/model/ServerRoutes.ts` (after `warehouseReconciliationsAttachmentsDownload`, line ~198)
- Modify: `webapp/controller/warehouseReconciliations/BaseController.ts`

**Interfaces:**
- Produces types `WarehouseReconciliationReleaseBalance` and `WarehouseReconciliationReleaseLine`,
  plus `normalizeReleaseLines(raw: unknown): WarehouseReconciliationReleaseLine[]`.
- Produces in `BaseController`:
  - `wr>/distribution`: rows `{ shipmentReleaseKey, releaseDate, status, origin, purchaseContractCode, cardName, balanceAtReferenceDate, currentBalance, canReceiveLoss, quantity }`;
  - `wr>/distributionInfo`: `{ loss: number, distributed: number, closed: boolean, isGain: boolean }`;
  - `wr>/savedLines`: rows of `WarehouseReconciliationReleaseLine`;
  - `protected async loadSavedLines(key: string): Promise<void>`;
  - `protected async saveDistribution(key: string): Promise<boolean>`;
  - `onDistributionQuantityChange(): void` (XML handler).

- [ ] **Step 1: Extend the types file.** Replace
  `webapp/types/WarehouseReconciliationBalancePreview.ts` with:

```ts
/** Liberação do armazém+produto com o saldo a embarcar na data e hoje (GAC-1164 §9). */
export type WarehouseReconciliationReleaseBalance = {
  shipmentReleaseKey: string;
  releaseDate: string;
  status: string;
  origin: string;
  purchaseContractCode: string;
  cardName: string;
  balanceAtReferenceDate: number;
  currentBalance: number;
  canReceiveLoss: boolean;
};

/** Linha gravada da distribuição da perda, com os romaneios gerados na aprovação. */
export type WarehouseReconciliationReleaseLine = {
  shipmentReleaseKey: string;
  releaseDate: string;
  purchaseContractCode: string;
  cardCode: string;
  cardName: string;
  quantity: number;
  purchaseTransactionCode: string;
  lossTransactionCode: string;
};

/** Prévia de saldo da Conferência de Saldo de Armazém. */
export type WarehouseReconciliationBalancePreview = {
  systemBalance: number;
  isOwnWarehouse: boolean;
  // O eslint reclama que `| null` é redundante: este projeto roda com `strictNullChecks: false`,
  // então null já é atribuível a qualquer tipo. Mantemos a anotação porque documenta o contrato
  // real (nunca houve conferência aprovada) — mesmo padrão de
  // FinancialDocumentsBaseController.direction/natureFilter.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  lastApprovedReferenceDate: string | null;
  hasOpenReconciliation: boolean;
  releases: WarehouseReconciliationReleaseBalance[];
};

type Raw = Record<string, unknown>;

const picker = (o: Raw) => (camel: string, pascal: string) => o[camel] ?? o[pascal];

/** Function devolve o array cru ou `{ value: [...] }`. */
function rowsOf(raw: unknown): Raw[] {
  if (Array.isArray(raw)) return raw as Raw[];
  const o = (raw ?? {}) as Raw;
  return ((o.value ?? o.Value ?? []) as Raw[]);
}

function normalizeReleaseBalance(o: Raw): WarehouseReconciliationReleaseBalance {
  const pick = picker(o);
  return {
    shipmentReleaseKey: pick("shipmentReleaseKey", "ShipmentReleaseKey") as string,
    releaseDate: pick("releaseDate", "ReleaseDate") as string,
    status: pick("status", "Status") as string,
    origin: pick("origin", "Origin") as string,
    purchaseContractCode: pick("purchaseContractCode", "PurchaseContractCode") as string,
    cardName: pick("cardName", "CardName") as string,
    balanceAtReferenceDate: Number(pick("balanceAtReferenceDate", "BalanceAtReferenceDate") ?? 0),
    currentBalance: Number(pick("currentBalance", "CurrentBalance") ?? 0),
    canReceiveLoss: Boolean(pick("canReceiveLoss", "CanReceiveLoss")),
  };
}

/**
 * A function OData devolve o DTO sem envelope e a caixa das chaves depende do serializador
 * (as respostas REST deste backend saem em camelCase). Lê as duas formas para não falhar
 * em silêncio com `undefined`.
 */
export function normalizeBalancePreview(raw: unknown): WarehouseReconciliationBalancePreview {
  const o = (raw ?? {}) as Raw;
  const pick = picker(o);

  return {
    systemBalance: Number(pick("systemBalance", "SystemBalance") ?? 0),
    isOwnWarehouse: Boolean(pick("isOwnWarehouse", "IsOwnWarehouse")),
    lastApprovedReferenceDate: (pick("lastApprovedReferenceDate", "LastApprovedReferenceDate") as string) ?? null,
    hasOpenReconciliation: Boolean(pick("hasOpenReconciliation", "HasOpenReconciliation")),
    releases: rowsOf(pick("releases", "Releases")).map(normalizeReleaseBalance),
  };
}

export function normalizeReleaseLines(raw: unknown): WarehouseReconciliationReleaseLine[] {
  return rowsOf(raw).map((o) => {
    const pick = picker(o);
    return {
      shipmentReleaseKey: pick("shipmentReleaseKey", "ShipmentReleaseKey") as string,
      releaseDate: pick("releaseDate", "ReleaseDate") as string,
      purchaseContractCode: pick("purchaseContractCode", "PurchaseContractCode") as string,
      cardCode: pick("cardCode", "CardCode") as string,
      cardName: pick("cardName", "CardName") as string,
      quantity: Number(pick("quantity", "Quantity") ?? 0),
      purchaseTransactionCode: pick("purchaseTransactionCode", "PurchaseTransactionCode") as string,
      lossTransactionCode: pick("lossTransactionCode", "LossTransactionCode") as string,
    };
  });
}
```

  ⚠️ `rowsOf(pick("releases", "Releases"))`: `releases` is a plain array inside the DTO, so
  `Array.isArray` catches it.

- [ ] **Step 2: Add the server routes** after `warehouseReconciliationsAttachmentsDownload`:

```ts
  warehouseReconciliationsDistributeLoss: '/odata/WarehouseReconciliationsDistributeLoss',
  warehouseReconciliationsListReleases: '/odata/WarehouseReconciliationsListReleases',
```

- [ ] **Step 3: Distribution state in `BaseController`.**
  - **Imports:** `normalizeReleaseLines`, `WarehouseReconciliationReleaseBalance`.
  - **`initReconciliationModel`:** add to the initial data
    `distribution: [], distributionInfo: { loss: 0, distributed: 0, closed: true, isGain: false }, savedLines: []`.
  - **`resetPreview`:** at the end, call `this.wr().setProperty("/distribution", []);` and then
    `this.updateDistributionInfo();`. Do NOT clear `/savedLines` here, because Edit preloads it
    before the preview.
  - **`updateDifference`:** at the end, call `this.updateDistributionInfo();`.
  - **`refreshPreview`:** after `this.wr().setProperty("/preview/hasOpenReconciliation", …)`, add
    `this.applyDistributionRows(preview.releases);` before `this.updateDifference(ctx)`.
  - **New members** (put them after `updateDifference`):

```ts
  /** Tolerância de arredondamento igual à do backend (0,001). */
  private static readonly TOLERANCE = 0.001;

  /**
   * Monta a grade de distribuição a partir das liberações da prévia, preservando o que o usuário já
   * digitou (ou o que estava gravado, na edição) para a mesma liberação. Com UMA liberação elegível
   * a perda inteira vai para ela sozinha (spec §9.4).
   */
  protected applyDistributionRows(releases: WarehouseReconciliationReleaseBalance[]): void {
    const typed = new Map<string, number>();
    ((this.wr().getProperty("/savedLines") ?? []) as { shipmentReleaseKey: string; quantity: number }[])
      .forEach((l) => typed.set(l.shipmentReleaseKey, l.quantity));
    ((this.wr().getProperty("/distribution") ?? []) as { shipmentReleaseKey: string; quantity: number }[])
      .forEach((l) => typed.set(l.shipmentReleaseKey, l.quantity));

    const rows = releases.map((r) => ({
      ...r,
      quantity: r.canReceiveLoss ? (typed.get(r.shipmentReleaseKey) ?? 0) : 0,
    }));

    this.wr().setProperty("/distribution", rows);
    this.autoFillSingleRelease();
    this.updateDistributionInfo();
  }

  private lossOf(): number {
    const difference = this.wr().getProperty("/preview/difference") as number;
    return difference !== null && difference < 0 ? Math.round(-difference * 1000) / 1000 : 0;
  }

  private autoFillSingleRelease(): void {
    const rows = (this.wr().getProperty("/distribution") ?? []) as { canReceiveLoss: boolean; quantity: number }[];
    const eligible = rows.filter((r) => r.canReceiveLoss);
    if (eligible.length === 1 && this.lossOf() > 0) {
      eligible[0].quantity = this.lossOf();
      this.wr().refresh(true);
    }
  }

  protected updateDistributionInfo(): void {
    const rows = (this.wr().getProperty("/distribution") ?? []) as { quantity: number }[];
    const distributed = Math.round(rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0) * 1000) / 1000;
    const loss = this.lossOf();
    const difference = this.wr().getProperty("/preview/difference") as number;

    this.wr().setProperty("/distributionInfo", {
      loss,
      distributed,
      closed: Math.abs(distributed - loss) <= BaseController.TOLERANCE,
      isGain: difference !== null && difference > 0,
    });
  }

  onDistributionQuantityChange(): void {
    this.updateDistributionInfo();
  }

  /** Grava a distribuição digitada. A conferência precisa já existir (Key). */
  protected async saveDistribution(key: string): Promise<boolean> {
    const rows = ((this.wr().getProperty("/distribution") ?? []) as { shipmentReleaseKey: string; quantity: number }[])
      .filter((r) => Number(r.quantity) > 0);

    const result = await sendJson("POST", this.api.warehouseReconciliationsDistributeLoss, {
      Key: key,
      ShipmentReleaseKeys: rows.map((r) => r.shipmentReleaseKey),
      Quantities: rows.map((r) => Number(r.quantity)),
    });

    if (!result.ok) {
      MessageBox.error(result.message);
      return false;
    }
    return true;
  }

  protected async loadSavedLines(key: string): Promise<void> {
    this.wr().setProperty("/savedLines", []);
    const result = await sendJson("GET", `${this.api.warehouseReconciliationsListReleases}(Key=${key})`);
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }
    this.wr().setProperty("/savedLines", normalizeReleaseLines(result.data));
  }
```

  **Auto-fill on difference changes:** `autoFillSingleRelease` runs when the rows are built. It
  must also run when the reported balance changes, so `onReportedBalanceChange` becomes:

```ts
  onReportedBalanceChange(): void {
    this.updateDifference(this.getView().getBindingContext() as Context);
    this.autoFillSingleRelease();
    this.updateDistributionInfo();
  }
```

  **`ServerRoutes` typing:** check how `this.api` is typed. If `ServerRoutes` is an `as const`
  object, the new keys are picked up automatically; otherwise add them to the type too.

- [ ] **Step 4: Run the gates** (`yarn ts-typecheck`, `yarn lint`). Expected: no new errors.

- [ ] **Step 5: Stage** the three files.

---

### Task 2: The "Distribuição da perda" fragment and the four views

**Files:**
- Create: `webapp/view/warehouseReconciliations/fragments/LossDistribution.fragment.xml`
- Modify: `webapp/view/warehouseReconciliations/Add.view.xml`, `Edit.view.xml`, `Detail.view.xml`, `approval/Detail.view.xml`

**Interfaces:**
- Consumes: `wr>/distribution`, `wr>/distributionInfo`, `wr>/savedLines`, `ui>/editable` and
  `.onDistributionQuantityChange` (Task 1).
- Consumes formatter: `formatter.formatShipmentReleaseStatus` (existing; maps `Paused` → "Pausado").

- [ ] **Step 1: Create the fragment.**

```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    core:require="{ formatter: 'siagrob1/model/formatter' }">
  <VBox>
    <MessageStrip
      visible="{= ${ui>/editable} &amp;&amp; ${wr>/distributionInfo/isGain} }"
      type="Error"
      showIcon="true"
      class="sapUiSmallMarginBottom"
      text="A conferência de saldo aceita apenas perda: o saldo informado precisa ser menor que o saldo do sistema."/>
    <MessageStrip
      visible="{= ${ui>/editable} &amp;&amp; !${wr>/distributionInfo/isGain} &amp;&amp; ${wr>/distributionInfo/loss} > 0 }"
      type="{= ${wr>/distributionInfo/closed} ? 'Success' : 'Warning' }"
      showIcon="true"
      class="sapUiSmallMarginBottom"
      text="Distribuído {wr>/distributionInfo/distributed} de {wr>/distributionInfo/loss}. A soma precisa fechar com a perda para enviar à aprovação. Liberação pausada ou sem saldo hoje não recebe perda."/>

    <!-- Rascunho em edição: grade digitável montada pela prévia do saldo -->
    <Table
      visible="{ui>/editable}"
      items="{ path: 'wr>/distribution' }"
      noDataText="Nenhuma liberação com saldo neste armazém e produto na data de referência.">
      <columns>
        <Column><Text text="Contrato"/></Column>
        <Column minScreenWidth="Tablet" demandPopin="true"><Text text="Produtor"/></Column>
        <Column minScreenWidth="Tablet" demandPopin="true"><Text text="Liberação"/></Column>
        <Column minScreenWidth="Tablet" demandPopin="true"><Text text="Situação"/></Column>
        <Column hAlign="End"><Text text="Saldo na data"/></Column>
        <Column hAlign="End" minScreenWidth="Tablet" demandPopin="true"><Text text="Saldo hoje"/></Column>
        <Column hAlign="End" width="12rem"><Text text="Quantidade da perda"/></Column>
      </columns>
      <items>
        <ColumnListItem>
          <cells>
            <Text text="{wr>purchaseContractCode}"/>
            <Text text="{wr>cardName}"/>
            <Text text="{ path: 'wr>releaseDate', formatter: 'formatter.formatDate' }"/>
            <Text text="{ path: 'wr>status', formatter: 'formatter.formatShipmentReleaseStatus' }"/>
            <ObjectNumber number="{ path: 'wr>balanceAtReferenceDate', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }"/>
            <ObjectNumber number="{ path: 'wr>currentBalance', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }"/>
            <Input
              textAlign="End"
              editable="{wr>canReceiveLoss}"
              change=".onDistributionQuantityChange"
              value="{ path: 'wr>quantity', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' }, constraints: { minimum: 0 } }"/>
          </cells>
        </ColumnListItem>
      </items>
    </Table>

    <!-- Detalhe e aprovação: distribuição gravada, com os romaneios gerados -->
    <Table
      visible="{= !${ui>/editable} }"
      items="{ path: 'wr>/savedLines' }"
      noDataText="Perda ainda não distribuída entre as liberações.">
      <columns>
        <Column><Text text="Contrato"/></Column>
        <Column minScreenWidth="Tablet" demandPopin="true"><Text text="Produtor"/></Column>
        <Column minScreenWidth="Tablet" demandPopin="true"><Text text="Liberação"/></Column>
        <Column hAlign="End"><Text text="Quantidade da perda"/></Column>
        <Column minScreenWidth="Tablet" demandPopin="true"><Text text="Romaneio de compra"/></Column>
        <Column minScreenWidth="Tablet" demandPopin="true"><Text text="Romaneio de perda"/></Column>
      </columns>
      <items>
        <ColumnListItem>
          <cells>
            <Text text="{wr>purchaseContractCode}"/>
            <Text text="{wr>cardName}"/>
            <Text text="{ path: 'wr>releaseDate', formatter: 'formatter.formatDate' }"/>
            <ObjectNumber number="{ path: 'wr>quantity', type: 'sap.ui.model.type.Float', formatOptions: { decimals: 3, decimalSeparator: ',', groupingEnabled: true, groupingSeparator: '.' } }"/>
            <Text text="{wr>purchaseTransactionCode}"/>
            <Text text="{wr>lossTransactionCode}"/>
          </cells>
        </ColumnListItem>
      </items>
    </Table>
  </VBox>
</core:FragmentDefinition>
```

  **Date formatter:** before writing, grep `webapp/model/formatter.ts` for the formatter that
  prints an ISO date as `dd/MM/yyyy` (e.g. `formatDate`). Use its real name. If none takes an ISO
  string, use
  `{ path: 'wr>releaseDate', type: 'sap.ui.model.type.Date', formatOptions: { source: { pattern: "yyyy-MM-dd'T'HH:mm:ss" }, pattern: 'dd/MM/yyyy' } }`.
  Check the actual string from the preview response in Task 4 Step 2.

  **Numbers in the MessageStrip:** they show raw. If lint or ui5lint complains about the
  expression binding, move the text into a formatter `formatter.formatLossDistributionInfo(distributed, loss)`
  that returns the pt-BR sentence with `toLocaleString("pt-BR", { minimumFractionDigits: 3 })`.

- [ ] **Step 2: Include the fragment in the four views.** In each view, right after the
  `ObjectPageSection` titled "Dados da Conferência", add:

```xml
      <uxap:ObjectPageSection titleUppercase="false" title="Distribuição da perda">
        <uxap:subSections>
          <uxap:ObjectPageSubSection title=" " titleUppercase="false">
            <core:Fragment fragmentName="siagrob1.view.warehouseReconciliations.fragments.LossDistribution" type="XML" />
          </uxap:ObjectPageSubSection>
        </uxap:subSections>
      </uxap:ObjectPageSection>
```

  Views: `Add.view.xml`, `Edit.view.xml`, `Detail.view.xml`, `approval/Detail.view.xml`. Check that
  each has the `uxap` and `core` namespaces; they already use both.

- [ ] **Step 3: Run the gates:** `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint`, and the XML
  parse loop. Expected: no new findings.

- [ ] **Step 4: Stage** the fragment and the four views.

---

### Task 3: Save, load and messages in the controllers

**Files:**
- Modify: `webapp/controller/warehouseReconciliations/Add.controller.ts`
- Modify: `webapp/controller/warehouseReconciliations/Edit.controller.ts`
- Modify: `webapp/controller/warehouseReconciliations/Detail.controller.ts`
- Modify: `webapp/controller/warehouseReconciliations/approval/Detail.controller.ts`
- Modify: `webapp/model/formatter.ts` (only if Task 2 needed a new formatter)

**Interfaces:**
- Consumes: `saveDistribution`, `loadSavedLines`, `resetPreview`, `refreshPreview` (Task 1).

- [ ] **Step 1: Add.** In `prepare()`, after `this.resetPreview();` add
  `this.wr().setProperty("/savedLines", []);`. Replace the body of the `try` in `onSave` with:

```ts
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      const key = ctx.getProperty("Key") as string;

      // A distribuição só pode ser gravada depois que a conferência existe. Se o servidor recusar,
      // a conferência já está salva em rascunho: leva para a edição, onde o usuário corrige.
      if (!(await this.saveDistribution(key))) {
        this.navTo("warehouseReconciliationsEdit", { id: key });
        return;
      }

      MessageToast.show("Conferência gravada em rascunho.");
      this.navTo("warehouseReconciliationsDetail", { id: key });
```

- [ ] **Step 2: Edit.** Load the saved lines BEFORE the preview so the typed quantities come back.
  - In `routeMatched`, after `this.resetPreview();`, add `this.wr().setProperty("/savedLines", []);`.
  - Change the `dataReceived` handler body to:

```ts
      const ctx = this.getView().getBindingContext() as Context;
      if (ctx?.getProperty("Status") !== "Draft") {
        MessageBox.warning("Somente conferências em rascunho podem ser alteradas.");
        this.navTo("warehouseReconciliationsDetail", { id });
        return;
      }
      void this.loadSavedLines(id).then(() => this.refreshPreview(ctx));
```

  - In `onSave`, after the `hasPendingChanges` return, add:

```ts
      if (!(await this.saveDistribution(ctx.getProperty("Key") as string))) return;
```

  ⚠️ **Stale saved lines:** `applyDistributionRows` reads `/savedLines` on every preview refresh.
  After the user changes the warehouse or item, those saved lines belong to other releases and
  simply do not match any row. That is harmless.

- [ ] **Step 3: Detail.**
  - In `routeMatched`, next to `void this.loadAttachments(id);`, add
    `void this.loadSavedLines(id);`.
  - In `reload()`, add `void this.loadSavedLines(this.currentKey());`.

- [ ] **Step 4: Approval detail.**
  - In `routeMatched`, next to `void this.loadAttachments(id);`, add
    `void this.loadSavedLines(id);`.
  - Change the approval toast to
    `"Conferência aprovada. A perda foi baixada das liberações."`.
  - In `onApprove`, if the snapshot `Difference` of the bound context is `>= 0`, show
    `MessageBox.warning("A conferência de saldo aceita apenas perda.")` and return. The server
    refuses too; this only fails early.

- [ ] **Step 5: Header label.** Detail views show `formatWarehouseReconciliationDirection(Difference)`.
  Keep it, since legacy rows may be "Sobra".

- [ ] **Step 6: Run the gates:** `yarn ts-typecheck`, `yarn lint`, `yarn ui5lint`, XML parse loop.

- [ ] **Step 7: Stage** the changed controllers (and `formatter.ts` if touched).

---

### Task 4: End-to-end verification in the browser (user path)

**Prerequisites:** the backend plan is complete, and its migration is applied on `IDX_SIAGRO_DEV`
(localhost).

- [ ] **Step 1: Start the stack** (memory "Subir a stack local"). Port 8080 is usually taken by
  EfisCloud, so serve the UI on 8090:

```powershell
dotnet run --project ..\siagro-b1-backend\SiagroB1.Web --launch-profile yktb      # background
dotnet run --project ..\siagro-b1-backend\SiagroB1.Gateway --launch-profile yktb  # background
npx ui5 serve --port 8090                                                         # background
```

  Open `http://localhost:8090`. Ask the user to log in (`admin`/`1234`); do not type the password
  yourself.

- [ ] **Step 2: Confirm the payload shapes** in the browser console:

```js
await fetch("/odata/WarehouseReconciliationsGetBalancePreview(WarehouseCode='F024813',ItemCode='P026031',ReferenceDate='2026-09-17')").then(r => r.json())
```

  Expected: a `releases` array (camelCase or PascalCase) with `releaseDate` as an ISO string. If
  the release date binding from Task 2 does not render that string, fix the binding now.

- [ ] **Step 3: Clean the legacy data through the UI.** CS000002, then CS000001 (F024813/P026031),
  are approved without a distribution.
  - Open each from the home menu, **Compras → Conferência de Saldo de Armazém**, and cancel it with
    reason "Revisão 17/09: perda passa a consumir liberações".
  - **Expected:** both end as Cancelada, and the read-only distribution grid says "Perda ainda não
    distribuída…".
  - **Warehouse balance:** in **Romaneios de Movimentação**, their Perda Armazém transactions show
    Cancelado.

- [ ] **Step 4: Run the user scenario from the home screen.** It needs a third-party warehouse +
  product with **two** active Standard releases with balance.
  - **Find the data:** use **Expedição de Grãos** (`/shipping-transaction`): search by product and
    pick a warehouse whose "Saldo" is the sum of two or more contracts on the next screen. Note the
    warehouse balance **S** and the two contracts.
  - **If no such pair exists locally,** stop and ask the user which data to use. Do not create
    contracts by SQL.

  Then:
  1. **Create the draft:** new conference with that warehouse, product and today's date.
     - "Saldo do sistema na data" = **S**.
     - The distribution grid lists the releases with "Saldo na data" and "Saldo hoje".
  2. **Gain:** enter reported balance **S + 10**. The red strip "aceita apenas perda" appears.
  3. **Loss:** enter reported balance **S − 1.000**. The strip says "Distribuído 0 de 1.000" in
     amber.
  4. **Distribute** 600 on the first release and 400 on the second. The strip turns green. Save:
     the Detail screen opens in Rascunho, and the read-only grid shows the 600/400 lines with empty
     transaction columns.
  5. **Edit:** the typed 600/400 come back in the editable grid. Change to 700/300 and save; the
     Detail screen shows 700/300.
  6. **Send with an open distribution:** edit to 700/200 and save, then click "Enviar para
     aprovação". Expected: the business message "A soma da distribuição da perda…", not a generic
     error. Fix to 700/300 and send: status Em aprovação.
  7. **Approve:** in **Compras → Aprovação de Conferências de Saldo**, open it. The grid shows the
     lines. Approve with a comment. Expected: toast "A perda foi baixada das liberações.", and the
     item moves to Aprovadas.
  8. **Generated transactions:** the Detail screen shows, for each line, a purchase transaction code
     and a loss transaction code. In **Romaneios de Movimentação**, 4 rows exist: 2 Compra + 2 Perda
     Armazém, Confirmado, on the reference date. Cancelling one there is refused by the backend.
  9. **Shipping screen (the bug from the ticket):** in **Expedição de Grãos**, the same warehouse
     shows **S − 1.000**. On the next screen, the two contracts show 700 and 300 less than before.
  10. **Contract:** open one of the purchase contracts. Its allocations list has the new allocation
      of 700 (or 300) from the purchase transaction.
  11. **Cancel:** cancel the approved conference with a reason. Expected:
      - Expedição shows **S** again;
      - the 4 transactions are Cancelado;
      - the contract allocation is gone.
  12. **Paused release:** pause one of the two releases (in the releases screen) and open a new
      conference draft. The paused row shows "Pausado", its quantity input is not editable, and its
      balance still counts in "Saldo do sistema na data". Reactivate the release afterwards and
      cancel the draft.
  13. **Console and network:** DevTools shows no 500, no binding errors, and no fragment load
      errors.

- [ ] **Step 5: Stop the stack** and confirm that the ports are free:

```powershell
50000,5246,8090 | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } }
```

- [ ] **Step 6: Final state.** Run `git -C . status --short` in both repos. Every new file shows
  `A` or `M`, and nothing is committed. Report each numbered check above as passed or failed, with
  the warehouse, product and contracts used.
