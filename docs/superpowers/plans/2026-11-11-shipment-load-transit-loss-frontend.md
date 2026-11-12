# GAC-1213 Quebra de trajeto — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o usuário registrar a quebra de trajeto pelo diálogo de recusa da carga e enxergá-la na carga, nas listas e nos romaneios.

**Architecture:** Nenhuma tela nova. O diálogo `Refusal.fragment.xml` ganha a quarta opção e o campo "Tipo de Quebra"; rótulos e cores da situação, do movimento e do tipo de romaneio entram nos formatters centrais; o detalhe da carga mostra a quantidade perdida.

**Tech Stack:** OpenUI5 1.141 + TypeScript, OData v4, QUnit.

**Spec:** `../siagro-b1-backend/docs/superpowers/specs/2026-11-11-shipment-load-transit-loss-design.md` (§4.6). Depende do plano de backend `2026-11-11-shipment-load-transit-loss-backend.md` estar implementado.

## Global Constraints

- Textos de tela em pt-BR; identificadores em inglês.
- Contrato com o backend (valores exatos): ação `ShipmentLoadsRefuse` com `Destination = "TransitLoss"` e `TransitLossReason ∈ "Damage" | "Accident" | "Theft" | "Other"`; situação da carga `"TransitLoss"`; movimento `"TransitLoss"`; tipo de romaneio `"TransitLoss"`; propriedade `ShipmentLoad.TransitLossQuantity`; `StorageTransaction.TransitLossReason`; recusa pendente devolve `Destination` e `TransitLossReason`.
- Rótulos fixos: situação e movimento **"Quebra de trajeto"**; tipos **"Avaria / mercadoria derrubada"**, **"Sinistro"**, **"Roubo de carga"**, **"Outros"**; opção do diálogo **"Mercadoria perdida no trajeto (quebra)"**; campo **"Tipo de Quebra"**; quantidade no cabeçalho **"Qtd. Quebra de Trajeto"**.
- Parâmetro de ação nunca `undefined`: quando não se aplica, enviar `null` (regra já seguida em `onConfirmRefusal`).
- Expression binding em XML: `<` e `&&` escapados (`&lt;`, `&amp;&amp;`); nada de `--` em comentário XML.
- Propriedade lida por `getProperty()` fora de coluna visível precisa de `$select` explícito.
- Todo arquivo novo: `git add` imediato. Commits no branch `feature/gac-1213-transit-loss`, escopo `shipment`, `Refs: GAC-1213`, mesmo assunto do par do backend quando houver. Nunca push.
- Gates: `yarn ts-typecheck`, `yarn lint`; QUnit pela página do navegador se o `ui5-test-runner` não alcançar o CDN.

## Review Focus

1. Trocar de "quebra" para outro destino depois de escolher o tipo: o tipo não pode ser enviado (vai `null`) e o armazém volta a ser exigido. → teste na Task 2.
2. Reabrir o diálogo depois de uma recusa com quebra: abre limpo, sem o tipo anterior. → Task 2.
3. Carga em "Quebra de trajeto" nas telas que decidem botão por situação (Registrar Recusa, ticket de descarga, cancelar, faturar): mesmo comportamento da "Devolvida". → Task 3.
4. Situação desconhecida pelos formatters deixava célula em branco (já aconteceu com `Returned`): toda lista/mapa de situação de carga recebe o valor novo. → Task 1.
5. Recusa pendente (dois tempos) com destino quebra mostra destino e tipo, não o código cru. → Task 2.

---

### Task 1: Rótulos, cores e filtros

**Files:**
- Modify: `webapp/model/formatter.ts` (`formatShipmentLoadStatus` ~l.782 e o mapa de estado ~l.815; mapa de movimento ~l.846; mapa de tipo de romaneio ~l.720 e os de ~l.1750/1762 se listarem tipos por inclusão)
- Modify: `webapp/controller/shipmentLoads/Main.controller.ts` (lista do filtro de Situação ~l.25), `webapp/controller/shipmentLoads/Panel.controller.ts` + `webapp/view/shipmentLoads/Panel.view.xml` (coluna/contador da situação nova, ao lado de "Devolvida"), `webapp/view/reports/shipmentLoads/Main.view.xml` (`<core:Item key="10" text="Quebra de trajeto"/>`) e o comentário de `controller/reports/shipmentLoads/Main.controller.ts`, filtros de tipo em `controller/storageTransactions/Main.controller.ts` se forem lista fechada
- Test: `webapp/test/unit/model/formatter.qunit.ts`

