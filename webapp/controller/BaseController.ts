import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import AppComponent from "../Component";
import Model from "sap/ui/model/Model";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Router from "sap/ui/core/routing/Router";
import History from "sap/ui/core/routing/History";
import JSONModel from "sap/ui/model/json/JSONModel";
import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Input, { Input$LiveChangeEvent } from "sap/m/Input";
import { ValueState } from "sap/ui/core/library";
import Select from "sap/m/Select";
import ComboBox from "sap/m/ComboBox";
import DatePicker from "sap/m/DatePicker";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";

/**
 * @namespace siagrob1.controller
 */
export default abstract class BaseController extends Controller {
  /**
   * Convenience method for accessing the component of the controller's view.
   * @returns The component of the controller's view
   */
  public getOwnerComponent(): AppComponent {
    return super.getOwnerComponent() as AppComponent;
  }

  /**
   * Convenience method to get the components' router instance.
   * @returns The router instance
   */
  public getRouter(): Router {
    return UIComponent.getRouterFor(this);
  }

  /**
   * Convenience method for getting the i18n resource bundle of the component.
   * @returns {Promise<sap.base.i18n.ResourceBundle>} The i18n resource bundle of the component
   */
  public getResourceBundle(): Promise<ResourceBundle> {
    const oModel = this.getOwnerComponent().getModel("i18n") as ResourceModel;
    return oModel.getResourceBundle() as Promise<ResourceBundle>;
  }

  /**
   * Convenience method for getting the view model by name in every controller of the application.
   * @param [sName] The model name
   * @returns The model instance
   */
  public getModel(sName?: string): Model {
    return this.getView().getModel(sName);
  }

  /**
   * Convenience method for setting the view model in every controller of the application.
   * @param oModel The model instance
   * @param [sName] The model name
   * @returns The current base controller instance
   */
  public setModel(oModel: Model, sName?: string): BaseController {
    this.getView().setModel(oModel, sName);
    return this;
  }

  /**
   * Convenience method for triggering the navigation to a specific target.
   * @public
   * @param sName Target name
   * @param [oParameters] Navigation parameters
   * @param [bReplace] Defines if the hash should be replaced (no browser history entry) or set (browser history entry)
   */
  public navTo(sName: string, oParameters?: object, bReplace?: boolean): void {
    this.getRouter().navTo(sName, oParameters, undefined, bReplace);
  }

  /**
   * Convenience event handler for navigating back.
   * It there is a history entry we go one step back in the browser history
   * If not, it will replace the current entry of the browser history with the main route.
   */
  public onNavBack(): void {
    const sPreviousHash = History.getInstance().getPreviousHash();
    if (sPreviousHash !== undefined) {
      window.history.go(-1);
    } else {
      this.getRouter().navTo("main", {}, undefined, true);
    }
  }

  public setBusy(isBusy: boolean) {
    (this.getView().getModel("ui") as JSONModel).setProperty("/isBusy", isBusy);
  }

  public validateForm(sFormId?: string) {
    const oView = this.getView();
    const oForm = <SimpleForm>oView.byId(sFormId);
    let bValid = true;

    // Percorre todos os controles dentro do SimpleForm
    oForm.getContent().forEach((oControl) => {
      // Verifica se é um Input com propriedade "required"
      if (oControl instanceof Input && oControl.getRequired()) {
        const sValue = oControl.getValue().trim();

        if (!sValue) {
          oControl.setValueState(ValueState.Error);
          oControl.setValueStateText("Campo obrigatório");
          bValid = false;
        } else {
          oControl.setValueState(ValueState.None);
        }
      }

      if (oControl instanceof Select && oControl.getRequired()) {
        const sKey = oControl.getSelectedKey();
        if (!sKey) {
          oControl.setValueState(ValueState.Error);
          oControl.setValueStateText("Campo obrigatório");
          bValid = false;
        } else {
          oControl.setValueState(ValueState.None);
        }
      }

      if (oControl instanceof ComboBox && oControl.getRequired()) {
        const sValue = oControl.getValue().trim();

        if (!sValue) {
          oControl.setValueState(ValueState.Error);
          oControl.setValueStateText("Campo obrigatório");
          bValid = false;
        } else {
          oControl.setValueState(ValueState.None);
        }
      }

      if (oControl instanceof DatePicker && oControl.getRequired()) {
        const sValue = oControl.getDateValue();

        if (!sValue) {
          oControl.setValueState(ValueState.Error);
          oControl.setValueStateText("Campo obrigatório");
          bValid = false;
        } else {
          oControl.setValueState(ValueState.None);
        }
      }

    });

    return bValid;
  }

  validateField(ev: Input$LiveChangeEvent ) {
    const oControl = ev.getSource();
    if (oControl instanceof Input && oControl.getRequired()){
      const sValue = oControl.getValue().trim();
      if (!sValue) {
        oControl.setValueState(ValueState.Error);
        oControl.setValueStateText("Campo obrigatório.");
      } else {
        oControl.setValueState(ValueState.None);
      }
    }

    if (oControl instanceof Select && oControl.getRequired()) {
      const sKey = oControl.getSelectedKey();
      if (!sKey) {
        oControl.setValueState(ValueState.Error);
        oControl.setValueStateText("Campo obrigatório.");
      } else {
        oControl.setValueState(ValueState.None);
      }
    }

    if (oControl instanceof ComboBox && oControl.getRequired()){
      const sValue = oControl.getValue().trim();
      if (!sValue) {
        oControl.setValueState(ValueState.Error);
        oControl.setValueStateText("Campo obrigatório.");
      } else {
        oControl.setValueState(ValueState.None);
      }
    }

    // if (oControl instanceof DatePicker && oControl.getRequired()){
    //   const sValue = oControl.getLastValue();
    //   console.log(sValue);
    //   if (!sValue) {
    //     oControl.setValueState(ValueState.Error);
    //     oControl.setValueStateText("Campo obrigatório.");
    //   } else {
    //     oControl.setValueState(ValueState.None);
    //   }
    // }
  }
    
  public clearStates(sFormId: string) {
    const oView = this.getView();
    const oForm = <SimpleForm>oView.byId(sFormId);
    // Percorre todos os controles dentro do SimpleForm
    oForm.getContent().forEach((oControl) => {
      if (oControl instanceof Input) {
        oControl.setValueState(ValueState.None);
      }
    });
  }

  getSelectRowContext(oTable: Table): Context {
    const iRowSelected = oTable.getSelectedIndex();
		if (iRowSelected < 0)  {
			return;
		}

    return oTable.getContextByIndex(iRowSelected) as Context;
  }
}
