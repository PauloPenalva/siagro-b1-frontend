import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import Label from "sap/m/Label";
import { ButtonType } from "sap/m/library";
import MessageBox from "sap/m/MessageBox";
import TableSelectDialog from "sap/m/TableSelectDialog";
import TextArea from "sap/m/TextArea";
import Fragment from "sap/ui/core/Fragment";
import { ValueState } from "sap/ui/core/library";
import Controller from "sap/ui/core/mvc/Controller";
import Device from "sap/ui/Device";
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

    if (oController.getView().indexOfDependent(oDlg) < 0) {
       if (Device.system.desktop) {
        oDlg.addStyleClass("sapUiSizeCompact");
      }
      oController.getView().addDependent(oDlg);
    }

    return oDlg;
  },
  
  openTableSelectDialog: (oController: Controller, name: string, filters: string[], defaultFilters: Filter[] = []): Promise<Context> => {
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
          let aFilters: Filter[] = [];
          filters.forEach(propertyName =>{
            aFilters.push(new Filter(propertyName, FilterOperator.Contains, value))
          })

          const oFilters = new Filter({
            filters: aFilters,
            and: false,
          });
          
          (ev.getSource().getBinding("items") as ODataListBinding).filter([oFilters, ...defaultFilters]);
        });

        if (Device.system.desktop) {
          oDlg.addStyleClass("sapUiSizeCompact");
        }

        view.addDependent(oDlg);
        oDlg.open("");
      })
      .catch((err) => {
        throw err;
      });
    })
    
  },

  async confirmDialog(title: string, message?: string) {
    return new Promise(resolve =>{
      MessageBox.confirm(title, {
        title: message ?? "",
        onClose: (value: string) => {
          if (value === MessageBox.Action.OK.toString()) {
            resolve(true);
            return;
          }

          resolve(false);
        }
      });
    })
  },

  /**
   * Pede um texto obrigatório ao usuário (ex.: motivo de cancelamento).
   * Resolve com o texto informado, ou string vazia se o usuário desistir.
   */
  async promptDialog(title: string, label: string, placeholder = ""): Promise<string> {
    return new Promise<string>(resolve => {
      const oTextArea = new TextArea({
        width: "100%",
        rows: 3,
        placeholder,
        required: true,
        liveChange: () => oTextArea.setValueState(ValueState.None),
      });

      let confirmed = false;

      const oDialog = new Dialog({
        title,
        contentWidth: "30rem",
        content: [
          new Label({ text: label, labelFor: oTextArea }),
          oTextArea,
        ],
        beginButton: new Button({
          type: ButtonType.Emphasized,
          text: "Confirmar",
          press: () => {
            if (!oTextArea.getValue().trim()) {
              oTextArea.setValueState(ValueState.Error);
              oTextArea.setValueStateText("Campo obrigatório");
              return;
            }

            confirmed = true;
            oDialog.close();
          },
        }),
        endButton: new Button({
          text: "Cancelar",
          press: () => oDialog.close(),
        }),
        afterClose: () => {
          const value = oTextArea.getValue().trim();
          oDialog.destroy();
          resolve(confirmed ? value : "");
        },
      });

      if (Device.system.desktop) {
        oDialog.addStyleClass("sapUiSizeCompact");
      }

      oDialog.addStyleClass("sapUiContentPadding");
      oDialog.open();
    });
  }

}
