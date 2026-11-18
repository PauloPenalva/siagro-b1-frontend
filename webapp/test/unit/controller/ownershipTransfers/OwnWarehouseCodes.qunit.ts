import Add from "siagrob1/controller/ownershipTransfers/Add.controller";

type OwnWarehouseLoader = {
	getModel: () => unknown;
	getOwnWarehouseCodes: () => Promise<string[]>;
};

/**
 * Modelo OData falso: cada chamada da função devolve a próxima resposta da fila, e conta
 * quantas vezes o servidor foi consultado.
 */
function fakeModel(responses: string[][]) {
	const state = { calls: 0 };
	const model = {
		bindContext: () => {
			const codes = responses[Math.min(state.calls, responses.length - 1)];
			return {
				invoke: () => {
					state.calls++;
					return Promise.resolve();
				},
				getBoundContext: () => ({
					getObject: () => ({ value: codes.map((WarehouseCode) => ({ WarehouseCode })) }),
				}),
			};
		},
	};
	return { model, state };
}

QUnit.module("ownershipTransfers - armazéns próprios do complemento");

/** QUnit.test com corpo assíncrono sem devolver Promise ao QUnit (regra no-misused-promises). */
function testAsync(name: string, body: (assert: Assert) => Promise<void>): void {
	QUnit.test(name, function (assert) {
		const done = assert.async();

		void body(assert)
			.catch((error: unknown) => assert.ok(false, error instanceof Error ? error.message : JSON.stringify(error)))
			.finally(done);
	});
}

testAsync("armazém marcado como próprio depois da primeira consulta aparece sem recarregar a página", async (assert) => {
	// Caso da CEAGUI em 17/11/2026: a tela consultou antes do cadastro (lista vazia), o
	// usuário marcou o armazém no complemento e tentou de novo na mesma sessão.
	const { model } = fakeModel([[], ["F00009"]]);
	const controller = new Add("siagrob1.controller.ownershipTransfers.Add") as unknown as OwnWarehouseLoader;
	controller.getModel = () => model;

	assert.deepEqual(await controller.getOwnWarehouseCodes(), []);
	assert.deepEqual(await controller.getOwnWarehouseCodes(), ["F00009"]);
});
