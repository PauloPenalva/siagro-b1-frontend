import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CommonController from "../common/CommonController";

/** Opção do Select de Natureza (GAC-1181 fase 2) — o rótulo já nasce em pt-BR. */
export type StorageAddressNatureOption = { Key: string; Text: string };

/**
 * @namespace siagrob1.controller.loteArmazenagem
 */
export default class LoteArmazenagemBaseController extends CommonController {

  /**
   * Descobre se o armazém é PRÓPRIO (`WarehousesGetComplement`), o mesmo caminho de
   * `armazem/Complement.controller` e de `shipmentLoads/BaseController#isOwnWarehouseAsync`
   * (GAC-1181 fase 1). Armazém sem registro de complemento, ou sem código informado, equivale
   * a NÃO — mesma leitura do backend (`StorageAddressesCreateService`).
   */
  protected async isOwnWarehouseAsync(warehouseCode: string): Promise<boolean> {
    if (!warehouseCode) return false;

    const func = (this.getModel() as ODataModel).bindContext(this.api.warehousesGetComplement);
    func.setParameter("WarehouseCode", warehouseCode);
    await func.invoke();

    const complement = func.getBoundContext().getObject() as { IsOwn?: boolean };
    return complement?.IsOwn === true;
  }

  /**
   * Monta a oferta do Select de Natureza (GAC-1181 fase 2). "Transbordo" só entra quando o
   * armazém escolhido é PRÓPRIO — mas `currentNature` (o valor já gravado do lote) sempre
   * entra também quando já for Transbordo, mesmo sem `isOwn`: se o complemento do armazém
   * perder o flag depois de o lote já existir, a Edição ainda precisa conseguir mostrar o
   * valor salvo, e não renderizar o Select vazio por o `selectedKey` não casar com nenhum
   * item da lista.
   */
  protected buildNatureOptions(isOwn: boolean, currentNature?: string): StorageAddressNatureOption[] {
    const options: StorageAddressNatureOption[] = [{ Key: "Regular", Text: "Comum" }];

    if (isOwn || currentNature === "Transshipment") {
      options.push({ Key: "Transshipment", Text: "Transbordo" });
    }

    return options;
  }
}
