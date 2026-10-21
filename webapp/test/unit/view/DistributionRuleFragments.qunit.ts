import Fragment from "sap/ui/core/Fragment";

QUnit.module("Fragments de regras de distribuição - carregam sem agregação inválida");

const names = [
	"siagrob1.view.distributionRules.fragments.RuleLines",
	"siagrob1.view.distributionRules.fragments.NewVersionDialog",
	"siagrob1.view.costCenters.fragments.Form"
];

names.forEach(name => {
	QUnit.test(`carrega ${name}`, function (assert) {
		const done = assert.async();
		void Fragment.load({ name, controller: {} }).then(loaded => {
			const list = Array.isArray(loaded) ? loaded : [loaded];
			assert.ok(list.length > 0 && list.every(c => !!c), "controles criados");
			list.forEach(c => c.destroy());
			done();
		});
	});
});
