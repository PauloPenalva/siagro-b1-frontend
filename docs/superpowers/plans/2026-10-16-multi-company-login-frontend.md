# Seleção de Empresa no Login — Plano de Implementação (frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela de login com seletor de Empresa (como no SAP B1), "Trocar Empresa" no menu do avatar, coluna Empresa nos perfis do usuário e uma tela de cadastro de Empresas com teste de conexão.

**Architecture:** Nada muda no transporte: a empresa viaja no cookie de sessão que o backend já valida, então os ~30 pontos de `fetch`/`jQuery.ajax` e o `EventSource` ficam intactos. O frontend só (1) manda `CompanyCode` no `POST /security/auth/login`, (2) lê `companyCode`/`companyName` do `/login` e do `/status`, (3) ganha a tela `companies` e a coluna Empresa nos perfis. O título do ShellBar já é o `companyName` de `/security/auth/info`, que o backend passa a devolver por sessão.

**Tech Stack:** OpenUI5 1.141 + TypeScript, OData v4 (`ODataModel`), `RequestModel` (jQuery) para `/security`, QUnit para os helpers.

**Spec:** `../siagro-b1-backend/docs/superpowers/specs/2026-10-16-multi-company-login-design.md` (backend: `docs/superpowers/plans/2026-10-16-multi-company-login-backend.md`)

## Global Constraints

- Identificadores em inglês; textos do usuário em pt-BR, hardcoded nas views como nas demais telas de cadastro (não há i18n nelas).
- Branch `feature/multi-company-login` (já criada). `git add` em todo arquivo novo logo após criado. Commits conforme `CLAUDE.md` do repo. **Nunca push.**
- Respostas REST de `/security` chegam em **camelCase** (`code`, `companyName`); entidades OData chegam em **PascalCase** (`Code`, `CompanyName`). Tipar cada uma do seu jeito.
- Novo endpoint vai em `webapp/model/ServerRoutes.ts`, nunca hardcoded no controller.
- Gates: `yarn ts-typecheck && yarn lint && yarn ui5lint` após cada tarefa; testes unitários pela URL do runner (`yarn start` → `http://localhost:8080/test/Test.qunit.html?testsuite=test-resources/siagrob1/testsuite.qunit&test=unit/unitTests`). O `yarn test` completo tem um gate de cobertura que a suíte nunca atingiu — rode-o, mas o critério é lint + typecheck + unit verdes.
- Depende do backend desta mesma branch rodando (Gateway em `localhost:5246`): `GET /security/auth/companies`, `POST /security/auth/login` com `CompanyCode`, `status`/`info` com `companyCode`/`companyName`, entity set `Companies` (string de conexão mascarada), action `CompaniesTestConnection(Code, ConnectionString)`, `UsersProfiles.CompanyCode`.

## Review Focus

1. **Lista de empresas indisponível no login** (Gateway ainda subindo) — a tela tem de continuar deixando logar; com uma só empresa o servidor a escolhe. Teste do helper em Task 1 (`pickInitialCompany` com lista vazia) e tratamento no controller em Task 2.
2. **Última empresa lembrada não existe mais** (excluída) — pré-seleciona a primeira, não deixa o Select vazio. Teste em Task 1.
3. **POST do login levando a lista de empresas no corpo** — montar o objeto de credenciais explicitamente, nunca `authModel.getData()`. Task 2.
4. **Código digitado no cadastro novo virando somente leitura no meio da digitação** (binding `editable="{= !${Code} }"`) — flag de tela por controller. Task 5.
5. **Perfil criado sem empresa** no usuário — o `create` da linha já leva a empresa da sessão como padrão. Task 4.

---

### Task 1: Rotas, tipos, helpers de seleção e `SessionService`

**Files:**
- Modify: `webapp/model/ServerRoutes.ts`
- Create: `webapp/types/Company.ts`
- Modify: `webapp/types/UserIdentity.ts`
- Modify: `webapp/types/SystemInfo.ts`
- Create: `webapp/helpers/CompanySelectionHelpers.ts`
- Modify: `webapp/services/SessionService.ts`
- Test: `webapp/test/unit/helpers/CompanySelectionHelpers.qunit.ts`
- Modify: `webapp/test/unit/unitTests.qunit.ts`

**Interfaces:**
- Produces:
  - `ServerRoutes.loginCompanies = '/security/auth/companies'`, `ServerRoutes.companies = '/odata/Companies'`, `ServerRoutes.companiesTestConnection = '/CompaniesTestConnection(...)'`
  - `type CompanyOption = { code: string; companyName: string }`; `type Company = { Code; CompanyName; ConnectionString; SapCompanyDb? }`; `type CompanyTestConnectionResult = { Success; Message; Server; Database; PendingMigrations }`
  - `UserIdentity.companyCode?`, `UserIdentity.companyName?`; `SystemInfo.companyCode?`
  - `CompanySelectionHelpers`: `LAST_COMPANY_KEY`, `pickInitialCompany(companies, lastCode)`, `shouldShowCompanySelect(companies)`, `rememberCompany(code)`, `recallCompany()`
  - `SessionService.loadLoginCompanies(): Promise<CompanyOption[]>`; `Credentials.CompanyCode?: string`; `sessionModel>/companyCode`, `sessionModel>/companyName`