**Interfaces — Produces:** `formatter.formatTransitLossReason(value: string): string` (os quatro rótulos; valor vazio → `""`).

- [ ] **Step 1: Testes que falham**

```ts
QUnit.test("quebra de trajeto: rótulos", assert => {
  assert.strictEqual(formatter.formatShipmentLoadStatus("TransitLoss"), "Quebra de trajeto");
  assert.strictEqual(formatter.formatTransitLossReason("Damage"), "Avaria / mercadoria derrubada");
  assert.strictEqual(formatter.formatTransitLossReason("Accident"), "Sinistro");
  assert.strictEqual(formatter.formatTransitLossReason("Theft"), "Roubo de carga");
  assert.strictEqual(formatter.formatTransitLossReason("Other"), "Outros");
  assert.strictEqual(formatter.formatTransitLossReason(null), "");
});
```

Mais uma asserção por mapa tocado: estado da situação `"Error"`, movimento `"Quebra de trajeto"`, tipo de romaneio `"Quebra de trajeto"` (usar os nomes reais das funções do arquivo).

- [ ] **Step 2:** rodar o QUnit → falha.
- [ ] **Step 3:** implementar. `grep -rn "RefusalPending\|InTransshipment" webapp` lista todo ponto que enumera situações de carga; cada um recebe `TransitLoss` (Review Focus 4).
- [ ] **Step 4:** QUnit verde, `yarn ts-typecheck`, `yarn lint`.
- [ ] **Step 5:** commit `feat(shipment): rótulos e filtros da quebra de trajeto`.

### Task 2: Diálogo de recusa e recusa pendente

**Files:**
- Modify: `webapp/view/shipmentLoads/fragments/Refusal.fragment.xml`, `webapp/view/shipmentLoads/fragments/PendingRefusal.fragment.xml`, `webapp/controller/shipmentLoads/Detail.controller.ts` (`RefusalForm` l.32, `REFUSAL_DESTINATION_TEXT` l.59, `onRefuse` l.741, `onRefusalDestinationChange` l.823, `onConfirmRefusal` l.837, `refreshPendingRefusal` l.1321)
- Create: `webapp/helpers/refusalPayload.ts` — função pura para o que hoje é montado inline
- Test: `webapp/test/unit/helpers/refusalPayload.qunit.ts` (registrar em `webapp/test/unit/unitTests.qunit.ts`)

**Interfaces — Produces:**

```ts
export type RefusalDestinationKey = "Rebilling" | "Warehouse" | "Transshipment" | "TransitLoss";
/** Índice do RadioButtonGroup → destino. Ordem fixa: 0,1,2,3. */
export function destinationFromIndex(index: number): RefusalDestinationKey;
/** Erro de validação em pt-BR, ou null se o formulário pode ser enviado. */
export function validateRefusalForm(form: { DestinationIndex: number; DestinationWarehouseCode?: string; TransitLossReason?: string; Reason?: string }): string | null;
/** Parâmetros que dependem do destino; os que não se aplicam vão null. */
export function destinationParameters(form: {...}): { Destination: RefusalDestinationKey; DestinationWarehouseCode: string | null; TransitLossReason: string | null };
```

