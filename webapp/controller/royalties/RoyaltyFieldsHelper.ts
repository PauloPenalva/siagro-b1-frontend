import JSONModel from "sap/ui/model/json/JSONModel";
import type Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type CommonController from "siagrob1/controller/common/CommonController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Mostra os campos de royalty (ITS) só para produto com "Controla royalties" no complemento.
 * O backend valida de qualquer forma; aqui é só para não poluir a tela de milho.
 */
export default class RoyaltyFieldsHelper {
	static async apply(
		controller: CommonController, itemCode: string, editable: boolean, showOrigin = true,
	): Promise<void> {
		const ui = controller.getView().getModel("ui") as JSONModel;
		ui.setProperty("/royaltyEditable", editable);
		ui.setProperty("/royaltyOriginVisible", showOrigin);
		ui.setProperty("/royaltyVisible", itemCode ? await RoyaltyFieldsHelper.controls(controller, itemCode) : false);
	}

	/**
	 * Aplica os campos de royalty ao registro ligado na view (bindElement), esperando o contexto carregar.
	 * `showOrigin` recebe o registro e decide se a origem aparece (na Compra ela é o armazém do carregamento).
	 */
	static async applyToBoundRecord(
		controller: CommonController, editable: boolean, showOrigin?: (ctx: Context) => boolean,
	): Promise<void> {
		const binding = controller.getView().getElementBinding();
		let ctx = (controller.getView().getBindingContext() ?? binding?.getBoundContext()) as Context | undefined;
		if (!ctx && binding) {
			ctx = await new Promise<Context | undefined>((resolve) => {
				binding.attachEventOnce("change", () => resolve(binding.getBoundContext() as Context | undefined));
			});
		}
		await ctx?.requestObject();
		await RoyaltyFieldsHelper.apply(
			controller, ctx?.getProperty("ItemCode") as string, editable, ctx && showOrigin ? showOrigin(ctx) : true,
		);
	}

	static async controls(controller: CommonController, itemCode: string): Promise<boolean> {
		const model = controller.getView().getModel() as ODataModel;
		const func = model.bindContext(ServerRoutes.itemsGetComplement);
		func.setParameter("ItemCode", itemCode);
		try {
			await func.invoke();
			return !!(func.getBoundContext().getObject() as { ControlsRoyalties?: boolean })?.ControlsRoyalties;
		} catch {
			return false; // produto sem complemento
		}
	}
}