- [ ] **Step 1: Escrever o teste dos helpers (falha: módulo não existe)**

`webapp/test/unit/helpers/CompanySelectionHelpers.qunit.ts`:
```ts
import {
	LAST_COMPANY_KEY,
	pickInitialCompany,
	recallCompany,
	rememberCompany,
	shouldShowCompanySelect
} from "siagrob1/helpers/CompanySelectionHelpers";
import { CompanyOption } from "siagrob1/types/Company";

const CEAGUI: CompanyOption = { code: "0001", companyName: "CEAGUI" };
const LM: CompanyOption = { code: "0002", companyName: "LM CEREAIS" };

QUnit.module("CompanySelectionHelpers - seletor de empresa do login", {
	beforeEach: () => window.localStorage.removeItem(LAST_COMPANY_KEY),
	afterEach: () => window.localStorage.removeItem(LAST_COMPANY_KEY)
});

QUnit.test("pickInitialCompany prefere a última empresa usada, se ela ainda existir", function (assert) {
	assert.strictEqual(pickInitialCompany([CEAGUI, LM], "0002"), "0002");
	assert.strictEqual(pickInitialCompany([CEAGUI, LM], "9999"), "0001", "empresa lembrada que sumiu: cai na primeira");
	assert.strictEqual(pickInitialCompany([CEAGUI, LM], null), "0001");
	assert.strictEqual(pickInitialCompany([LM], undefined), "0002");
});

QUnit.test("pickInitialCompany devolve vazio sem empresas (lista indisponível ainda deixa logar)", function (assert) {
	assert.strictEqual(pickInitialCompany([], "0001"), "");
	assert.strictEqual(pickInitialCompany(undefined, "0001"), "");
});

QUnit.test("shouldShowCompanySelect só com mais de uma empresa", function (assert) {
	assert.strictEqual(shouldShowCompanySelect([CEAGUI, LM]), true);
	assert.strictEqual(shouldShowCompanySelect([CEAGUI]), false);
	assert.strictEqual(shouldShowCompanySelect([]), false);
	assert.strictEqual(shouldShowCompanySelect(undefined), false);
});

QUnit.test("rememberCompany/recallCompany guardam a última empresa no localStorage", function (assert) {
	assert.strictEqual(recallCompany(), null);
	rememberCompany("0002");
	assert.strictEqual(recallCompany(), "0002");
	rememberCompany(undefined);
	assert.strictEqual(recallCompany(), "0002", "código vazio não apaga a lembrança");
});
```
Registrar em `webapp/test/unit/unitTests.qunit.ts`: `import "./helpers/CompanySelectionHelpers.qunit";`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `yarn ts-typecheck`
Expected: erro "Cannot find module 'siagrob1/helpers/CompanySelectionHelpers'".

- [ ] **Step 3: Tipos e rotas**

`webapp/types/Company.ts`:
```ts
/** Item de `/security/auth/companies` (endpoint anônimo e REST: só código e nome, em camelCase). */
export type CompanyOption = {
  code: string;
  companyName: string;
};

/** Entidade OData `Companies`. A string de conexão chega MASCARADA do servidor; devolvê-la mascarada mantém a senha gravada. */
export type Company = {
  Code: string;
  CompanyName: string;
  ConnectionString: string;
  SapCompanyDb?: string | null;
};

/** Retorno da action `CompaniesTestConnection`. */
export type CompanyTestConnectionResult = {
  Success: boolean;
  Message: string;
  Server: string;
  Database: string;
  PendingMigrations: string[];
};
```

`webapp/types/UserIdentity.ts` — em `UserIdentity`, acrescentar:
```ts
  /** Empresa da sessão (spec 2026-10-16). O código é o padrão do perfil novo na tela de usuários. */
  companyCode?: string;
  companyName?: string;
```
`webapp/types/SystemInfo.ts` — acrescentar `companyCode?: string,` após `companyName`.

`webapp/model/ServerRoutes.ts` — após `userMenu`:
```ts
  // Seleção de empresa no login (spec 2026-10-16). Anônimo: a tela ainda não tem sessão.
  loginCompanies: '/security/auth/companies',
```
e, junto de `menuItems`/`permissions`:
```ts
  // Cadastro de empresas (bancos do deploy) e teste da string de conexão (action via bindContext).
  companies: '/odata/Companies',
  companiesTestConnection: '/CompaniesTestConnection(...)',
```

- [ ] **Step 4: Helpers**

