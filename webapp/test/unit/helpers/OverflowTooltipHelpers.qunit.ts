import Text from "sap/m/Text";
import nextUIUpdate from "sap/ui/test/utils/nextUIUpdate";
import { attachOverflowTooltips, updateOverflowTooltip } from "siagrob1/helpers/OverflowTooltipHelpers";

/** Caixa do jeito que o sap.m.Text com wrapping="false" fica na célula: uma linha, reticências. */
function nowrapBox(text: string, width: string): HTMLElement {
	const el = document.createElement("span");
	el.style.cssText = `display:inline-block;width:${width};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
	el.textContent = text;
	document.getElementById("qunit-fixture").appendChild(el);
	return el;
}

QUnit.module("OverflowTooltipHelpers - tooltip só no texto cortado");

QUnit.test("texto cortado ganha o texto inteiro como tooltip", function (assert) {
	const el = nowrapBox("VENDA DE MERCADORIA (SUSPENSAO PIS COFINS)", "40px");
	updateOverflowTooltip(el);
	assert.strictEqual(el.title, "VENDA DE MERCADORIA (SUSPENSAO PIS COFINS)");
});

QUnit.test("texto que cabe fica sem tooltip", function (assert) {
	const el = nowrapBox("Sim", "200px");
	updateOverflowTooltip(el);
	assert.strictEqual(el.hasAttribute("title"), false);
});

QUnit.test("o tooltip some quando o texto volta a caber", function (assert) {
	const el = nowrapBox("REMESSA PARA ARMAZENAGEM", "40px");
	updateOverflowTooltip(el);
	el.style.width = "600px";
	updateOverflowTooltip(el);
	assert.strictEqual(el.hasAttribute("title"), false);
});

QUnit.test("tooltip declarado na view não é tocado", function (assert) {
	const cut = nowrapBox("REMESSA PARA ARMAZENAGEM", "40px");
	cut.title = "declarado";
	updateOverflowTooltip(cut);
	assert.strictEqual(cut.title, "declarado", "cortado: não troca pelo texto");

	const fits = nowrapBox("Sim", "200px");
	fits.title = "declarado";
	updateOverflowTooltip(fits);
	assert.strictEqual(fits.title, "declarado", "cabe: não apaga");
});

QUnit.test("attachOverflowTooltips põe o tooltip ao passar o mouse sobre um Text cortado", function (assert) {
	const done = assert.async();
	const text = new Text({ text: "ENTRADA DEVOLUÇÃO COM TRIGO SUSPENSÃO", wrapping: false, width: "40px" });
	attachOverflowTooltips(text);
	text.placeAt("qunit-fixture");

	void nextUIUpdate()
		.then(() => {
			const dom = text.getDomRef() as HTMLElement;
			dom.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
			assert.strictEqual(dom.title, "ENTRADA DEVOLUÇÃO COM TRIGO SUSPENSÃO");
		})
		.catch((error: unknown) => assert.ok(false, error instanceof Error ? error.message : JSON.stringify(error)))
		.finally(() => {
			text.destroy();
			done();
		});
});
