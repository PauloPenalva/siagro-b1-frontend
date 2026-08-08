import CommonController from "../common/CommonController";
import Fragment from 'sap/ui/core/Fragment';
import TableSelectDialog from 'sap/m/TableSelectDialog';
import Device from 'sap/ui/Device';
import Context from 'sap/ui/model/odata/v4/Context';
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import ODataListBinding from 'sap/ui/model/odata/v4/ODataListBinding';
import { Input$ValueHelpRequestEvent } from 'sap/m/Input';
import Table from 'sap/ui/table/Table';
import ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import MessageBox from 'sap/m/MessageBox';
import DialogHelper from 'siagrob1/dialogs/DialogHelper';
import MessageToast from 'sap/m/MessageToast';
import JSONModel from 'sap/ui/model/json/JSONModel';
import SessionService from 'siagrob1/services/SessionService';
import ScaleLiveService from 'siagrob1/services/ScaleLiveService';
import RequestModel from 'siagrob1/model/RequestModel';
import ServerRoutes from 'siagrob1/model/ServerRoutes';
import { CaptureResult } from 'siagrob1/types/ScaleLive';

/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class GenericController extends CommonController {
  
  storageAddressesSelectDialog: TableSelectDialog;

  /** Rota que está com o peso ao vivo ligado; sair dela fecha o SSE. */
  private captureRouteName: string;

  private captureRouteWatchAttached: boolean;
  
  async onCancel() {
     if(!await DialogHelper.confirmDialog("Confirma cancelar ticket ?"))
      return;

    const context = this.getView().getBindingContext();
    if (context) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/WeighingTicketsCancel(...)");
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio criado com sucesso.");
          this.navToTicketsList();
        })
        .finally(() => this.setBusy(false));
    }
  }
  
  navToTicketsList() {
    this.navTo("weighingTickets");
  }

  onNavToTicketList(){
    const oModel = this.getView().getModel() as ODataModel;
    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

    this.navToTicketsList();
  }

  onAddQualityInspection() {
    const oTable = this.byId(
      "weighingTicketQualityInspectionTable"
    ) as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveQualityInspection() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId(
      "weighingTicketQualityInspectionTable"
    ) as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }
  
  // A base declara retorno `void`; o corpo assíncrono fica na privada abaixo
  // para não devolver Promise onde o contrato pede void.
  openStorageAddressesValueHelp(e: Input$ValueHelpRequestEvent) {
    void this._openStorageAddressesValueHelp(e);
  }

  private async _openStorageAddressesValueHelp(e: Input$ValueHelpRequestEvent) {
    this.storageAddressesSelectDialog ??= await Fragment.load({
      name: 'siagrob1.dialogs.fragments.StorageAddressesSelectDialog',
      controller: this,
      id: this.getView().getId(),
    }) as TableSelectDialog;
  
    if (Device.system.desktop) {
      this.storageAddressesSelectDialog.addStyleClass("sapUiSizeCompact");
    }

    if (this.getView().indexOfDependent(this.storageAddressesSelectDialog) < 0){
      this.getView().addDependent(this.storageAddressesSelectDialog);
    }

    this.storageAddressesSelectDialog.attachConfirm(ev => {
        const oContext = ev
                  .getParameter("selectedItem")
                  .getBindingContext() as Context;
      
        e.getSource().setValue(oContext.getProperty("Code") as string);
    });
    this.storageAddressesSelectDialog.attachSearch(ev => {
        const value = ev.getParameter("value");
        const aFilters: Filter[] = [];
        
        aFilters.push(new Filter('Description', FilterOperator.Contains, value))
        

        const oFilters = new Filter({
          filters: aFilters,
          and: false,
        });
        
        (ev.getSource().getBinding("items") as ODataListBinding).filter(oFilters);
      });  
  
      this.storageAddressesSelectDialog.open("");
  }

  /**
   * Prepara a captura para a etapa. Resolve a balança do usuário, decide se ele pode digitar e
   * liga o peso ao vivo. Chamar no routeMatched de cada tela e ao abrir o diálogo da lista.
   */
  async startWeighingCapture(purpose: "Opening" | "Closing", routeName: string): Promise<void> {
    const uiModel = this.getModel("ui") as JSONModel;

    this.watchCaptureRouteExit(routeName);

    uiModel.setProperty("/canTypeWeight", SessionService.hasPermission("WEIGHING_MANUAL_ENTRY"));
    uiModel.setProperty("/captureId", null);
    uiModel.setProperty("/liveWeight", 0);
    uiModel.setProperty("/liveStable", false);
    uiModel.setProperty("/liveOnline", false);
    uiModel.setProperty("/liveStatusText", "Localizando a balança...");
    uiModel.setProperty("/liveStatusState", "None");

    const scaleCode = await this.resolveUserScaleCode(purpose);

    uiModel.setProperty("/scaleCode", scaleCode);
    uiModel.setProperty("/scaleConfigured", !!scaleCode);

    if (!scaleCode) {
      uiModel.setProperty("/liveStatusText", "Sem balança configurada");
      uiModel.setProperty("/liveStatusState", "Warning");
      return;
    }

    ScaleLiveService.subscribe(scaleCode, live => {
      uiModel.setProperty("/liveWeight", live.weight);
      uiModel.setProperty("/liveStable", live.stable);
      uiModel.setProperty("/liveOnline", live.online);
      uiModel.setProperty("/liveStatusText",
        !live.online ? "Balança offline" : live.stable ? "Peso estável" : "Estabilizando...");
      uiModel.setProperty("/liveStatusState",
        !live.online ? "Error" : live.stable ? "Success" : "Warning");
    });
  }

  /** Obrigatório: o EventSource não fecha sozinho ao sair da tela. */
  stopWeighingCapture(): void {
    ScaleLiveService.unsubscribe();
  }

  /**
   * Fecha o peso ao vivo quando o usuário navega para outra tela.
   *
   * O `onExit` NÃO serve para isto: o router do UI5 mantém as views em cache, então ele só é
   * chamado quando a view é destruída - e sair da pesagem deixava um SSE aberto por navegação,
   * verificado na aba Network. O gatilho certo é o próprio router.
   */
  private watchCaptureRouteExit(routeName: string): void {
    this.captureRouteName = routeName;

    if (this.captureRouteWatchAttached) {
      return;
    }

    this.captureRouteWatchAttached = true;

    this.getRouter().attachRouteMatched(ev => {
      if (ev.getParameter("name") !== this.captureRouteName) {
        this.stopWeighingCapture();
      }
    });
  }

  /**
   * Busca a balança do usuário para a etapa. O $filter é montado como texto porque
   * `sap.ui.model.Filter` sobre enum estoura "Unsupported type".
   */
  private async resolveUserScaleCode(purpose: "Opening" | "Closing"): Promise<string> {
    const username = (this.getModel("sessionModel") as JSONModel).getProperty("/userName") as string;

    if (!username) {
      return null;
    }

    const model = this.getView().getModel() as ODataModel;
    const binding = model.bindList("/UserTruckScales", null, [], [], {
      $filter: `Username eq '${username.replace(/'/g, "''")}' and Purpose eq '${purpose}'`
    });

    const contexts = await binding.requestContexts(0, 1);

    return contexts.length > 0 ? contexts[0].getProperty("TruckScaleCode") as string : null;
  }

  /** Pede a captura ao servidor e guarda o comprovante junto do peso. */
  async onUseCapturedWeight(): Promise<void> {
    const uiModel = this.getModel("ui") as JSONModel;
    const scaleCode = uiModel.getProperty("/scaleCode") as string;

    try {
      this.setBusy(true);

      const result = await new RequestModel()
        .post(ServerRoutes.scaleCapture(scaleCode), {}) as CaptureResult;

      uiModel.setProperty("/captureId", result.captureId);
      this.applyCapturedWeight(result.weight);

      MessageToast.show(`Peso capturado: ${result.weight.toLocaleString("pt-BR")} kg`);
    } catch (error) {
      MessageBox.error(this.readCaptureError(error));
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Cada tela grava o peso onde ele mora: na entidade (telas dedicadas) ou no viewModel
   * (diálogo da lista). Sobrescrever é obrigatório.
   */
  protected applyCapturedWeight(weight: number): void {
    throw new Error(`applyCapturedWeight não implementado nesta tela (peso ${weight}).`);
  }

  private readCaptureError(error: unknown): string {
    const xhr = error as { responseText?: string; status?: number };

    if (xhr?.responseText) {
      return xhr.responseText;
    }

    return "Não foi possível capturar o peso da balança.";
  }

}
