import Button from "sap/m/Button";
import ShellBar from "sap/f/ShellBar";
import UI5Element from "sap/ui/core/Element";
import SearchManager from "sap/f/SearchManager";
import nextUIUpdate from "sap/ui/test/utils/nextUIUpdate";
import { keepShellBarSearchOpenOnEscape } from "siagrob1/helpers/ShellBarSearchHelpers";

/** Os ajustes do ShellBar rodam num `setTimeout` de 100ms depois de cada renderização. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** O UI5 lê o `keyCode`, que o construtor do KeyboardEvent não deixa informar. */
function pressEscape(target: HTMLElement): void {
	for (const type of ["keydown", "keyup"]) {
		const event = new KeyboardEvent(type, { key: "Escape", bubbles: true });
		Object.defineProperty(event, "keyCode", { get: () => 27 });
		Object.defineProperty(event, "which", { get: () => 27 });
		target.dispatchEvent(event);
	}
}

/** ShellBar numa caixa da largura informada - a faixa (ExtraLargeDesktop >= 1920px) sai daí. */
async function renderShellBar(width: number) {
	const host = document.createElement("div");
	host.style.width = `${width}px`;
	document.getElementById("qunit-fixture").appendChild(host);

	const searchManager = new SearchManager({ placeholder: "Pesquisar aplicativos" });
	const shellBar = new ShellBar({
		title: "CEAGUI COMERCIO DE CEREAIS LTDA",
		secondTitle: "- CEAGUI Itabera / 68.583.898/0001-01",
		showMenuButton: true,
		showNavButton: true,
		searchManager,
	});
	shellBar.placeAt(host);
	await nextUIUpdate();
	await wait(300);
	return { shellBar, input: shellBar.getDomRef().querySelector("input") };
}

/** Teste assíncrono no padrão do repo: o lint não aceita a promise direto no QUnit.test. */
function testAsync(name: string, body: (assert: Assert) => Promise<void>): void {
	QUnit.test(name, function (assert) {
		const done = assert.async();

		void body(assert)
			.catch((error: unknown) => assert.ok(false, error instanceof Error ? error.message : JSON.stringify(error)))
			.finally(done);
	});
}

QUnit.module("ShellBarSearchHelpers - Esc na pesquisa do ShellBar");

testAsync("em tela larga, Esc no campo vazio não esvazia a barra", async (assert) => {
	const { shellBar, input } = await renderShellBar(1920);
	keepShellBarSearchOpenOnEscape(shellBar);

	input.focus();
	pressEscape(input);
	await nextUIUpdate();
	await wait(500);

	assert.notOk(shellBar.getDomRef().classList.contains("sapFShellBarFullSearch"), "os demais controles continuam visíveis");
	assert.ok(shellBar.getDomRef().querySelector("input"), "o campo de pesquisa continua aberto");
	shellBar.destroy();
});

testAsync("em tela menor, Esc continua fechando a pesquisa aberta pela lupa", async (assert) => {
	const { shellBar } = await renderShellBar(1280);
	keepShellBarSearchOpenOnEscape(shellBar);

	(UI5Element.closestTo(shellBar.getDomRef().querySelector<HTMLElement>(".sapFShellBarSearchWrap > .sapMBtn")) as Button).firePress();
	await nextUIUpdate();
	await wait(300);
	const input = shellBar.getDomRef().querySelector("input");
	assert.ok(input, "a lupa abriu o campo");

	input.focus();
	pressEscape(input);
	await nextUIUpdate();
	await wait(500);

	assert.notOk(shellBar.getDomRef().querySelector("input"), "o Esc fechou o campo");
	assert.notOk(shellBar.getDomRef().classList.contains("sapFShellBarFullSearch"), "os demais controles continuam visíveis");
	shellBar.destroy();
});

testAsync("em tela menor, a lupa reabre a pesquisa depois de um Esc", async (assert) => {
	const { shellBar } = await renderShellBar(1280);
	keepShellBarSearchOpenOnEscape(shellBar);
	const pressSearchButton = () =>
		(UI5Element.closestTo(shellBar.getDomRef().querySelector<HTMLElement>(".sapFShellBarSearchWrap > .sapMBtn")) as Button).firePress();

	pressSearchButton();
	await nextUIUpdate();
	await wait(300);
	const input = shellBar.getDomRef().querySelector("input");
	input.focus();
	pressEscape(input);
	await nextUIUpdate();
	await wait(300);

	pressSearchButton();
	await nextUIUpdate();
	await wait(500);

	assert.ok(shellBar.getDomRef().querySelector("input"), "o campo continua aberto depois de renderizar");
	shellBar.destroy();
});
