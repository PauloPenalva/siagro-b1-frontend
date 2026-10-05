import { applyStaticFilter } from "siagrob1/dialogs/DialogHelper";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";

QUnit.module("DialogHelper - $filter estático do value help");

type Call = Record<string, unknown>;

function fakeBinding(calls: Call[]): ODataListBinding {
	return { changeParameters: (p: Call) => calls.push(p) } as unknown as ODataListBinding;
}

QUnit.test("sem filtro estático não mexe nos parâmetros (preserva o $filter do XML)", function (assert) {
	const calls: Call[] = [];
	applyStaticFilter(fakeBinding(calls), undefined);
	assert.strictEqual(calls.length, 0, "changeParameters com undefined apagaria o $filter do fragmento");
});

QUnit.test("com filtro estático aplica o $filter", function (assert) {
	const calls: Call[] = [];
	applyStaticFilter(fakeBinding(calls), "Direction eq 'Outgoing'");
	assert.deepEqual(calls, [{ $filter: "Direction eq 'Outgoing'" }]);
});
