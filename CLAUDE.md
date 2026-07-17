# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SiagroB1 frontend: an OpenUI5/SAPUI5 1.141.0 single-page app written in TypeScript, providing the UI for the SiagroB1 agribusiness ERP (business partners, purchase/sales contracts, warehouses, storage, weighing tickets, truck scales, user/role/permission administration, reports). It talks to the `siagro-b1-backend` (sibling repo) via OData v4 and a handful of REST endpoints.

The `README.md` in this repo is still the unmodified `ui5-typescript-helloworld` template README — treat it as generic UI5-tooling documentation, not project-specific guidance.

## Commands

Package manager: yarn (yarn.lock is present; npm also works, no lockfile conflicts to worry about since there's only one lockfile).

```bash
yarn install
yarn start          # dev server on http://localhost:8080, opens index.html, proxies backend calls (see below)
yarn build           # quick/unoptimized build -> dist/
yarn build:opt        # optimized self-contained build -> dist/ (bundles UI5 framework resources too)
yarn start:dist        # serve the dist/ build
yarn ts-typecheck      # tsc --noEmit
yarn lint              # eslint webapp
yarn ui5lint            # SAP's UI5-specific linter (separate from ESLint)
yarn test               # lint + full coverage-instrumented QUnit/OPA5 run (this is the CI gate — run before considering work done)
```

To run a single test: `yarn start`, then open
`http://localhost:8080/test/Test.qunit.html?testsuite=test-resources/siagrob1/testsuite.qunit&test=unit/unitTests`
(or `&test=integration/opaTests` for OPA5 journeys) and filter to a specific module/test from the QUnit UI — there's no CLI flag for running a single test file directly.

Test coverage today is minimal: `webapp/test/` still only contains the generator template's sample unit test (`Main.qunit.ts`) and sample OPA journey (`HelloJourney.ts`) — none of the ~90 real feature modules have tests yet.

## Backend integration

The dev server (`ui5.yaml`) proxies to the backend Gateway at `http://localhost:5246` (see `siagro-b1-backend/SiagroB1.Gateway`) across four mount paths:

- `/odata` → OData v4 API (`manifest.json`'s `mainService`, the default `""` model) — entity sets like `BusinessPartners`, `Items`, `Warehouses`, `PurchaseContracts`, `SalesContracts`, `StorageTransactions`, etc.
- `/security` → auth REST endpoints (login/logout/status/menu/branch), consumed by `webapp/services/SessionService.ts` and `Component.ts`.
- `/reports` → report-generation REST endpoints.
- `/hangfire` → Hangfire dashboard, proxied through for local visibility into background jobs.

`webapp/model/ServerRoutes.ts` is the single registry of backend endpoint paths — both OData resource paths and plain REST action paths (e.g. `PurchaseContractsApproval`, `PurchaseContractsCreateAllocation(...)`). Non-OData REST calls go through `webapp/model/RequestModel.ts`. Add new backend endpoints here rather than hardcoding URLs in controllers.

`Component.ts` installs a global OData message-model handler that shows a `MessageBox.error` for technical OData errors and specifically catches HTTP 401 to force navigation to the `login` route (session-expiry handling) — `onSessionExpired()` posts to `ServerRoutes.logout` first.

Build-config variants exist for different purposes: `ui5.yaml` (dev server, includes the four proxy middlewares and the full library set), `ui5-dist.yaml` (serves the already-built `dist/` output, trimmed library list, no proxy — assumes the app is deployed alongside/behind the real backend), `ui5-coverage.yaml` (same as dist's trimmed libs but with Babel/istanbul instrumentation enabled, used only by `yarn start-coverage` / the `test` script).

## Project structure

`webapp/` is organized by feature, each with matching `controller/<Feature>` and `view/<Feature>` (+ `view/<Feature>/fragments/`) folders — around 90 feature modules, e.g. `parceirosNegocio`, `produtos`, `armazem`, `purchaseContracts` (with `allocation`/`approval`/`shipmentRelease` sub-features), `salesContracts`, `storageTransactions`, `weighingTicket`, `truckScales`, plus admin modules `permissions`/`roles`/`profiles`/`users`/`menus`. Naming is a mix of Portuguese and English across modules (e.g. `armazem`/`motorista`/`veiculo`/`safra` vs `warehouses`/`drivers`) — match the existing name for whatever module you're editing rather than normalizing to one language.

Other key locations: `webapp/model` (`formatter.ts`, `models.ts`, `RequestModel.ts`, `ServerRoutes.ts`), `webapp/services` (`SessionService.ts`), `webapp/helpers`, `webapp/dialogs` (+ `fragments`), `webapp/i18n` (locales en, de, pt-BR — default/fallback is **pt-BR**), `webapp/test`.

Routing (`manifest.json`) uses `sap.m.routing.Router` against the `app`/`pages` aggregation in the root view `siagrob1.view.App`, with 100+ routes — most entities follow an Add/New, Edit, Detail (level 1/2) pattern. Route URL patterns are English kebab-case (e.g. `business-partners`, `purchase-contracts/{id}/edit`) even where the underlying view/controller names are in Portuguese.

## TypeScript / linting notes

`tsconfig.json`: `strict: true` but with `strictNullChecks: false` and `strictPropertyInitialization: false` explicitly turned back off (a common UI5-TS pattern) — don't assume full null-safety from the compiler. Path aliases: `siagrob1/*` → `./webapp/*`, `unit/*` → `./webapp/test/unit/*`, `integration/*` → `./webapp/test/integration/*`.

`eslint.config.mjs` is a flat config extending `typescript-eslint`'s `recommendedTypeChecked` (type-aware linting) with no project-specific rule overrides — if lint fails, it's the standard typescript-eslint recommended rules, not a custom rule.
