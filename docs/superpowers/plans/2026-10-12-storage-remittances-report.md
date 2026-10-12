# Relatório "Remessas para Depósito" — Plano de Implementação (frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela de filtros "Remessas para Depósito" em Relatórios, que gera o PDF do endpoint `POST /reports/StorageRemittancesByPeriod`.

**Architecture:** Mesma estrutura das telas de relatório por período (`view/reports/shipmentReleases`): view com `SimpleForm` + controller que estende `InvoiceReportController` (JSONModel `params`, POST, PDF em nova aba). Rota `storageRemittancesReport`, que é a chave do item de menu criado pela migration do backend.

**Tech Stack:** OpenUI5 + TypeScript (transpilado pelo middleware do ui5), yarn.

**Spec:** `siagro-b1-backend/docs/superpowers/specs/2026-10-12-storage-remittances-report-design.md`

**Pré-requisito:** plano do backend (`siagro-b1-backend/docs/superpowers/plans/2026-10-12-storage-remittances-report.md`) executado — endpoint, template e migration de menu prontos.

## Global Constraints

- Rótulos em pt-BR; identificadores em inglês.
- Nome da rota = `storageRemittancesReport` (igual ao `MENU_ITEMS.Key`).
- Payload: `FromDate`, `ToDate`, `BranchCode`, `ItemCode`, `CardCode`, `ReturnSituation` (número: 0 Todas, 1 Em aberto, 2 Totalmente retornada), `Detailed` (bool).
- Situação padrão = Todas (0); Detalhado padrão = desmarcado.
- Branch `feature/storage-remittances-report` neste repo; conferir antes de cada commit; nunca push.
- Commits `tipo(escopo): descrição pt-BR`, escopo `reports`, com as linhas `Co-Authored-By`/`Claude-Session` da sessão.

## Review Focus

- `ReturnSituation` precisa chegar como NÚMERO; o Select entrega string, e `"0"` como string quebra o bind do enum no ASP.NET (Task 1, `buildPayload`).
- O `Statuses: ["0","1","3"]` padrão da base não pode ir no payload, para não confundir quem ler o request (Task 1).
- Em SAPB1 o menu some (`StandaloneOnly`); se alguém abrir a URL direto, a mensagem do 400 aparece no MessageBox (Task 2).
- Os números do PDF batem com a seção "Remessa para depósito" da liberação (Task 2).
- Liberação/remessa sem armazém escolhido traz todas as remessas (Task 2).

---

### Task 1: Tela, rota e chamada

**Files:**
- Modify: `webapp/manifest.json` (routes + targets)
- Modify: `webapp/model/ServerRoutes.ts`
- Create: `webapp/view/reports/storageRemittances/Main.view.xml`
- Create: `webapp/controller/reports/storageRemittances/Main.controller.ts`

**Interfaces:**
- Consumes: `POST /reports/StorageRemittancesByPeriod` (backend Task 3); `InvoiceReportController` (`routeName`, `formId`, `serverRoute`, `defaults()`, `buildPayload()`); `openBranchsValueHelp`, `openItemValueHelp`, `openWarehouseValueHelp` do `CommonController`.

As telas de relatório não têm teste unitário (só helpers têm); o gate desta task é typecheck + lint, e o comportamento é verificado na Task 2.

- [ ] **Step 1: Rota e target no `manifest.json`**

Em `sap.ui5.routing.routes`, logo depois da rota `salesShipmentsReport`:

```json
        {
          "pattern": "storage-remittances/report",
          "name": "storageRemittancesReport",
          "target": "storageRemittancesReport"
        },
```

Em `sap.ui5.routing.targets`, logo depois do target `salesShipmentsReport`:

```json
        "storageRemittancesReport": {
          "id": "storageRemittancesReport",
          "level": 1,
          "name": "siagrob1.view.reports.storageRemittances.Main",
          "clearControlAggregation": true
        },
```

- [ ] **Step 2: Rota do servidor**

Em `webapp/model/ServerRoutes.ts`, depois de `salesShipmentsByPeriodReport`:

```ts
  storageRemittancesByPeriodReport: '/reports/StorageRemittancesByPeriod',
```

- [ ] **Step 3: View**

`webapp/view/reports/storageRemittances/Main.view.xml`:

```xml
<mvc:View
	controllerName="siagrob1.controller.reports.storageRemittances.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:f="sap.ui.layout.form"
	xmlns:l="sap.ui.layout">
	<Page title="Remessas para Depósito">
		<f:SimpleForm
			id="storageRemittancesReportForm"
			editable="true"
			layout="ResponsiveGridLayout"
			labelSpanXL="4"
			labelSpanL="4"
			labelSpanM="4"
			labelSpanS="12"
			adjustLabelSpan="false"
			emptySpanXL="0"
			emptySpanL="0"
			emptySpanM="0"
			emptySpanS="0"
			columnsXL="2"
			columnsL="2"
			columnsM="2"
			singleContainerFullSize="false"
			busyIndicatorDelay="0">
			<f:content>
				<core:Title text="Período e situação" emphasized="true"/>
				<core:Fragment fragmentName="siagrob1.view.reports.fragments.ReportDateRangeFilters" type="XML"/>
				<Label text="Situação"/>
				<Select selectedKey="{params>/ReturnSituation}">
					<core:Item key="0" text="Todas"/>
					<core:Item key="1" text="Em aberto"/>
					<core:Item key="2" text="Totalmente retornada"/>
				</Select>
				<Label text="Detalhado"/>
				<CheckBox selected="{params>/Detailed}" text="Listar retornos e romaneios de cada remessa"/>
				<core:Title text="Filtros" emphasized="true"/>
				<core:Fragment fragmentName="siagrob1.view.reports.fragments.InvoiceReportCommonFilters" type="XML"/>
				<Label text="Armazém"/>
				<Input showValueHelp="true" valueHelpOnly="true" valueHelpRequest=".openWarehouseValueHelp" value="{params>/CardCode}">
					<layoutData><l:GridData span="XL3 L3 M3 S12"/></layoutData>
					<customData>
						<core:CustomData key="descriptionProperty" value="CardName:Name"/>
					</customData>
				</Input>
				<Input value="{params>/CardName}" editable="false">
					<layoutData><l:GridData span="XL5 L5 M5 S12"/></layoutData>
				</Input>
			</f:content>
		</f:SimpleForm>
		<footer>
			<OverflowToolbar>
				<ToolbarSpacer/>
				<Button text="Imprimir" type="Emphasized" press=".onPrintReport"/>
			</OverflowToolbar>
		</footer>
	</Page>
</mvc:View>
```

