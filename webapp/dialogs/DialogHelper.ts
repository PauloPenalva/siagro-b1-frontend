import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import Label from "sap/m/Label";
import { ButtonType } from "sap/m/library";
import MessageBox from "sap/m/MessageBox";
import TableSelectDialog, { TableSelectDialog$ConfirmEvent } from "sap/m/TableSelectDialog";
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

/**
 * Um TableSelectDialog por (view, fragmento).
 *
 * O reaproveitamento antigo era código morto: o id era montado como
 * `view.getId() + "_" + name` e procurado com `view.byId(id)`, que prefixa o id
 * da view outra vez - a busca nunca casava. Resultado: cada abertura criava um
 * diálogo novo e o deixava pendurado como dependent da view para sempre.
 */
const selectDialogCache = new Map<string, TableSelectDialog>();

async function getSelectDialog(
  oController: Controller,
  name: string,
  filters: string[],
  defaultFilters: Filter[]
): Promise<TableSelectDialog> {
  const view = oController.getView();
  const key = `${view.getId()}_${name}`;
  const oCached = selectDialogCache.get(key);

  // A view é destruída ao navegar (clearControlAggregation), levando junto os
  // seus dependents - por isso o cache precisa validar antes de reaproveitar.
  if (oCached && !oCached.isDestroyed()) {
    return oCached;
  }

  const oDlg = await Fragment.load({
    name: "siagrob1.dialogs.fragments." + name,
    controller: oController,
    id: key
  }) as TableSelectDialog;

  // A busca não depende da abertura, então é ligada uma única vez.
  oDlg.attachSearch(ev => {
    const value = ev.getParameter("value");
    const aFilters = filters.map(propertyName =>
      new Filter(propertyName, FilterOperator.Contains, value)
    );

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
  selectDialogCache.set(key, oDlg);

  return oDlg;
}

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
  
  /**
   * Abre um TableSelectDialog e resolve com o contexto escolhido.
   *
   * Resolve com `undefined` quando o usuário cancela (botão Cancelar, Esc ou
   * clique fora) - antes disso a Promise simplesmente nunca era resolvida, e
   * todo cancelamento deixava um `await` pendurado para sempre.
   *
   * `elementPath` atende os diálogos cuja lista é **relativa** a um pai (ex.: os
   * locais de entrega de um contrato, em `/SalesContracts(guid)/DeliveryLocations`,
   * que só existem sob a rota de navegação). A ligação é refeita a cada abertura:
   * o diálogo é reaproveitado por (view, fragmento) e o pai muda entre navegações.
   */
  openTableSelectDialog: async (
    oController: Controller,
    name: string,
    filters: string[],
    defaultFilters: Filter[] = [],
    elementPath?: string
  ): Promise<Context | undefined> => {
    const oDlg = await getSelectDialog(oController, name, filters, defaultFilters);

    if (elementPath) {
      oDlg.bindElement(elementPath);
    }

    // Os filtros também valem na ABERTURA, não só depois de uma busca. Antes disso
    // `defaultFilters` só era aplicado dentro do attachSearch, e a lista abria
    // inteira - passava despercebido porque todo diálogo com filtro fixo o repete
    // no `filters:` do XML. Filtro que muda a cada abertura (ex.: contratos do
    // produto da transferência) não cabe no XML e depende desta linha.
    //
    // Guardado por lista não-vazia de propósito: chamar `.filter([])` substituiria
    // as application filters e apagaria o filtro declarado no XML de quem não passa
    // defaultFilters (é o caso do HarvestSeasonsSelectDialog).
    if (defaultFilters.length) {
      (oDlg.getBinding("items") as ODataListBinding).filter(defaultFilters);
    }

    return new Promise<Context | undefined>(resolve => {
      // Os handlers são ligados por abertura e desligados no primeiro disparo:
      // como o diálogo é reaproveitado, deixá-los presos resolveria a Promise
      // de uma abertura anterior.
      const finish = (oContext?: Context) => {
        oDlg.detachConfirm(onConfirm);
        oDlg.detachCancel(onCancel);
        resolve(oContext);
      };

      const onConfirm = (ev: TableSelectDialog$ConfirmEvent) => {
        finish(ev.getParameter("selectedItem")?.getBindingContext() as Context);
      };

      const onCancel = () => finish(undefined);

      oDlg.attachConfirm(onConfirm);
      oDlg.attachCancel(onCancel);

      oDlg.open("");
    });
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
