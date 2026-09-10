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

QUnit.test("layout que nunca chegou ao servidor sobrevive a um GET vazio", async function (assert) {
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.strictEqual(TableLayoutService.count(), 1, "continua em memória");
	assert.deepEqual(readMirror().layouts, [LOCAL_LAYOUT], "continua no espelho");
});

QUnit.test("layout pendente é reenviado ao servidor no boot", async function (assert) {
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(putBodies, [{ tableKey: TABLE_KEY, columns: LOCAL_LAYOUT.columns }]);
});

QUnit.test("PUT bem-sucedido tira o layout da fila", async function (assert) {
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(readMirror().pending, []);
});

QUnit.test("PUT que falha mantém o layout na fila", async function (assert) {
	putFails = true;
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(readMirror().pending, [TABLE_KEY]);
	assert.strictEqual(TableLayoutService.count(), 1);
});

QUnit.test("layout pendente vence a versão do servidor", async function (assert) {
	serverLayouts = [SERVER_LAYOUT];
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [TABLE_KEY] });

	await boot();

	assert.deepEqual(readMirror().layouts, [LOCAL_LAYOUT]);
});

QUnit.test("espelho gravado antes da fila existir é tratado como pendente", async function (assert) {
	// Formato anterior à correção: sem `pending`. Nada garante que aquilo chegou ao servidor.
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT] });

	await boot();

	assert.strictEqual(TableLayoutService.count(), 1);
	assert.strictEqual(putBodies.length, 1);
});

QUnit.test("layout já sincronizado que sumiu do servidor é descartado", async function (assert) {
	// "Restaurar padrão" feito em outra máquina: o servidor manda.
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [] });

	await boot();

	assert.strictEqual(TableLayoutService.count(), 0);
	assert.strictEqual(putBodies.length, 0);
});

QUnit.test("servidor vence no layout já sincronizado", async function (assert) {
	serverLayouts = [SERVER_LAYOUT];
	seedMirror({ username: "joao", layouts: [LOCAL_LAYOUT], pending: [] });

	await boot();

	assert.deepEqual(readMirror().layouts, [SERVER_LAYOUT]);
});
