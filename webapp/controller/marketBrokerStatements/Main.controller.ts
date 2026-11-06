import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import {
  AccountOption, PeriodAccountFilter, accountOptions, buildStatementsFilter
} from "siagrob1/helpers/MarketHedgeHelpers";
import { loadCounterparties, saveMarketChanges } from "siagrob1/helpers/MarketLookups";
import {
  MARKET_MANAGE, formatStrictDecimal, numberErrorKey, parseStrictDecimal
} from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";
import { MarketBrokerStatement, MarketCounterparty } from "siagrob1/types/MarketHedges";

type StatementForm = {
  title: string;
  isNew: boolean;
  /** Contas oferecidas no Select: só ativas na inclusão; todas na alteração (a atual pode estar inativa). */
  accounts: AccountOption[];
  accountId: string;
  date: string;
  /** Textos digitados, vírgula decimal pt-BR. */
  dailyAdjustment: string;
  marginRequired: string;
  marginDeposited: string;
  /** Chave do Select, valor do enum no OData (`Brl`/`Usd`). */
  currency: string;
  notes: string;
};

type NumberField = "dailyAdjustment" | "marginRequired" | "marginDeposited";

const NUMBER_FIELDS: { field: NumberField; id: string; nonNegative: boolean }[] = [
  { field: "dailyAdjustment", id: "statementAdjustment", nonNegative: false },
  { field: "marginRequired", id: "statementRequired", nonNegative: true },
  { field: "marginDeposited", id: "statementDeposited", nonNegative: true },
];

