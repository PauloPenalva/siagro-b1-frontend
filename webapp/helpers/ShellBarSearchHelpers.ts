import type ShellBar from "sap/f/ShellBar";
import type Control from "sap/ui/core/Control";
import KeyCodes from "sap/ui/events/KeyCodes";

/** O evento de teclado que o UI5 entrega ao `onkeyup` (a tipagem do `KeyCodes` não aceita `number`). */
type UI5KeyEvent = { keyCode: KeyCodes };

/**
 * Pesquisa interna que o `sap.f.ShellBar` monta a partir do `searchManager` (`sap.f.shellBar.Search`).
 * Nada disso é API pública: são os campos do UI5 1.141 (e continuam iguais no 1.153).
 */
type ManagedSearch = Control & {
	/** Faixa de largura em que o ShellBar está: "Phone" ... "ExtraLargeDesktop" (>= 1920px). */
	sCurrentRange?: string;
	/** Se foi o usuário quem abriu o campo pela lupa: o ShellBar só mantém aberto o que ele abriu. */
	_bUserOpened?: boolean;
	getIsOpen(): boolean;
	onkeyup(event: UI5KeyEvent): void;
};

/**
 * Corrige o Esc na pesquisa do ShellBar, que no UI5 alterna o campo como se fosse a lupa:
 *
 * - Em tela larga (ExtraLargeDesktop) o campo fica sempre aberto. O Esc o fecha, a renderização
 *   seguinte o reabre à força e, 100ms depois, o ShellBar mede a largura do campo ainda fechado
 *   (36px), acha pouco espaço e esconde todos os outros controles (`sapFShellBarFullSearch`): a
 *   barra fica vazia. Aqui o Esc não fecha o campo, só limpa o texto (isso o SearchField já faz).
 * - Nas outras faixas o Esc fecha o campo, mas sem zerar o `_bUserOpened` (o botão Cancelar zera).
 *   A lupa seguinte inverte a marca para "não aberto pelo usuário" e a renderização fecha o campo
 *   assim que ele abre.
 */
export function keepShellBarSearchOpenOnEscape(shellBar: ShellBar): void {
	const search = (shellBar as unknown as { _oManagedSearch?: ManagedSearch })._oManagedSearch;
	if (!search) return;

	const onkeyup = search.onkeyup.bind(search);
	search.onkeyup = function (event: UI5KeyEvent) {
		if (event.keyCode !== KeyCodes.ESCAPE) {
			onkeyup(event);
			return;
		}
		if (search.sCurrentRange === "ExtraLargeDesktop") return;

		onkeyup(event);
		search._bUserOpened = search.getIsOpen();
	};
}
