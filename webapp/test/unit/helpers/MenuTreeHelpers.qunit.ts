import { buildMenuTree, moveNode, diffMenuTree, findNode, MenuRow } from "siagrob1/helpers/MenuTreeHelpers";

const rows = (): MenuRow[] => [
	{ Key: "b", Title: "B", Icon: "", Enabled: true, Expanded: false, StandaloneOnly: false, Order: 2, ParentKey: null },
	{ Key: "a", Title: "A", Icon: "", Enabled: true, Expanded: false, StandaloneOnly: false, Order: 1, ParentKey: null },
	{ Key: "a2", Title: "A2", Icon: "", Enabled: true, Expanded: false, StandaloneOnly: false, Order: 5, ParentKey: "a" },
	{ Key: "a1", Title: "A1", Icon: "", Enabled: true, Expanded: false, StandaloneOnly: false, Order: 3, ParentKey: "a" },
];

QUnit.module("MenuTreeHelpers");

QUnit.test("buildMenuTree ordena por Order e aninha filhos", (assert) => {
	const tree = buildMenuTree(rows());
	assert.deepEqual(tree.map((n) => n.Key), ["a", "b"]);
	assert.deepEqual(tree[0].children.map((n) => n.Key), ["a1", "a2"]);
});

QUnit.test("buildMenuTree põe órfão (pai inexistente) na raiz", (assert) => {
	const r = rows();
	r.push({ ...r[0], Key: "x", ParentKey: "missing", Order: 9 });
	assert.ok(buildMenuTree(r).some((n) => n.Key === "x"));
});

QUnit.test("moveNode 'On' torna filho do alvo", (assert) => {
	const tree = buildMenuTree(rows());
	assert.ok(moveNode(tree, "b", "a1", "On"));
	assert.deepEqual(findNode(tree, "a1").children.map((n) => n.Key), ["b"]);
	assert.deepEqual(tree.map((n) => n.Key), ["a"]);
});

QUnit.test("moveNode 'Before' e 'After' reposicionam entre irmãos", (assert) => {
	const tree = buildMenuTree(rows());
	assert.ok(moveNode(tree, "a2", "a1", "Before"));
	assert.deepEqual(tree[0].children.map((n) => n.Key), ["a2", "a1"]);
	assert.ok(moveNode(tree, "a2", "b", "After"));
	assert.deepEqual(tree.map((n) => n.Key), ["a", "b", "a2"]);
});

QUnit.test("moveNode recusa mover para dentro de si mesmo ou de descendente", (assert) => {
	const tree = buildMenuTree(rows());
	assert.notOk(moveNode(tree, "a", "a1", "On"));
	assert.notOk(moveNode(tree, "a", "a", "On"));
	assert.deepEqual(tree.map((n) => n.Key), ["a", "b"]);
});

QUnit.test("diffMenuTree renumera e só devolve o que mudou", (assert) => {
	const original = rows();
	const tree = buildMenuTree(original);
	moveNode(tree, "a2", "b", "On");
	findNode(tree, "a").Title = "A novo";
	const diff = diffMenuTree(tree, original);
	const byKey = Object.fromEntries(diff.updates.map((u) => [u.Key, u.changes]));
	assert.deepEqual(byKey["a2"], { ParentKey: "b", Order: 10 });
	assert.deepEqual(byKey["a"], { Title: "A novo", Order: 10 });
	assert.deepEqual(byKey["b"], { Order: 20 });
	assert.deepEqual(byKey["a1"], { Order: 10 });
	assert.deepEqual(diff.creates, []);
	assert.deepEqual(diff.deletes, []);
});

QUnit.test("diffMenuTree separa novos e removidos (removidos: filhos primeiro)", (assert) => {
	const original = rows();
	const tree = buildMenuTree(original).filter((n) => n.Key !== "a");
	tree[0].children.push({ Key: "n", Title: "N", Icon: "", Enabled: true, Expanded: false, StandaloneOnly: false, Order: 0, ParentKey: null, isNew: true, children: [] });
	const diff = diffMenuTree(tree, original);
	assert.deepEqual(diff.creates.map((c) => [c.Key, c.ParentKey, c.Order]), [["n", "b", 10]]);
	assert.deepEqual(diff.deletes.slice(0, 2).sort(), ["a1", "a2"]);
	assert.strictEqual(diff.deletes[2], "a");
});