/**
 * Ajustes diários e margem por conta de corretora (OData `MarketBrokerStatements`): só registro
 * informativo, nada daqui gera lançamento financeiro ou contábil.
 *
 * @namespace siagrob1.controller.marketBrokerStatements
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private dialog?: Dialog;
  /** Contexto em alteração; nulo = inclusão. */
  private editing: Context | null = null;
  private counterparties: MarketCounterparty[] = [];
  private visited = false;

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getView().setModel(new JSONModel({}), "filter");
    this.getView().setModel(new JSONModel({ accounts: [] }), "lookup");
    this.getView().setModel(new JSONModel({}), "statement");
    this.getRouter().getRoute("marketBrokerStatements").attachPatternMatched(() => void this.routeMatched());
  }

  private async routeMatched(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    this.counterparties = await loadCounterparties(this.getView().getModel() as ODataModel);
    (this.getView().getModel("lookup") as JSONModel).setProperty("/accounts", accountOptions(this.counterparties, "Broker", false));
    const revisit = this.visited;
    this.visited = true;
    this.applyFilters();
    // Na revisita o filtro não muda e o binding não relê sozinho: lançamentos de outra sessão não apareceriam.
    if (revisit) this.binding()?.refresh();
  }

  private text(key: string): string {
    return this.bundle?.getText(key) ?? key;
  }

  private table(): Table {
    return this.byId("tableMarketBrokerStatements") as Table;
  }

  private filterModel(): JSONModel {
    return this.getView().getModel("filter") as JSONModel;
  }

  private statementModel(): JSONModel {
    return this.getView().getModel("statement") as JSONModel;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  private applyFilters(): void {
    this.binding()?.changeParameters({ $filter: buildStatementsFilter(this.filterModel().getData() as PeriodAccountFilter) });
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

  private async openDialog(form: StatementForm, editing: Context | null): Promise<void> {
    this.editing = editing;
    this.statementModel().setData(form);
    this.dialog ??= await this.loadFragment({ name: "siagrob1.view.marketBrokerStatements.fragments.StatementDialog" }) as Dialog;
    this.markNumbers({});
    this.dialog.open();
  }

  onCreate(): void {
    const accounts = accountOptions(this.counterparties, "Broker", true);
    const filterAccount = (this.filterModel().getProperty("/AccountId") as string) ?? "";
    // Conta do filtro se for elegível; senão a única conta elegível, quando só há uma.
    const accountId = accounts.some((a) => a.id === filterAccount) ? filterAccount : accounts.length === 1 ? accounts[0].id : "";
    void this.openDialog({
      title: this.text("marketStatementTitleNew"), isNew: true, accounts,
      accountId, date: localIsoDate(new Date()),
      dailyAdjustment: "", marginRequired: "", marginDeposited: "", currency: "Brl", notes: "",
    }, null);
  }

  onEdit(): void {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    const row = context.getObject() as MarketBrokerStatement;
    const text = (value: number | string): string => formatStrictDecimal(Number(value));
    void this.openDialog({
      title: this.text("marketStatementTitleEdit"), isNew: false, accounts: accountOptions(this.counterparties, "Broker", false),
      // A lista não traz AccountId (auto-$select só pede o que as colunas usam): a chave vem do Account expandido.
      accountId: String(row.AccountId ?? row.Account?.Id ?? ""), date: row.Date,
      dailyAdjustment: text(row.DailyAdjustment), marginRequired: text(row.MarginRequired), marginDeposited: text(row.MarginDeposited),
      currency: row.Currency, notes: row.Notes ?? "",
    }, context);
  }

  /** Marca (ou limpa) o estado de erro dos três campos numéricos; `errors` traz a chave de i18n por campo. */
  private markNumbers(errors: Partial<Record<NumberField, string>>): void {
    for (const { field, id } of NUMBER_FIELDS) {
      const input = this.byId(id) as Input;
      if (!input) continue;
      input.setValueState(errors[field] ? "Error" : "None");
      if (errors[field]) input.setValueStateText(this.text(errors[field]));
    }
  }

  /** Ao sair do campo: mostra o erro ou reescreve o valor como foi entendido. */
  onNumberChange(ev: Event): void {
    const source = ev.getSource();
    const item = NUMBER_FIELDS.find((candidate) => this.byId(candidate.id) === source);
    if (!item) return;
    const { field } = item;
    const input = source as Input;
    const { value, error } = parseStrictDecimal(this.statementModel().getProperty(`/${field}`) as string);
    input.setValueState(error ? "Error" : "None");
    if (error) input.setValueStateText(this.text(numberErrorKey(error)));
    else if (value !== null) this.statementModel().setProperty(`/${field}`, formatStrictDecimal(value));
  }

  onDialogCancel(): void {
    this.dialog?.close();
  }

  async onDialogSave(): Promise<void> {
    const form = this.statementModel().getData() as StatementForm;
    const errors: Partial<Record<NumberField, string>> = {};
    const values = {} as Record<NumberField, number>;
    for (const { field, nonNegative } of NUMBER_FIELDS) {
      const { value, error } = parseStrictDecimal(form[field]);
      if (error) errors[field] = numberErrorKey(error);
      else if (nonNegative && value !== null && value < 0) errors[field] = "marketStatementNegative";
      values[field] = value ?? 0;
    }
    this.markNumbers(errors);
    if (Object.keys(errors).length) return;
    if (!form.accountId || !form.date || !form.currency) {
      MessageBox.warning(this.text("marketStatementInvalid"));
      return;
    }

    const model = this.getView().getModel() as ODataModel;
    this.setBusy(true);
    try {
      let created: Context | undefined;
      const notes = form.notes?.trim() || null;
      if (this.editing) {
        const changes: Record<string, unknown> = {
          AccountId: Number(form.accountId), Date: form.date, DailyAdjustment: values.dailyAdjustment,
          MarginRequired: values.marginRequired, MarginDeposited: values.marginDeposited, Currency: form.currency, Notes: notes,
        };
        for (const [name, value] of Object.entries(changes)) {
          void this.editing.setProperty(name, value).catch((): void => undefined);
        }
      } else {
        created = this.binding().create({
          AccountId: Number(form.accountId), Date: form.date, DailyAdjustment: values.dailyAdjustment,
          MarginRequired: values.marginRequired, MarginDeposited: values.marginDeposited, Currency: form.currency, Notes: notes,
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
