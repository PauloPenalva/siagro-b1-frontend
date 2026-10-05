import type Control from "sap/ui/core/Control";

/**
 * Célula com `wrapping="false"` corta o texto com reticências. O tooltip mostra o texto inteiro só
 * quando há corte: o `tooltip="{Campo}"` fixo apareceria também sobre o texto que já se lê inteiro.
 * O tamanho só é conhecido no DOM e muda com a largura da coluna, então a conta é feita na hora do
 * mouse, não no binding.
 */

/** Marca o `title` posto aqui, para não apagar nem trocar um tooltip declarado na view. */
const OWN_TITLE_FLAG = "overflowTooltip";

export function updateOverflowTooltip(element: HTMLElement): void {
	const owned = element.dataset[OWN_TITLE_FLAG] === "true";
	if (element.hasAttribute("title") && !owned) return;

	if (element.scrollWidth > element.clientWidth) {
		element.title = element.textContent ?? "";
		element.dataset[OWN_TITLE_FLAG] = "true";
	} else if (owned) {
		element.removeAttribute("title");
		delete element.dataset[OWN_TITLE_FLAG];
	}
}

/** Liga o tooltip de texto cortado em todo `sap.m.Text` dentro do controle (uma tabela, por exemplo). */
export function attachOverflowTooltips(control: Control): void {
	control.addEventDelegate({
		onmouseover: (event: { target: EventTarget }) => {
			const text = event.target instanceof Element ? event.target.closest(".sapMText") : null;
			if (text instanceof HTMLElement) updateOverflowTooltip(text);
		},
	});
}