`webapp/helpers/CompanySelectionHelpers.ts`:
```ts
import { CompanyOption } from "siagrob1/types/Company";

/**
 * Última empresa escolhida nesta máquina. Sobrevive ao logout de propósito, como o tema: é
 * conveniência do navegador para o próximo login, não dado de sessão.
 */
export const LAST_COMPANY_KEY = "LAST_COMPANY";

/** Empresa pré-selecionada: a última usada, se ainda existir na lista; senão a primeira; vazio sem lista. */
export function pickInitialCompany(companies: CompanyOption[] | undefined, lastCode: string | null | undefined): string {
  if (!companies?.length) {
    return "";
  }

  const last = companies.find(company => company.code === lastCode);

  return (last ?? companies[0]).code;
}

/** O seletor só aparece quando há escolha a fazer; com uma empresa o servidor a escolhe sozinho. */
export function shouldShowCompanySelect(companies: CompanyOption[] | undefined): boolean {
  return (companies?.length ?? 0) > 1;
}

export function rememberCompany(code: string | undefined | null): void {
  if (!code) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_COMPANY_KEY, code);
  } catch {
    // Storage bloqueado (janela privada): só perde a conveniência.
  }
}

export function recallCompany(): string | null {
  try {
    return window.localStorage.getItem(LAST_COMPANY_KEY);
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: `SessionService`**

```ts
import { CompanyOption } from "siagrob1/types/Company";
import { rememberCompany } from "siagrob1/helpers/CompanySelectionHelpers";
// ...
export type Credentials = {
  Username: string;
  Password: string;
  /** Empresa escolhida na tela. Ausente só quando há uma única empresa (o servidor a escolhe). */
  CompanyCode?: string;
};
```
Novo método (seção Autenticação):
```ts
  /** Empresas do seletor da tela de login. Endpoint anônimo. */
  public async loadLoginCompanies(): Promise<CompanyOption[]> {
    const companies = await new RequestModel().get<CompanyOption[]>(ServerRoutes.loginCompanies);

    return companies ?? [];
  }
```
Em `login()`, após `this.applyUserIdentity(result?.user, result?.passwordRequirements);`:
```ts
    // Lembra a empresa para o próximo login nesta máquina (a do servidor, que é a que valeu).
    rememberCompany(result?.user?.companyCode ?? credentials.CompanyCode);
```
Em `applyUserIdentity`, após `/email`:
```ts
    sessionModel.setProperty("/companyCode", identity?.companyCode ?? null);
    sessionModel.setProperty("/companyName", identity?.companyName ?? null);
```
(`clearSessionState` já chama `applyUserIdentity(undefined)`, que zera os dois; o `localStorage` da última empresa fica, de propósito.)

- [ ] **Step 6: Rodar gates e o teste**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint` → sem erros.
Run: `yarn start` e abrir a URL do runner de unit tests → módulo `CompanySelectionHelpers` verde.

- [ ] **Step 7: Commit**

```bash
git add webapp/model/ServerRoutes.ts webapp/types/Company.ts webapp/types/UserIdentity.ts webapp/types/SystemInfo.ts webapp/helpers/CompanySelectionHelpers.ts webapp/services/SessionService.ts webapp/test/unit/helpers/CompanySelectionHelpers.qunit.ts webapp/test/unit/unitTests.qunit.ts
git commit -m "feat(security): sessão conhece a empresa e o login lembra a última usada

Base da seleção de empresa no login (spec 2026-10-16): rota anônima das
empresas, empresa na identidade da sessão e a lembrança da última escolhida
nesta máquina, que sobrevive ao logout como o tema.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Tela de login com seletor de Empresa

**Files:**
- Modify: `webapp/view/login/Main.view.xml`
- Modify: `webapp/controller/login/Main.controller.ts`

**Interfaces:**
- Consumes: `SessionService.loadLoginCompanies()`, `Credentials.CompanyCode`, helpers da Task 1.
- Produces: modelo de view `auth` com `{ Username, Password, CompanyCode, Companies, showCompanySelect }`.

- [ ] **Step 1: View**

Em `webapp/view/login/Main.view.xml`, dentro do `<VBox>` interno, **antes** de `<Label text="Usuário:" required="true"/>`:
```xml
                  <Label text="Empresa:" required="true" visible="{auth>/showCompanySelect}"/>
                  <Select
                    id="companySelect"
                    width="250px"
                    selectedKey="{auth>/CompanyCode}"
                    items="{auth>/Companies}"
                    forceSelection="true"
                    visible="{auth>/showCompanySelect}">
                    <core:Item key="{auth>code}" text="{auth>companyName}"/>
                  </Select>
```
(o namespace `core` já está declarado na view.)

- [ ] **Step 2: Controller**

`webapp/controller/login/Main.controller.ts`:
```ts
import { BaseController } from "./BaseController";
import formatter from "siagrob1/model/formatter";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import SessionService, { Credentials } from "siagrob1/services/SessionService";
import { pickInitialCompany, recallCompany, shouldShowCompanySelect } from "siagrob1/helpers/CompanySelectionHelpers";
import { CompanyOption } from "siagrob1/types/Company";

type AuthViewModel = {
  Username: string;
  Password: string;
  CompanyCode: string;
  Companies: CompanyOption[];
  showCompanySelect: boolean;
};

