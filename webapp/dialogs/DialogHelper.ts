import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import TableSelectDialog from "sap/m/TableSelectDialog";
import Fragment from "sap/ui/core/Fragment";
import Controller from "sap/ui/core/mvc/Controller";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";

export default {

  formatter: formatter,

  createDialog: async (oController: Controller, name: string): Promise<Dialog> => {
    const id = oController.getView().getId() + "_" + name;
    const oDlg = await Fragment.load({
      name,
      controller: oController,
      id
    }) as Dialog;

    if (oController.getView().indexOfDependent(oDlg) < 0)
      oController.getView().addDependent(oDlg);

    return oDlg;
  },
  
  openTableSelectDialog: (oController: Controller, name: string, filters: string[]): Promise<Context> => {
    return new Promise(resolve => {
      const view = oController.getView();
      const id = view.getId() + "_" + name;
      let oDlg = view.byId(id) as TableSelectDialog;
    
      if (oDlg) {
        oDlg.open("");
        return;
      }

      Fragment.load({
        name: "siagrob1.dialogs.fragments." + name,
        controller: oController,
        id,
      })
      .then((oControl) => {
        oDlg = oControl as TableSelectDialog;
        oDlg.attachConfirm(ev => {
          const oContext = ev
            .getParameter("selectedItem")
            .getBindingContext() as Context;

          resolve(oContext);
        })

        oDlg.attachSearch(ev => {
          const value = ev.getParameter("value");
          const aFilters: Filter[] = [];
          filters.forEach(propertyName =>{
            aFilters.push(new Filter(propertyName, FilterOperator.Contains, value))
          })

          const oFilters = new Filter({
            filters: aFilters,
            and: false,
          });
          
          (ev.getSource().getBinding("items") as ODataListBinding).filter(oFilters);
        });
        view.addDependent(oDlg);
        oDlg.open("");
      })
      .catch((err) => {
        throw err;
      });
    })
    
  },

  async confirmDialog(title: string, message: string) {
    return new Promise(resolve =>{
      MessageBox.confirm(title, {
        title: message,
        onClose: (value: string) => {
          if (value === MessageBox.Action.OK.toString()) {
            resolve(true);
            return;
          }

          resolve(false);
        }
      });
    })
  }

}
