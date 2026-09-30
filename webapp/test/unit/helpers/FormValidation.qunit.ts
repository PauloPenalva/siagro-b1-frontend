import Input from "sap/m/Input";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import { ValueState } from "sap/ui/core/library";
import Form from "sap/ui/layout/form/Form";
import FormContainer from "sap/ui/layout/form/FormContainer";
import FormElement from "sap/ui/layout/form/FormElement";
import ColumnLayout from "sap/ui/layout/form/ColumnLayout";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";

/**
 * `sap.ui.layout.form.Form` não tem `getContent()` — é `getFormContainers()`. Os controles são
 * instanciados de verdade (sem renderizar): é o `getRequired()`/`setValueState()` real que está
 * sob teste, não um dublê.
 */
function buildForm(fields: (Input | Select)[]): Form {
	return new Form({
		layout: new ColumnLayout(),
		formContainers: [
			new FormContainer({
				formElements: fields.map((f) => new FormElement({ fields: [f] })),
			}),
		],
	});
}

QUnit.module("FormValidation - obrigatórios de um sap.ui.layout.form.Form");

QUnit.test("campo obrigatório vazio reprova e é marcado em vermelho", function (assert) {
	const field = new Input({ required: true, value: "" });
	const form = buildForm([field]);

	assert.strictEqual(validateRequiredFields(form), false);
	assert.strictEqual(field.getValueState(), ValueState.Error);
	assert.strictEqual(field.getValueStateText(), "Campo obrigatório");

	form.destroy();
});

QUnit.test("campo obrigatório preenchido aprova e limpa a marcação anterior", function (assert) {
	const field = new Input({ required: true, value: "Fulano", valueState: ValueState.Error });
	const form = buildForm([field]);

	assert.strictEqual(validateRequiredFields(form), true);
	assert.strictEqual(field.getValueState(), ValueState.None);

	form.destroy();
});

QUnit.test("só espaço em branco não preenche campo obrigatório", function (assert) {
	const field = new Input({ required: true, value: "   " });
	const form = buildForm([field]);

	assert.strictEqual(validateRequiredFields(form), false);
	assert.strictEqual(field.getValueState(), ValueState.Error);

	form.destroy();
});

QUnit.test("campo opcional vazio não reprova nem é marcado", function (assert) {
	const field = new Input({ required: false, value: "" });
	const form = buildForm([field]);

	assert.strictEqual(validateRequiredFields(form), true);
	assert.strictEqual(field.getValueState(), ValueState.None);

	form.destroy();
});

QUnit.test("Select obrigatório sem seleção reprova", function (assert) {
	const field = new Select({ required: true, forceSelection: false });
	const form = buildForm([field]);

	assert.strictEqual(validateRequiredFields(form), false);
	assert.strictEqual(field.getValueState(), ValueState.Error);

	form.destroy();
});

QUnit.test("Select obrigatório com chave escolhida aprova", function (assert) {
	const field = new Select({
		required: true,
		items: [new Item({ key: "Sign", text: "Assinar" })],
		selectedKey: "Sign",
	});
	const form = buildForm([field]);

	assert.strictEqual(validateRequiredFields(form), true);
	assert.strictEqual(field.getValueState(), ValueState.None);

	form.destroy();
});

QUnit.test("todos os campos inválidos são marcados, não só o primeiro", function (assert) {
	const first = new Input({ required: true, value: "" });
	const second = new Input({ required: true, value: "" });
	const third = new Input({ required: true, value: "ok" });
	const form = buildForm([first, second, third]);

	assert.strictEqual(validateRequiredFields(form), false);
	assert.strictEqual(first.getValueState(), ValueState.Error);
	assert.strictEqual(second.getValueState(), ValueState.Error);
	assert.strictEqual(third.getValueState(), ValueState.None);

	form.destroy();
});

QUnit.test("a varredura atravessa mais de um FormContainer", function (assert) {
	const inFirst = new Input({ required: true, value: "ok" });
	const inSecond = new Input({ required: true, value: "" });
	const form = new Form({
		layout: new ColumnLayout(),
		formContainers: [
			new FormContainer({ formElements: [new FormElement({ fields: [inFirst] })] }),
			new FormContainer({ formElements: [new FormElement({ fields: [inSecond] })] }),
		],
	});

	assert.strictEqual(validateRequiredFields(form), false);
	assert.strictEqual(inSecond.getValueState(), ValueState.Error);

	form.destroy();
});

QUnit.test("formulário ausente reprova em vez de estourar", function (assert) {
	assert.strictEqual(validateRequiredFields(undefined), false);
	assert.strictEqual(validateRequiredFields(null), false);
});

QUnit.module("FormValidation - limpeza das marcações");

QUnit.test("clearFieldStates apaga o vermelho de Input e de Select", function (assert) {
	const field = new Input({ required: true, valueState: ValueState.Error, valueStateText: "Campo obrigatório" });
	const select = new Select({ required: true, valueState: ValueState.Error });
	const form = buildForm([field, select]);

	clearFieldStates(form);

	assert.strictEqual(field.getValueState(), ValueState.None);
	assert.strictEqual(select.getValueState(), ValueState.None);

	form.destroy();
});

QUnit.test("clearFieldStates não estoura com formulário ausente", function (assert) {
	clearFieldStates(undefined);
	assert.ok(true, "nenhuma exceção");
});