/**
 * @namespace siagrob1.controller.login
 */
export default class Main extends BaseController {
  formatter = { ...formatter }

	onInit(): void {
		this.getRouter().getRoute("login").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
    if (SessionService.isAuthenticated()) {
      this.navTo("main");
      return;
    }

    SessionService.clearSessionState();

		const authModel = new JSONModel({
      Username: "",
      Password: "",
      CompanyCode: "",
      Companies: [],
      showCompanySelect: false
    } satisfies AuthViewModel);

    this.getView().setModel(authModel, "auth");

    void this.loadCompanies(authModel);
	}

  /**
   * Como no SAP B1: escolhe-se a empresa antes das credenciais. A lista vem primeiro e a seleção
   * depois (um Select com selectedKey antes dos itens renderiza vazio). Falha ao carregar não
   * impede o login: com uma única empresa o servidor a escolhe sozinho.
   */
  private async loadCompanies(authModel: JSONModel): Promise<void> {
    try {
      const companies = await SessionService.loadLoginCompanies();

      authModel.setProperty("/Companies", companies);
      authModel.setProperty("/CompanyCode", pickInitialCompany(companies, recallCompany()));
      authModel.setProperty("/showCompanySelect", shouldShowCompanySelect(companies));
    } catch (error) {
      console.warn("Falha ao carregar as empresas para o login.", error);
    }
  }

  onForgotPassword(): void {
    this.navTo("forgotPassword");
  }

  async onLogin() {
    const authModel = this.getView().getModel("auth") as JSONModel;
    const data = authModel.getData() as AuthViewModel;

    if (!data.Username || !data.Password){
      MessageBox.warning("Informe seu usuário e senha.")
      return;
    }

    if (data.showCompanySelect && !data.CompanyCode) {
      MessageBox.warning("Selecione a empresa.");
      return;
    }

    // Objeto explícito: o modelo da view carrega a lista de empresas, que não pode ir no POST.
    const credentials: Credentials = {
      Username: data.Username,
      Password: data.Password,
      CompanyCode: data.CompanyCode || undefined
    };

    try {
      this.setBusy(true);

      await SessionService.login(credentials);

      this.navTo("main");
    } catch (error) {
      const err = error as JQuery.jqXHR;
      MessageBox.error("Falha ao efetuar login: \n" + (err.responseJSON as { message?: string })?.message);
    } finally {
      this.setBusy(false);
    }
  }
}
```

- [ ] **Step 3: Gates e verificação no navegador**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint` → sem erros.
Com o backend da branch no ar e duas empresas em `COMPANIES`: abrir `http://localhost:8080`, o Select aparece com as duas; com uma só, não aparece. Logar em "LM CEREAIS"; sair; voltar ao login → "LM CEREAIS" pré-selecionada. Derrubar o Gateway, recarregar o login → sem Select, campos de usuário/senha continuam utilizáveis.

- [ ] **Step 4: Commit**

```bash
git add webapp/view/login/Main.view.xml webapp/controller/login/Main.controller.ts
git commit -m "feat(security): seletor de empresa na tela de login

Como no SAP B1, o usuário escolhe a empresa antes de informar usuário e senha
(spec 2026-10-16). O seletor só aparece com mais de uma empresa e lembra a
última usada nesta máquina.

Atenção: as credenciais são montadas à mão — o modelo da view carrega a
lista de empresas, que não pode ir no corpo do POST.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: "Trocar Empresa" no menu do avatar

**Files:**
- Modify: `webapp/fragments/UserMenu.fragment.xml`
- Modify: `webapp/controller/App.controller.ts`

**Interfaces:**
- Consumes: `SessionService.logout()`, `DialogHelper.confirmDialog(title, message?)`.

- [ ] **Step 1: Fragment**

Em `webapp/fragments/UserMenu.fragment.xml`, após o item "Trocar Filial":
```xml
			<StandardListItem icon="sap-icon://building" title="Trocar Empresa" type="Active" press=".onChangeCompany" />
```

- [ ] **Step 2: Controller**

Em `webapp/controller/App.controller.ts`, logo após `onChangeBranch()`:
```ts
  /**
   * Trocar de empresa é sair e entrar de novo (decisão da spec 2026-10-16): sessão, menu, caches
   * locais e o modelo OData são todos da empresa — trocá-la "por dentro" exigiria recarregar tudo
   * isso, e o login já lembra a última empresa escolhida.
   */
  async onChangeCompany(): Promise<void> {
    this._avatarPopover?.close();

    if (!await DialogHelper.confirmDialog("Para trocar de empresa é preciso sair e entrar novamente. Continuar?", "Trocar Empresa")) {
      return;
    }

    try {
      this.setBusy(true);
      await SessionService.logout();
    } finally {
      this.setBusy(false);
    }
  }
```

- [ ] **Step 3: Gates e verificação**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint` → sem erros.
Navegador: avatar → "Trocar Empresa" → confirmar → volta ao login com a empresa anterior pré-selecionada; "Cancelar" mantém a sessão.