(`SimpleForm` segue as demais telas de relatório; não migrar só esta para `Form`.)

- [ ] **Step 4: Controller**

`webapp/controller/reports/storageRemittances/Main.controller.ts`:

```ts
import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Remessas para Depósito (só STANDALONE — o menu some em SAPB1). Situação de retorno:
 * 0 Todas, 1 Em aberto (A retornar > 0), 2 Totalmente retornada. Detalhado lista, abaixo de cada
 * remessa, os retornos e os romaneios de carregamento com o retorno reconciliado.
 * @namespace siagrob1.controller.reports.storageRemittances
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "storageRemittancesReport";
	protected readonly formId = "storageRemittancesReportForm";
	protected readonly serverRoute = ServerRoutes.storageRemittancesByPeriodReport;

	protected defaults() {
		return { ReturnSituation: "0", Detailed: false, CardCode: "", CardName: "" };
	}

	/** Este relatório não filtra situação do documento nem da NF-e; a situação aqui é a de retorno. */
	protected buildPayload() {
		const data = super.buildPayload();
		delete data.Statuses;
		delete data.NfeStatuses;
		delete data.CardName;
		data.ReturnSituation = Number(data.ReturnSituation ?? 0);
		data.Detailed = data.Detailed === true;
		return data;
	}
}
```

- [ ] **Step 5: Gates**

Run (em `siagro-b1-frontend/`): `yarn ts-typecheck` e depois `yarn lint`
Expected: 0 erros nos dois (avisos antigos de outros arquivos não contam; nada novo nos 4 arquivos desta task).

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # feature/storage-remittances-report
git add webapp/manifest.json webapp/model/ServerRoutes.ts webapp/view/reports/storageRemittances/Main.view.xml webapp/controller/reports/storageRemittances/Main.controller.ts
git commit -m "feat(reports): tela do relatório de remessas para depósito"
```
(corpo pt-BR + linhas de atribuição.)

---

### Task 2: Verificação pelo caminho do usuário (CEAGUI dev)

**Files:** nenhum (só verificação). Se algo falhar, corrigir na task dona (backend ou Task 1) com teste e commit próprios.

- [ ] **Step 1: Aplicar a migration de menu na CEAGUI dev — e só nela**

Em `siagro-b1-backend/` (PowerShell):

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Ceagui-Development'; dotnet ef database update AddStorageRemittancesReportMenu --context CommonDbContext --project SiagroB1.Migrations --startup-project SiagroB1.Web
```
Expected: aplica só `AddStorageRemittancesReportMenu` em `CEAGUI_SIAGRO_COMMON_DEV`. Se listar outras migrations pendentes, PARE e pergunte ao usuário.

- [ ] **Step 2: Subir a stack com o profile `ceagui`**

`dotnet run --project SiagroB1.Web --launch-profile ceagui`, idem `SiagroB1.Gateway` e `SiagroB1.Reports` (em background); frontend `yarn start:dev` (se a 8080 estiver ocupada pelo EfisCloud, `npx ui5 serve --port 8090` com o mesmo proxy). Login `admin` / `1234`.

- [ ] **Step 3: Conferir pela tela**

1. A home → menu Relatórios → "Remessas para Depósito" aparece e abre a tela.
2. Período 01/10/2026–31/10/2026, Situação Todas, sem Detalhado → Imprimir: PDF com as remessas da CEAGUI dev (DS000175, DS000176 etc.) e total geral.
3. Abrir em outra aba a liberação de cada remessa (seção "Remessa para depósito") e conferir Remetido / Retornado / A retornar / Expedido sem retorno, número a número.
4. Detalhado marcado → retornos (DE000026) e romaneios (RM000048–051) sob a remessa certa, com "retorno …" ou "sem retorno".
5. Situação "Em aberto" e "Totalmente retornada" → cada remessa cai em uma só das duas.
6. Armazém escolhido no value help → só as remessas daquele PN, e o nome aparece na linha de filtros.
7. Data final anterior à inicial → MessageBox com "A data final não pode ser anterior à inicial.".

- [ ] **Step 4: Derrubar a stack por PID**

Parar Web/Gateway/Reports/dev server e conferir as portas (50000, 5246, 8081/58000, 8080/8090) com `Get-NetTCPConnection -LocalPort <p> -State Listen` → `Stop-Process -Id <pid> -Force`. Conferir de novo no fim (o file watcher pode ressuscitar processos). Nunca `taskkill /IM node.exe`.

- [ ] **Step 5: Relatar** ao usuário o que foi verificado, com os números conferidos, e o que ficou de fora (SAPB1 não se aplica).
