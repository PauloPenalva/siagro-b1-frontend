import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Title from "sap/ui/core/Title";
import Label from "sap/m/Label";
import Input from "sap/m/Input";
import JSONModel from "sap/ui/model/json/JSONModel";
import { bindSimpleFormGroupVisible } from "siagrob1/helpers/SimpleFormGroupHelpers";

QUnit.module("SimpleFormGroupHelpers");

QUnit.test("liga o visible do grupo do título e segue o contexto do formulário", function (assert) {
	const transport = new Title({ text: "Transporte" });
	const form = new SimpleForm({
		layout: "ResponsiveGridLayout",
		content: [
			new Title({ text: "Dados" }), new Label({ text: "A" }), new Input(),
			transport, new Label({ text: "B" }), new Input(),
			new Title({ text: "NF-e" }), new Label({ text: "C" }), new Input(),
		],
	});
	const model = new JSONModel({ doc: { InvoiceType: "Normal" } });
	form.setModel(model);
	// Como no Detail: o documento chega por contexto, e o caminho do binding é relativo.
	form.bindElement("/doc");
	try {
		const container = bindSimpleFormGroupVisible(form, transport, {
			path: "InvoiceType", formatter: (t: unknown) => t !== "IcmsComplement",
		});

		assert.ok(container, "achou o grupo do título");
		assert.strictEqual(container?.getTitle(), transport);
		assert.strictEqual(container?.getVisible(), true);
		model.setProperty("/doc/InvoiceType", "IcmsComplement");
		assert.strictEqual(container?.getVisible(), false);
	} finally {
		form.destroy();
	}
});

QUnit.test("título fora do formulário não liga nada", function (assert) {
	const form = new SimpleForm({ content: [new Title({ text: "Dados" }), new Label({ text: "A" }), new Input()] });
	const other = new Title({ text: "Outro" });
	try {
		assert.strictEqual(bindSimpleFormGroupVisible(form, other, { path: "/x" }), undefined);
	} finally {
		form.destroy();
		other.destroy();
	}
});
