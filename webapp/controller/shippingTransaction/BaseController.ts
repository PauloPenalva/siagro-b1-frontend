import Context from "sap/ui/model/Context";
import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";

export abstract class BaseController extends CommonController {

  /**
   * Linha marcada numa `sap.ui.table.Table` de seleção única (GAC-1225).
   *
   * A seleção do grid é por ÍNDICE do binding, não por item: o contexto precisa ser lido na hora,
   * porque ordenar ou filtrar muda a linha que mora naquele índice.
   */
  protected getSelectedRowContext(tableId: string): Context {
    const table = this.byId(tableId) as Table;
    const [index] = table.getSelectedIndices();

    return index === undefined ? null : table.getContextByIndex(index);
  }

  protected clearRowSelection(tableId: string): void {
    (this.byId(tableId) as Table).clearSelection();
  }
}
