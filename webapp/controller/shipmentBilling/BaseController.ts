import CommonController from "siagrob1/controller/common/CommonController";

/**
 * Ficou vazia depois que `formatCustomerTaxId` saiu (a coluna passou a ser
 * desnormalizada em `SalesContract`). Mantida como ponto de extensão; se não
 * for usada, `Main.controller` pode estender `CommonController` direto.
 */
export abstract class BaseController extends CommonController {

}
