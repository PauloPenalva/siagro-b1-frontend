import Column from 'sap/m/Column';
import ColumnListItem from 'sap/m/ColumnListItem';
import TableSelectDialog, { TableSelectDialog$CancelEvent, TableSelectDialog$ConfirmEvent } from 'sap/m/TableSelectDialog';
import Text from 'sap/m/Text';
import Core from 'sap/ui/core/Core';
import View from 'sap/ui/core/mvc/View';
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import ODataListBinding from 'sap/ui/model/odata/v4/ODataListBinding';
import Sorter from 'sap/ui/model/Sorter';
import { ParceiroNegocio } from 'siagrob1/types/ParceiroNegocio';

export default class ParceiroNegocioValueHelp {

	public static open(id: string, view: View): Promise<ParceiroNegocio>{
		return new Promise(resolve => {

			let dlg = Core.byId(id) as TableSelectDialog;
			if (!dlg) {

				dlg = new TableSelectDialog(id, {
					title: "Parceiros de Negócio",
					columns: [
						new Column({ header: new Text({ text: "Codigo"})}),
						new Column({ header: new Text({ text: "Razão Social"})}),
						new Column({ header: new Text({ text: "Nome Comercial"})}),
						new Column({ header: new Text({ text: "Cnpj"})}),
						new Column({ header: new Text({ text: "IE"})}),
						new Column({ header: new Text({ text: "Tipo"})}),
						new Column({ header: new Text({ text: "Status"})}),
					],
					items: {
						path: "/Participantes",
						sorter: [
              new Sorter("RazaoSocial"),
              new Sorter("NomeFantasia"),
              new Sorter("Id"),
            ],
						template: new ColumnListItem({
							cells: [
								new Text({ text: "{Id}" }),
								new Text({ text: "{RazaoSocial}" }),
								new Text({ text: "{NomeFantasia}" }),
								new Text({ text: "{Cnpj}" }),
								new Text({ text: "{InscricaoEstadual}" }),
								new Text({ text: "{TipoParticipante}" }),
								new Text({ text: "{Status}" }),
							],
						}),
					},
					search: (ev) => {
						const value = ev.getParameter("value");
						const filters = new Filter({
							filters: [
								new Filter("RazaoSocial", FilterOperator.Contains, value),
								new Filter("NomeFantasia", FilterOperator.Contains, value),
								new Filter("Cnpj", FilterOperator.Contains, value),
								new Filter("InscricaoEstadual", FilterOperator.Contains, value),
							],
							and: false,
						});

						(ev.getSource().getBinding("items") as ODataListBinding).filter(filters, "Control");
					},
					cancel: (ev: TableSelectDialog$CancelEvent) => {
						(ev.getSource().getBinding("items") as ODataListBinding).filter([], "Control")
					}
				});

				dlg.addStyleClass("sapUiPopupWithPadding sapUiSizeCompact");
				view.addDependent(dlg);
			}

			dlg.attachConfirm((ev: TableSelectDialog$ConfirmEvent) => {
				const ctx = ev.getParameter("selectedItem").getBindingContext();
				resolve(ctx.getObject() as ParceiroNegocio);
			});

			dlg.open(null);
		})

	}

}
