import Add from "siagrob1/controller/ownershipTransfers/Add.controller";
import JSONModel from "sap/ui/model/json/JSONModel";

type OriginHeaderController = {
	getModel: (name?: string) => JSONModel;
	byId: (id: string) => unknown;
	getStorageAddressesBalance: () => Promise<void>;
	getDestinationData: () => void;
};

const ORIGIN_ROW = {
	BranchName: "CEAGUI",
	Code: "LT000001",
	Description: "Soja safra 25/26",
	ItemCode: "1",
	ItemName: "SOJA",
	CardCode: "F000018",
	CardName: "PRODUTOR TESTE",
	WarehouseCode: "F00009",
	WarehouseName: "CEAGUI",
	OwnershipType: 2,
	Balance: 15000,
	UoM: "KG",
};

/** Add com a tabela de origem simulada: `selected` é a linha marcada no passo 1 (ou nada). */
function controllerWithOriginSelection(selected?: Record<string, unknown>) {
	const models: Record<string, JSONModel> = {
		origin: new JSONModel({ Code: "ANTIGO" }),
		destination: new JSONModel(),
	};
	const controller = new Add("siagrob1.controller.ownershipTransfers.Add") as unknown as OriginHeaderController;
	controller.getModel = (name?: string) => models[name ?? ""];
	controller.byId = () => ({
		getSelectedItem: () => selected && {
			getBindingContext: () => ({
				getObject: () => selected,
				getProperty: (p: string) => selected[p],
			}),
		},
	});
	controller.getStorageAddressesBalance = () => Promise.resolve();
	(controller as unknown as { navBack: () => void }).navBack = () => undefined;
	return { controller, models };
}

QUnit.module("ownershipTransfers - cabeçalho do lote de origem");

QUnit.test("ao ir para o destino, o cabeçalho recebe os dados do lote de origem escolhido", function (assert) {
	const { controller, models } = controllerWithOriginSelection(ORIGIN_ROW);

	controller.getDestinationData();

	assert.deepEqual(models.origin.getData(), ORIGIN_ROW);
});

QUnit.test("o cabeçalho é uma cópia: mexer nele não altera a linha da tabela de origem", function (assert) {
	const row = { ...ORIGIN_ROW };
	const { controller, models } = controllerWithOriginSelection(row);

	controller.getDestinationData();
	models.origin.setProperty("/Balance", 0);

	assert.strictEqual(row.Balance, 15000);
});

QUnit.test("sem lote de origem selecionado, o cabeçalho é limpo", function (assert) {
	const { controller, models } = controllerWithOriginSelection();

	controller.getDestinationData();

	assert.deepEqual(models.origin.getData(), {});
});