- [ ] **Step 4: Commit**

```bash
git add webapp/fragments/UserMenu.fragment.xml webapp/controller/App.controller.ts
git commit -m "feat(security): opção Trocar Empresa no menu do avatar

Encerra a sessão e volta ao login com a última empresa pré-selecionada —
trocar de empresa por dentro exigiria recarregar sessão, menu, caches e o
modelo OData (spec 2026-10-16).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Coluna Empresa nos perfis do usuário

**Files:**
- Modify: `webapp/view/users/fragments/Profiles.fragment.xml`
- Modify: `webapp/controller/users/BaseController.ts`
- Modify: `webapp/controller/common/CommonController.ts`
- Create: `webapp/dialogs/fragments/CompaniesSelectDialog.fragment.xml`

**Interfaces:**
- Consumes: `sessionModel>/companyCode` (Task 1); OData `UsersProfiles.CompanyCode` + nav `Company` (backend); `applyValueHelp(ev, name, filters, property)`.
- Produces: `CommonController.openCompaniesValueHelp(ev)`; fragment `CompaniesSelectDialog`.

- [ ] **Step 1: Diálogo de seleção de empresas**

`webapp/dialogs/fragments/CompaniesSelectDialog.fragment.xml`:
```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
>

<TableSelectDialog
  class=" sapUiSizeCompact"
  growing="true"
  growingThreshold="20"
  items="{
    path: '/Companies',
    sorter: {
      path: 'Code',
      descending: false
    }
  }"
  rememberSelections="true"
  title="Empresas"
>
<columns>
  <Column>
    <header>
      <Text text="Código" />
    </header>
  </Column>
  <Column>
    <header>
      <Text text="Nome" />
    </header>
  </Column>
</columns>
<ColumnListItem >
  <cells>
    <Text text="{Code}" />
    <Text text="{CompanyName}" />
  </cells>
</ColumnListItem>
</TableSelectDialog>
</core:FragmentDefinition>
```

- [ ] **Step 2: Value help no `CommonController`**

Após `openProfilesValueHelp` em `webapp/controller/common/CommonController.ts`:
```ts
  /** Empresas do deploy (COMMON). Só administradores abrem a tela de usuários, então a lista é visível aqui. */
  openCompaniesValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "CompaniesSelectDialog", ["Code", "CompanyName"], "Code");
  }
```

- [ ] **Step 3: Coluna no fragment de perfis**

Em `webapp/view/users/fragments/Profiles.fragment.xml`, **antes** da coluna "Codigo":
```xml
      <t:Column label="Empresa" width="12rem">
        <t:template>
          <Input
            width="10rem"
            required="true"
            value="{CompanyCode}"
            showValueHelp="true"
            valueHelpOnly="true"
            valueHelpRequest=".openCompaniesValueHelp">
            <customData>
              <core:CustomData key="descriptionProperty" value="Company/CompanyName" />
            </customData>
          </Input>
        </t:template>
      </t:Column>
      <t:Column label="Nome da Empresa" width="14rem">
        <t:template>
          <Text text="{Company/CompanyName}" />
        </t:template>
      </t:Column>
