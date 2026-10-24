import Select from "sap/m/Select";
import SessionService from "siagrob1/services/SessionService";
import CommonController from "../common/CommonController";

/** Tipos de documento que só existem fora do modo SAP B1 (cadastros mantidos no SAP). */
const STANDALONE_ONLY_CODES = ["Customer", "Supplier", "Item", "FreightOrder", "FreightInvoice"];

export abstract class BaseController extends CommonController {

  /** No modo SAPB1 cliente, fornecedor e produto são do SAP e o TMS não existe: remove-os do Select de documento. */
  protected hideStandaloneOnlyDocuments(): void {
    if (!SessionService.isSapMode()) {
      return;
    }

    const select = this.byId("docNumberTransactionCode") as Select;
    STANDALONE_ONLY_CODES.forEach((key) => {
      const item = select.getItemByKey(key);
      if (item) {
        select.removeItem(item).destroy();
      }
    });
  }
}
