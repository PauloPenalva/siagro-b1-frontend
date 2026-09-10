import TableLayoutService, { TABLE_LAYOUTS_KEY } from "siagrob1/services/TableLayoutService";
import RequestModel from "siagrob1/model/RequestModel";
import { CachedTableLayouts, TableLayout } from "siagrob1/types/TableLayout";

type PutBody = { tableKey: string; columns: unknown[] };

const TABLE_KEY = "siagrob1.view.purchaseContracts.Main::tablePurchaseContracts";

const LOCAL_LAYOUT: TableLayout = {
	tableKey: TABLE_KEY,
	columns: [{ key: "Status", width: "200px" }, { key: "Code" }]
};

const SERVER_LAYOUT: TableLayout = {
	tableKey: TABLE_KEY,
	columns: [{ key: "Code", width: "90px" }, { key: "Status" }]
};

// Stub à mão no protótipo: o serviço instancia o `RequestModel` por dentro, sem injeção.
const proto = RequestModel.prototype as unknown as Record<string, unknown>;
const originalGet = proto.get;
const originalPut = proto.put;

let serverLayouts: TableLayout[];
let putBodies: PutBody[];
let putFails: boolean;

function seedMirror(cache: object): void {
	window.localStorage.setItem(TABLE_LAYOUTS_KEY, JSON.stringify(cache));
}

function readMirror(): CachedTableLayouts {
	return JSON.parse(window.localStorage.getItem(TABLE_LAYOUTS_KEY)) as CachedTableLayouts;
}

async function boot(): Promise<void> {
	TableLayoutService.applyCachedLayouts("joao");
	await TableLayoutService.load();
}

/**
 * A tipagem do QUnit usada aqui espera callback `void`, e o lint recusa passar uma função `async`.
 * `assert.async()` mantém o teste aberto até o corpo terminar; uma rejeição vira falha, não timeout.
 */
function testAsync(name: string, body: (assert: Assert) => Promise<void>): void {
	QUnit.test(name, function (assert) {
		const done = assert.async();

		void body(assert)
			.catch((error: unknown) =>
				assert.ok(false, error instanceof Error ? error.message : JSON.stringify(error)))
			.finally(done);
	});
}

QUnit.module("TableLayoutService - espelho local x servidor", {
	beforeEach() {
		TableLayoutService.reset();
		serverLayouts = [];
		putBodies = [];
		putFails = false;

		proto.get = () => Promise.resolve({ layouts: serverLayouts });
		proto.put = function (this: RequestModel) {
			putBodies.push(this.getData() as PutBody);
			return putFails ? Promise.reject(new Error("HTTP 500")) : Promise.resolve({});
		};
	},
	afterEach() {
		proto.get = originalGet;
		proto.put = originalPut;
		TableLayoutService.reset();
	}
});

testAsync("layout que nunca chegou ao servidor sobrevive a um GET vazio", async (assert) => {
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.strictEqual(TableLayoutService.count(), 1, "continua em memória");
	assert.deepEqual(readMirror().layouts, [LOCAL_LAYOUT], "continua no espelho");
});

testAsync("layout pendente é reenviado ao servidor no boot", async (assert) => {
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(putBodies, [{ tableKey: TABLE_KEY, columns: LOCAL_LAYOUT.columns }]);
});

testAsync("PUT bem-sucedido tira o layout da fila", async (assert) => {
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(readMirror().pending, []);
});

testAsync("PUT que falha mantém o layout na fila", async (assert) => {
	putFails = true;
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(readMirror().pending, [TABLE_KEY]);
	assert.strictEqual(TableLayoutService.count(), 1);
});

testAsync("layout pendente vence a versão do servidor", async (assert) => {
	serverLayouts = [SERVER_LAYOUT];
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(readMirror().layouts, [LOCAL_LAYOUT]);
});

testAsync("espelho gravado antes da fila existir é tratado como pendente", async (assert) => {
	// Formato anterior à correção: sem `pending`. Nada garante que aquilo chegou ao servidor.
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT] });

	await boot();

	assert.strictEqual(TableLayoutService.count(), 1);
	assert.strictEqual(putBodies.length, 1);
});

testAsync("layout já sincronizado que sumiu do servidor é descartado", async (assert) => {
	// "Restaurar padrão" feito em outra máquina: o servidor manda.
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [] });

	await boot();

	assert.strictEqual(TableLayoutService.count(), 0);
	assert.strictEqual(putBodies.length, 0);
});

testAsync("servidor vence no layout já sincronizado", async (assert) => {
	serverLayouts = [SERVER_LAYOUT];
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [] });

	await boot();

	assert.deepEqual(readMirror().layouts, [SERVER_LAYOUT]);
});
