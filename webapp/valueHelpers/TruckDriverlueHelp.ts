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
import { TruckDriver } from 'siagrob1/types/TruckDriver';

export default class TruckDriverValueHelp {

	public static open(id: string, view: View): Promise<TruckDriver>{
		return new Promise(resolve => {

			let dlg = Core.byId(id) as TableSelectDialog;
			if (!dlg) {

				dlg = new TableSelectDialog(id, {
					title: "Veiculos",
					columns: [
						new Column({ header: new Text({ text: "Codigo"})}),
						new Column({ header: new Text({ text: "Nome"})}),
						new Column({ header: new Text({ text: "Cpf"})}),
					],
					items: {
						path: "/TruckDrivers",
						sorter: [
              new Sorter("Key"),
            ],
						template: new ColumnListItem({
							cells: [
								new Text({ text: "{Key}" }),
								new Text({ text: "{Name}" }),
								new Text({ text: "{Cpf}" }),
							],
						}),
					},
					search: (ev) => {
						const value = ev.getParameter("value");
						const filters = new Filter({
							filters: [
								new Filter("Name", FilterOperator.Contains, value),
								new Filter("Key", FilterOperator.Contains, value),
								new Filter("Cpf", FilterOperator.Contains, value),
							],
							and: false,
						});

						(ev.getSource().getBinding("items") as ODataListBinding).filter(filters, "Control");
					},
					cancel: (ev: TableSelectDialog$CancelEvent) => {
						(ev.getSource().getBinding("items") as ODataListBinding).filter([], "Control")
					}
				});

				dlg.addStyleClass(" sapUiSizeCompact");
				view.addDependent(dlg);
			}

			dlg.attachConfirm((ev: TableSelectDialog$ConfirmEvent) => {
				const ctx = ev.getParameter("selectedItem").getBindingContext();
				resolve(ctx.getObject() as TruckDriver);
			});

			dlg.open(null);
		})

	}

}