- [ ] **Step 1: Testes que falham**: índice 3 → `"TransitLoss"`; quebra sem tipo → `"Informe o tipo da quebra de trajeto."`; quebra com tipo e sem armazém → `null`; `destinationParameters` de quebra → armazém `null` e tipo preenchido; de `Warehouse` com tipo residual no form → tipo `null` (Review Focus 1); as validações atuais de armazém e motivo continuam com as mensagens que o controller já usa (copiar os textos existentes).
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar o helper e usá-lo no controller, removendo a lógica inline equivalente. No fragment: quarto `RadioButton` "Mercadoria perdida no trajeto (quebra)"; `FormElement` "Tipo de Quebra" com `Select` obrigatório (`selectedKey="{refusal>/TransitLossReason}"`, quatro itens fixos com item vazio inicial), visível só com `DestinationIndex === 3`; armazém segue visível só em 1 e 2. `onRefuse` inicia `TransitLossReason: ""` (Review Focus 2); `onRefusalDestinationChange` limpa armazém fora de 1/2 e tipo fora de 3. Com destino quebra, o botão pede confirmação por `MessageBox.confirm`: "A quebra de trajeto devolve os documentos selecionados e retira o volume da carga. A mercadoria não retorna a nenhum armazém e não fica disponível para faturamento. Confirmar?". A ação envia `TransitLossReason` sempre (valor ou `null`).
- [ ] **Step 4:** recusa pendente: `REFUSAL_DESTINATION_TEXT.TransitLoss = "Quebra de trajeto"`; o model `pendingRefusal` ganha `TransitLossReasonText` (via `formatter.formatTransitLossReason`) e o fragment um `FormElement` "Tipo de Quebra" visível quando preenchido (Review Focus 5).
- [ ] **Step 5:** QUnit verde, `yarn ts-typecheck`, `yarn lint`.
- [ ] **Step 6:** commit `feat(shipment): recusa de carga com destino quebra de trajeto`.

### Task 3: Detalhe da carga

**Files:**
- Modify: `webapp/view/shipmentLoads/Detail.view.xml` (campo ao lado de "Qtd. Devolvida ao Armazém" l.199; tabela `loadRefusalReturnsTable` l.587), `webapp/controller/shipmentLoads/Detail.controller.ts` e `BaseController.ts` onde a situação decide visibilidade de botões

- [ ] **Step 1:** cabeçalho: "Qtd. Quebra de Trajeto" com `TransitLossQuantity`, mesmo formato e mesma regra de visibilidade (`> 0`) do campo vizinho.
- [ ] **Step 2:** tabela de devoluções da recusa: coluna "Tipo" (`formatter` de tipo de romaneio) e coluna "Tipo de Quebra" (`formatTransitLossReason`); título da seção passa a "Devoluções e Quebras da Recusa". Conferir que `TransactionType` e `TransitLossReason` chegam (coluna visível cria o binding; se a tabela usa `$select`, incluir).
- [ ] **Step 3:** `grep -n "'Returned'\|\"Returned\"" webapp/controller/shipmentLoads webapp/view/shipmentLoads webapp/controller/shipmentBilling -r`: em cada decisão por situação onde "Devolvida" aparece, tratar `TransitLoss` igual (Review Focus 3). Onde "Devolvida" fica de fora de propósito (ex.: `shipmentBilling/Main.controller.ts` l.55), `TransitLoss` fica de fora também.
- [ ] **Step 4:** `yarn ts-typecheck`, `yarn lint`.
- [ ] **Step 5:** commit `feat(shipment): mostra a quebra de trajeto no detalhe da carga`.

### Task 4: Versão e verificação no navegador

- [ ] **Step 1:** `package.json` → `1.1.311` (ou a próxima livre no `main`), commit `chore(shipment): versão 1.1.311`.
- [ ] **Step 2:** `yarn test` (ou QUnit pela página, se o runner não alcançar o CDN); registrar o resultado.
- [ ] **Step 3:** subir a stack contra uma **cópia** do banco local com a migration `AddShipmentLoadTransitLoss` aplicada (nunca o banco compartilhado), perfil `yktb`/`ceagui` conforme a cópia.
- [ ] **Step 4:** roteiro pela tela, com Playwright, numa carga faturada:
  1. Registrar Recusa → quebra sem tipo: bloqueia com a mensagem.
  2. Quebra parcial (Sinistro): carga "Quebra de trajeto" só se o saldo fechar; conferir Qtd. Quebra de Trajeto, histórico, romaneio 18 na aba de devoluções.
  3. Conferir fora da carga: contrato de compra com o mesmo entregue de antes; contrato/liberação de venda com o saldo devolvido; saldo do armazém de origem inalterado; carga ausente do Faturamento de Expedição.
  4. Quebra do restante (Roubo de carga): situação "Quebra de trajeto" na lista, no painel e no filtro.
  5. Estornar a confirmação de uma devolução: romaneio 18 cancelado e carga de volta a Faturada/parcial.
- [ ] **Step 5:** anotar o que foi e o que não foi verificado na tela (ex.: dois tempos com NF-e depende de filial emissora e SEFAZ de homologação).