```
(`autoExpandSelect: true` no manifest traz `Company/CompanyName` junto da linha.)

- [ ] **Step 4: Padrão da empresa ao incluir perfil**

Em `webapp/controller/users/BaseController.ts`, `onAddProfile()`:
```ts
  /**
   * O perfil nasce na empresa da SESSÃO de quem cadastra: é o caso comum (o admin da CEAGUI
   * cadastra gente da CEAGUI) e evita uma linha sem empresa, que o servidor recusaria.
   */
  onAddProfile() {
    const oTable = this.byId("usersProfilesTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    const companyCode = this.getView().getModel("sessionModel")?.getProperty("/companyCode") as string | undefined;

    oBinding.create(companyCode ? { CompanyCode: companyCode } : {}, false, true, false);
  }
```

- [ ] **Step 5: Gates e verificação**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint` → sem erros.
Navegador (admin): Usuários → editar → Perfis → Incluir: a linha já vem com a empresa da sessão; value help lista as empresas; trocar para `0002`, escolher perfil, salvar; mesma dupla perfil+empresa de novo → erro "Este perfil já está atribuído ao usuário nesta empresa."

- [ ] **Step 6: Commit**

```bash
git add webapp/view/users/fragments/Profiles.fragment.xml webapp/controller/users/BaseController.ts webapp/controller/common/CommonController.ts webapp/dialogs/fragments/CompaniesSelectDialog.fragment.xml
git commit -m "feat(security): perfil do usuário é por empresa

A aba Perfis ganha a coluna Empresa: ter ao menos um perfil numa empresa é o
que autoriza o login nela (spec 2026-10-16). A linha nova nasce na empresa da
sessão de quem cadastra.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Tela "Empresas" (lista, cadastro, edição, teste de conexão)

**Files:**
- Create: `webapp/view/companies/Main.view.xml`
- Create: `webapp/view/companies/Add.view.xml`
- Create: `webapp/view/companies/Edit.view.xml`
- Create: `webapp/view/companies/fragments/Form.fragment.xml`
- Create: `webapp/controller/companies/BaseController.ts`
- Create: `webapp/controller/companies/Main.controller.ts`
- Create: `webapp/controller/companies/Add.controller.ts`
- Create: `webapp/controller/companies/Edit.controller.ts`
- Modify: `webapp/manifest.json` (rotas e targets, ao lado de `docNumbers`)

**Interfaces:**
- Consumes: `ServerRoutes.companiesTestConnection`, tipos `Company`/`CompanyTestConnectionResult` (Task 1); entity set `/Companies` e action `CompaniesTestConnection` (backend). Rota `companies` **= key do menu** `companies` da migration `AddCompaniesMenu`.
- Produces: rotas `companies` (`companies`), `companiesNew` (`companies/new`), `companiesEdit` (`companies/{id}/edit`); modelo de view `screen` com `{ codeEditable }`.

- [ ] **Step 1: Rotas e targets no `manifest.json`**

Após a rota `docNumbersEdit`:
```json
        {
          "pattern": "companies",
          "name": "companies",
          "target": "companies"
        },
        {
          "pattern": "companies/new",
          "name": "companiesNew",
          "target": "companiesNew"
        },
        {
          "pattern": "companies/{id}/edit",
          "name": "companiesEdit",
          "target": "companiesEdit"
        },
```
Após o target `docNumbersEdit`:
```json
        "companies": {
          "id": "companies",
          "level": 1,
          "name": "siagrob1.view.companies.Main",
          "clearControlAggregation": true
        },
        "companiesNew": {
          "id": "companiesNew",
          "level": 2,
          "name": "siagrob1.view.companies.Add",
          "clearControlAggregation": true
        },
        "companiesEdit": {
          "id": "companiesEdit",
          "level": 2,
          "name": "siagrob1.view.companies.Edit",
          "clearControlAggregation": true
        },
```

- [ ] **Step 2: Views**

`webapp/view/companies/Main.view.xml`:
```xml
<mvc:View
	controllerName="siagrob1.controller.companies.Main"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core"
	xmlns:t="sap.ui.table">

	<Page showHeader="true" title="Empresas">
		<content>
			<t:Table
				id="companiesTable"
				busyIndicatorDelay="0"
				selectionMode="Single"
				selectionBehavior="Row"
				class="sapUiSizeCondensed"
				visibleRowCountMode="Auto"
				enableBusyIndicator="true"
				alternateRowColors="true"
				rows="{
					path: '/Companies'
				}"
			>
				<t:extension>
					<OverflowToolbar >
						<ToolbarSpacer />
						<SearchField placeholder="Pesquisar..." width="30%" search=".onSearch"/>
					</OverflowToolbar>
				</t:extension>
				<t:columns>
					<t:Column label="Código" sortProperty="Code" filterProperty="Code" width="6rem">
						<t:template>
							<Text text="{Code}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Nome" sortProperty="CompanyName" filterProperty="CompanyName" width="20rem">
						<t:template>
							<Text text="{CompanyName}" wrapping="false"/>
						</t:template>
					</t:Column>
					<t:Column label="Banco de dados (string de conexão)">
						<t:template>
							<Text text="{ConnectionString}" wrapping="false"/>
						</t:template>
					</t:Column>
				</t:columns>
			</t:Table>
		</content>
    <footer>
			<OverflowToolbar>
				<Button text="Atualizar" icon="sap-icon://refresh" press=".onRefresh" />
				<ToolbarSpacer />
				<Button text="Incluir" icon="sap-icon://add" type="Emphasized" press=".onCreate"/>
				<Button text="Editar" icon="sap-icon://edit" press=".onEdit"/>
				<Button text="Deletar" icon="sap-icon://delete" press=".onDelete"/>
			</OverflowToolbar>
		</footer>
	</Page>

</mvc:View>
```

`webapp/view/companies/Add.view.xml`:
```xml
<mvc:View
	controllerName="siagrob1.controller.companies.Add"
	displayBlock="true"
	xmlns="sap.m"
	xmlns:mvc="sap.ui.core.mvc"
	xmlns:core="sap.ui.core">

	<Page showHeader="true" title="Nova Empresa" busy="{ui>/busy}" busyIndicatorDelay="0">
		<content>
			<core:Fragment fragmentName="siagrob1.view.companies.fragments.Form" type="XML" />
		</content>
		<footer>
			<Toolbar>
				<Button text="Testar conexão" icon="sap-icon://connected" press=".onTestConnection"/>
				<ToolbarSpacer />
				<Button text="Cancelar" press=".onCancel"  />
				<Button text="Salvar" type="Emphasized" press=".onSave"/>
			</Toolbar>
		</footer>
	</Page>

