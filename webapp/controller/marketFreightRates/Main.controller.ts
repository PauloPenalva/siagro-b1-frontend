import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { EMPTY_LOOKUPS, loadMarketLookups, saveMarketChanges } from "siagrob1/helpers/MarketLookups";
import {
  buildFreightRatesFilter, formatStrictDecimal, MARKET_MANAGE, municipalityLabel, numberErrorKey, parseStrictDecimal
} from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";
import { MarketFreightRate, MarketFreightRatesFilter } from "siagrob1/types/MarketPricing";

type RateForm = {
  title: string;
  isNew: boolean;
  municipalityCode: string;
  municipalityLabel: string;
  /** Chave do Select (texto). */
  destinationId: string;
  /** Texto digitado, vírgula decimal pt-BR. */
  ratePerTon: string;
  validFrom: string;
};

/**
 * Tabela de frete (R$/t) por município e destino, com vigência (OData `MarketFreightRates`).
 * Mudar o frete = incluir nova linha com outra vigência; as antigas ficam como histórico.
 *
 * @namespace siagrob1.controller.marketFreightRates
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private dialog?: Dialog;
  /** Contexto em alteração; nulo = inclusão. */
  private editing: Context | null = null;
  private visited = false;

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getView().setModel(new JSONModel({}), "filter");
    this.getView().setModel(new JSONModel({ ...EMPTY_LOOKUPS }), "lookup");
    this.getView().setModel(new JSONModel({}), "rate");
    this.getRouter().getRoute("marketFreightRates").attachPatternMatched(() => void this.routeMatched());
  }

  private async routeMatched(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    const lookups = await loadMarketLookups(this.getView().getModel() as ODataModel, false, true);
    (this.getView().getModel("lookup") as JSONModel).setData(lookups);
    const revisit = this.visited;
    this.visited = true;
    this.applyFilters();
    // Na revisita o filtro não muda e o binding não relê sozinho: vigências lançadas noutra sessão não apareceriam.
    if (revisit) this.binding()?.refresh();
  }

  private text(key: string): string {
    return this.bundle?.getText(key) ?? key;
  }

  private table(): Table {
    return this.byId("tableMarketFreightRates") as Table;
  }

  private filterModel(): JSONModel {
    return this.getView().getModel("filter") as JSONModel;
  }

  private rateModel(): JSONModel {
    return this.getView().getModel("rate") as JSONModel;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  private applyFilters(): void {
    this.binding()?.changeParameters({ $filter: buildFreightRatesFilter(this.filterModel().getData() as MarketFreightRatesFilter) });
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.filterModel().setData({});
    this.applyFilters();
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  private async openDialog(form: RateForm, editing: Context | null): Promise<void> {
    this.editing = editing;
    this.rateModel().setData(form);
    this.dialog ??= await this.loadFragment({ name: "siagrob1.view.marketFreightRates.fragments.FreightRateDialog" }) as Dialog;
    this.markRate();
    this.dialog.open();
  }

  onCreate(): void {
    void this.openDialog({
      title: this.text("marketFreightRateTitleNew"), isNew: true, municipalityCode: "", municipalityLabel: "",
      destinationId: "", ratePerTon: "", validFrom: localIsoDate(new Date()),
    }, null);
  }

  onEdit(): void {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    const rate = context.getObject() as MarketFreightRate;
    void this.openDialog({
      title: this.text("marketFreightRateTitleEdit"),
      isNew: false,
      municipalityCode: rate.MunicipalityCode,
      municipalityLabel: municipalityLabel(rate.Municipality?.Name, rate.Municipality?.StateAbbreviation),
      destinationId: String(rate.DestinationId ?? ""),
      ratePerTon: String(rate.RatePerTon ?? "").replace(".", ","),
      validFrom: rate.ValidFrom,
    }, context);
  }

  async onPickMunicipality(): Promise<void> {
    const context = await DialogHelper.openTableSelectDialog(this, "MunicipalitiesSelectDialog", ["Code", "Name", "StateAbbreviation"]);
    if (!context) return;
    this.rateModel().setProperty("/municipalityCode", String(context.getProperty("Code")));
    this.rateModel().setProperty("/municipalityLabel",
      municipalityLabel(context.getProperty("Name") as string, context.getProperty("StateAbbreviation") as string));
  }

  private markRate(error?: "invalid" | "ambiguous"): void {
    const input = this.byId("freightRateValue") as Input;
    input.setValueState(error ? "Error" : "None");
    if (error) input.setValueStateText(this.text(numberErrorKey(error)));
  }

  /** Ao sair do campo: mostra o erro ou reescreve o valor como foi entendido (ex.: "1500.5" vira "1500,5"). */
  onRateChange(): void {
    const { value, error } = parseStrictDecimal(this.rateModel().getProperty("/ratePerTon") as string);
    this.markRate(error);
    if (!error && value !== null) this.rateModel().setProperty("/ratePerTon", formatStrictDecimal(value));
  }

  onDialogCancel(): void {
    this.dialog?.close();
  }

  async onDialogSave(): Promise<void> {
    const form = this.rateModel().getData() as RateForm;
    const { value: rate, error } = parseStrictDecimal(form.ratePerTon);
    if (error) {
      this.markRate(error);
      return;
    }
    if (!form.municipalityCode || !form.destinationId || !(rate > 0) || !form.validFrom) {
      MessageBox.warning(this.text("marketFreightRateInvalid"));
      return;
    }

    const model = this.getView().getModel() as ODataModel;
    this.setBusy(true);
    try {
      let created: Context | undefined;
      if (this.editing) {
        void this.editing.setProperty("RatePerTon", rate).catch((): void => undefined);
        void this.editing.setProperty("ValidFrom", form.validFrom).catch((): void => undefined);
      } else {
        created = this.binding().create({
          MunicipalityCode: form.municipalityCode,
          DestinationId: Number(form.destinationId),
          RatePerTon: rate,
          ValidFrom: form.validFrom,
        }, false, false, false);
      }
      if (await saveMarketChanges(model, created)) {
        this.dialog?.close();
        MessageToast.show(this.text(this.editing ? "commonUpdated" : "commonSaved"));
      }
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete(): Promise<void> {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToDelete"));
      return;
    }
    if (!(await confirmDialog(this.text("commonDeleteConfirm"), this.text("commonDelete")))) return;

    this.setBusy(true);
    try {
      // Grupo "$auto": a exclusão sai na hora; no update group diferido a promessa só resolveria no submitBatch.
      await context.delete("$auto");
      MessageToast.show(this.text("commonDeleted"));
    } catch {
      // erro já exibido pelo handler global de mensagens
    } finally {
      this.setBusy(false);
    }
  }
}
