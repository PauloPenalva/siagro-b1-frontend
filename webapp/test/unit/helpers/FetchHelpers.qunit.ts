import { odataCollection, odataValue } from "siagrob1/helpers/FetchHelpers";

/**
 * A regra que estes testes fixam: no SiagroB1, uma Function do EDM declarada com tipo de
 * retorno (`ReturnsCollection<Dto>`, `Returns<string>`, `Returns<bool>`) é serializada pelo
 * formatador do OData e vem **com envelope** `{ "@odata.context": …, "value": … }`. Só quem é
 * declarada `Returns<IActionResult>()` escapa do formatador e responde o corpo cru.
 *
 * Como as duas formas existem lado a lado no mesmo backend, quem lê por `fetch` tem de aceitar
 * as duas — é o que o `shipmentLoads/BaseController` já faz à mão desde antes.
 */

QUnit.module("FetchHelpers - envelope do OData em resposta lida por fetch");

QUnit.test("coleção com envelope devolve o array de dentro", function (assert) {
	assert.deepEqual(
		odataCollection({ "@odata.context": "…#Collection(X)", value: [{ Name: "numero" }] }),
		[{ Name: "numero" }]
	);
});

QUnit.test("coleção crua (Returns<IActionResult>) passa direto", function (assert) {
	assert.deepEqual(odataCollection([{ Name: "numero" }]), [{ Name: "numero" }]);
});

QUnit.test("coleção vazia dos dois jeitos", function (assert) {
	assert.deepEqual(odataCollection({ value: [] }), []);
	assert.deepEqual(odataCollection([]), []);
});

QUnit.test("resposta inesperada vira lista vazia, não estouro", function (assert) {
	assert.deepEqual(odataCollection(undefined), []);
	assert.deepEqual(odataCollection(null), []);
	assert.deepEqual(odataCollection(""), []);
	assert.deepEqual(odataCollection({ nada: 1 }), []);
});

QUnit.test("escalar com envelope devolve o valor de dentro", function (assert) {
	// O corpo da minuta chega assim: Returns<string> passa pelo formatador.
	assert.strictEqual(odataValue({ "@odata.context": "…#Edm.String", value: "<p>oi</p>" }), "<p>oi</p>");
	assert.strictEqual(odataValue({ "@odata.context": "…#Edm.Boolean", value: true }), true);
	assert.strictEqual(odataValue({ value: false }), false);
});

QUnit.test("escalar cru passa direto", function (assert) {
	assert.strictEqual(odataValue("<p>oi</p>"), "<p>oi</p>");
	assert.strictEqual(odataValue(true), true);
	assert.strictEqual(odataValue(0), 0);
});

QUnit.test("`value: false` não pode ser confundido com ausência", function (assert) {
	// O bug que isto impede: `data ? "mudou" : "nada mudou"` sobre o envelope inteiro é sempre
	// verdadeiro, porque o objeto é truthy — a mensagem "nada mudou" nunca aparecia.
	assert.strictEqual(odataValue({ value: false }), false);
	assert.notStrictEqual(odataValue({ value: false }), undefined);
});

QUnit.test("ausência continua sendo ausência", function (assert) {
	assert.strictEqual(odataValue(undefined), undefined);
	assert.strictEqual(odataValue(null), null);
});