</mvc:View>
```

`webapp/view/companies/Edit.view.xml`: igual ao Add, com `controllerName="siagrob1.controller.companies.Edit"` e `title="Editar Empresa"`.

`webapp/view/companies/fragments/Form.fragment.xml`:
```xml
<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:f="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
>
    <f:SimpleForm
      id="companiesForm"
      editable="true"
      layout="ResponsiveGridLayout"
      labelSpanXL="3"
      labelSpanL="3"
      labelSpanM="4"
      labelSpanS="12"
      adjustLabelSpan="false"
      emptySpanXL="0"
      emptySpanL="0"
      emptySpanM="0"
      emptySpanS="0"
      columnsXL="1"
      columnsL="1"
      columnsM="1"
      singleContainerFullSize="true"
      busyIndicatorDelay="0"
    >
        <f:content>
            <core:Title text="Dados da Empresa" emphasized="true" />
            <Label text="Código" />
            <Input
                value="{Code}"
                maxLength="4"
                width="8rem"
                required="true"
                editable="{screen>/codeEditable}"
                placeholder="0002"
                liveChange=".validateField"
            />
            <Label text="Nome" />
            <Input value="{CompanyName}" required="true" maxLength="100" liveChange=".validateField" />
            <Label text="String de conexão" />
            <TextArea
                value="{ConnectionString}"
                required="true"
                rows="3"
                growing="true"
                maxLength="500"
                placeholder="Server=servidor;Database=EMPRESA_SIAGRO;User Id=usuario;Password=senha;TrustServerCertificate=True"
                liveChange=".validateField"
            />
            <Label text="Banco no SAP B1" visible="{= ${sessionModel>/erp} === 'SAPB1' }" />
            <Input value="{SapCompanyDb}" maxLength="100" visible="{= ${sessionModel>/erp} === 'SAPB1' }" />
            <Label text="" />
            <Text text="O banco precisa existir e estar com as migrations aplicadas (dotnet ef database update --context AppDbContext --connection &quot;...&quot;) antes do cadastro. A senha volta mascarada (*****) na edição: deixe assim para mantê-la." class="sapUiTinyMarginTop" />
        </f:content>
    </f:SimpleForm>
</core:FragmentDefinition>
```

- [ ] **Step 3: Controllers**

`webapp/controller/companies/BaseController.ts`:
```ts
import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { CompanyTestConnectionResult } from "siagrob1/types/Company";

export abstract class BaseController extends CommonController {

  /** Flags da tela: o código só é editável no cadastro novo (é a chave que sessões, perfis e jobs carregam). */
  protected setScreenModel(codeEditable: boolean): void {
    this.getView().setModel(new JSONModel({ codeEditable }), "screen");
  }

  /**
   * Testa a string digitada no servidor. No cadastro novo o contexto é transitório e não manda o
   * código; na edição manda, para o servidor fundir a senha mascarada com a gravada.
   */
  async onTestConnection(): Promise<void> {
    const oContext = this.getView().getBindingContext() as Context;
    const connectionString = oContext?.getProperty("ConnectionString") as string;

    if (!connectionString) {
      MessageBox.warning("Informe a string de conexão.");
      return;
    }

    const code = oContext.isTransient() ? null : (oContext.getProperty("Code") as string);
    const oModel = this.getModel() as ODataModel;
    const action = oModel.bindContext(ServerRoutes.companiesTestConnection);

    action.setParameter("Code", code);
    action.setParameter("ConnectionString", connectionString);

    try {
      this.setBusy(true);

      await action.invoke();

      const result = action.getBoundContext().getObject() as CompanyTestConnectionResult;
      const details = [
        result.Server ? `Servidor: ${result.Server}` : "",
        result.Database ? `Banco: ${result.Database}` : "",
        ...(result.PendingMigrations?.length ? ["", "Migrations pendentes:", ...result.PendingMigrations] : [])
      ].filter(line => line !== undefined).join("\n");

      if (result.Success) {
        MessageBox.success(`${result.Message}\n\n${details}`, { title: "Testar conexão" });
      } else {
        MessageBox.error(`${result.Message}\n\n${details}`, { title: "Testar conexão" });
      }
    } catch (error) {
      MessageBox.error("Falha ao testar a conexão: " + ((error as Error)?.message ?? ""));
    } finally {
      this.setBusy(false);
    }
  }
}
```

`webapp/controller/companies/Main.controller.ts`:
```ts
import { SearchField$SearchEvent } from "sap/m/SearchField";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.companies
 */
export default class Main extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("companies").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void {
		(this.getView().byId("companiesTable").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Code", FilterOperator.Contains, query),
				new Filter("CompanyName", FilterOperator.Contains, query),
 			],
			and: false,
		});

		(this.getView().byId("companiesTable").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
		this.navTo("companiesNew");
	}

	onEdit(): void {
		const oTable = this.byId("companiesTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Code") as string;

		this.navTo("companiesEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("companiesTable") as Table;

    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    const oBindingContext = oTable.getContextByIndex(i) as Context;

		if (await confirmDialog("Deseja realmente excluir esta empresa? O banco de dados dela não é apagado.", "Excluir empresa ?")) {
			try{
				this.setBusy(true)

				await oBindingContext.delete("$auto");

				await oModel.submitBatch(oModel.getUpdateGroupId())

				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					MessageBox.information("Empresa excluída.")
				}
			} finally {
				this.setBusy(false)
			}
		}
	}
}
```

`webapp/controller/companies/Add.controller.ts`:
```ts
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.companies
 */
