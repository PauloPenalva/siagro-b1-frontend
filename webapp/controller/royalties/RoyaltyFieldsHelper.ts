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
	/**
	 * Contador único do componente: o model "ui" é global, então só a chamada mais recente
	 * (de qualquer view) pode gravar o resultado; resposta atrasada de outra tela é descartada.
	 */
	private static token = 0;

	private static nextToken(): number {
		return ++RoyaltyFieldsHelper.token;
	}

	private static isCurrent(token: number): boolean {
		return RoyaltyFieldsHelper.token === token;
	}

	static async apply(
		controller: CommonController, itemCode: string, editable: boolean, showOrigin = true,
	): Promise<void> {
		const token = RoyaltyFieldsHelper.nextToken();
		const ui = controller.getView().getModel("ui") as JSONModel;
		ui.setProperty("/royaltyEditable", editable);
		ui.setProperty("/royaltyOriginVisible", showOrigin);
		const visible = itemCode ? await RoyaltyFieldsHelper.controls(controller, itemCode) : false;
		if (RoyaltyFieldsHelper.isCurrent(token)) {
			ui.setProperty("/royaltyVisible", visible);
		}
	}

	/**
	 * Aplica os campos de royalty ao registro ligado na view (bindElement), esperando o contexto carregar.
	 * `showOrigin` recebe o registro e decide se a origem aparece (na Compra ela é o armazém do carregamento).
	 * Esconde os campos de imediato (não mostra os do registro anterior) e descarta o resultado se a view
	 * foi apontada para outro registro enquanto esperava.
	 */
	static async applyToBoundRecord(
		controller: CommonController, editable: boolean, showOrigin?: (ctx: Context) => boolean,
	): Promise<void> {
		const token = RoyaltyFieldsHelper.nextToken();
		const view = controller.getView();
		(view.getModel("ui") as JSONModel).setProperty("/royaltyVisible", false);

		const binding = view.getElementBinding();
		let ctx = (view.getBindingContext() ?? binding?.getBoundContext()) as Context | undefined;
		if (!ctx && binding) {
			ctx = await new Promise<Context | undefined>((resolve) => {
				binding.attachEventOnce("change", () => resolve(binding.getBoundContext() as Context | undefined));
			});
		}
		if (!ctx || !RoyaltyFieldsHelper.isCurrent(token)) {
			return;
		}
		const path = ctx.getPath();
		await ctx.requestObject();
		if (!RoyaltyFieldsHelper.isCurrent(token) || view.getBindingContext()?.getPath() !== path) {
			return;
		}
		await RoyaltyFieldsHelper.apply(
			controller, ctx.getProperty("ItemCode") as string, editable, showOrigin ? showOrigin(ctx) : true,
		);
	}

	/** Telas de Compra: situação/código num model "royalty" próprio, enviado junto da compra. */
	static async initPurchase(controller: CommonController, itemCode?: string): Promise<void> {
		controller.getView().setModel(new JSONModel({ RoyaltySituation: "", RoyaltyTestCode: "" }), "royalty");
		const ui = controller.getView().getModel("ui") as JSONModel;
		ui.setProperty("/royaltyVisible", itemCode ? await RoyaltyFieldsHelper.controls(controller, itemCode) : false);
	}

	/** null explícito, nunca undefined/"" — enum vazio derruba o EntityParameter. */
	static purchasePayload(controller: CommonController): { RoyaltySituation: string, RoyaltyTestCode: string } {
		const data = ((controller.getView().getModel("royalty") as JSONModel)?.getData() ?? {}) as
			{ RoyaltySituation?: string, RoyaltyTestCode?: string };
		const situation = data.RoyaltySituation || null;
		return {
			RoyaltySituation: situation,
			RoyaltyTestCode: situation === "Tested" ? (data.RoyaltyTestCode?.trim() || null) : null,
		};
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
