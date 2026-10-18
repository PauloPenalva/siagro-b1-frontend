import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Form from "sap/ui/layout/form/Form";
import FormContainer from "sap/ui/layout/form/FormContainer";
import Title from "sap/ui/core/Title";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";

/**
 * O grupo do SimpleForm (o FormContainer que ele cria a cada core:Title) não tem `visible` no XML: esconder os campos um
 * a um deixa a coluna do grupo vazia no ResponsiveGridLayout. Este helper acha o FormContainer do título e liga o
 * `visible` dele — o layout só posiciona os grupos visíveis, então os vizinhos sobem para o lugar.
 *
 * Devolve o FormContainer ligado, ou undefined quando o título não está no formulário.
 */
export function bindSimpleFormGroupVisible(
	simpleForm: SimpleForm, title: Title, bindingInfo: PropertyBindingInfo,
): FormContainer | undefined {
	const form = simpleForm.getAggregation("form") as Form | null;
	const container = form?.getFormContainers().find((c) => c.getTitle() === title);
	container?.bindProperty("visible", bindingInfo);
	return container;
}