export default class Add extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("companiesNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {
    this.clearStates("companiesForm");
    this.setScreenModel(true);

    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/Companies")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const oContext = oBinding.create({
      Code: "",
      CompanyName: "",
      ConnectionString: ""
    }, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {
    if (!this.validateForm("companiesForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				MessageToast.show("Empresa cadastrada.", {
					closeOnBrowserNavigation: false
				});
        this.onNavBack();
			}
		} finally {
			this.setBusy(false);
		}
	}

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}
}
```

`webapp/controller/companies/Edit.controller.ts`:
```ts
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.companies
 */
export default class Edit extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("companiesEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
		this.clearStates("companiesForm");
    this.setScreenModel(false);

    const oModel = this.getView().getModel() as ODataModel;
		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string};
		if (id != null) {
			oView.bindElement({
				path: `/Companies('${id}')`,
				events: {
					dataRequested: () => this.setBusy(true),
					dataReceived: () => this.setBusy(false),
				}
			})
		}
	}

	async onSave() {
		if (!this.validateForm("companiesForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;
		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				oModel.resetChanges(oModel.getUpdateGroupId())
				MessageToast.show("Empresa atualizada.", {
					closeOnBrowserNavigation: false
				});
			}
		} finally {
			this.setBusy(false);
		}
	}

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}
}
```
Confira a assinatura real de `confirmDialog` em `webapp/helpers/DialogHelpers.ts` (é a usada em `docNumbers/Main.controller.ts`) e de `validateField`/`clearStates`/`validateForm` no `BaseController` raiz; ajuste os nomes se diferirem.

- [ ] **Step 4: Gates e verificação no navegador**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint` → sem erros.
Navegador (admin, backend da branch com a migration `AddCompaniesMenu` aplicada): Administração → Empresas aparece primeiro no grupo. Incluir `0002` / "LM CEREAIS" / string do banco `LMCEREAIS_SIAGRO_DEV`:
- "Testar conexão" com a string certa → "Conexão OK ... migrations em dia"; com senha errada → erro de login; com a string da COMMON → ao salvar, recusa "aponta para o banco COMMON".
- Salvar → volta à lista com a string mascarada (`Password=*****`).
- Editar: código não editável; mudar só o nome e salvar → ok (senha mantida; conferir no banco). "Testar conexão" na edição funciona com a string mascarada (o servidor funde a senha).
- Deletar a empresa padrão → recusado com mensagem; deletar uma sem perfis → ok.
- Usuário não-admin (papel sem ADMIN): `GET /odata/Companies` → 403 com mensagem; a rota some do menu dele.

- [ ] **Step 5: Commit**

```bash
git add webapp/view/companies webapp/controller/companies webapp/manifest.json
git commit -m "feat(master-data): tela de cadastro de Empresas com teste de conexão

Cada empresa é um banco de negócio do mesmo deploy (spec 2026-10-16): a tela
cadastra código, nome e string de conexão, e o Testar conexão mostra servidor,
banco e migrations pendentes antes de salvar. O código é imutável depois de
criado — é a chave que sessões, perfis e jobs carregam.

Atenção: o nome da rota companies tem de ser igual à Key do menu criada pela
migration AddCompaniesMenu do backend.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Verificação final de ponta a ponta

- [ ] **Step 1: Gates completos**

Run: `yarn ts-typecheck && yarn lint && yarn ui5lint` → sem erros. Run: `yarn test` → unit tests verdes (o gate de cobertura pode falhar; registre o número de testes e a cobertura no relatório, não bloqueie por ele).

- [ ] **Step 2: Roteiro do usuário (com Web/Gateway/Reports da branch e duas empresas)**

1. Login mostra "Empresa" com CEAGUI e LM CEREAIS; usuário com perfil só em LM é recusado em CEAGUI ("Usuário sem acesso à empresa CEAGUI.") e entra em LM; ShellBar mostra "LM CEREAIS"; o diálogo de filial lista as filiais do banco da LM.
2. Avatar → Trocar Empresa → confirma → login com LM pré-selecionada.
3. Admin: Usuários → Perfis com coluna Empresa; Administração → Empresas (lista, incluir, testar, editar, excluir).
4. F5 em qualquer tela mantém a empresa (vem do `/status`).
5. Relatório PDF em cada empresa com o nome certo no cabeçalho.

- [ ] **Step 3: Nada a commitar nesta tarefa** (só verificação). Se algo foi corrigido, commit com o escopo da tela corrigida.
