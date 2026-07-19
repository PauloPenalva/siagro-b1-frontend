/*
 * Audita as declarações `<core:CustomData key="descriptionProperty" .../>` das views.
 *
 * O erro que este script pega é silencioso: se a propriedade de origem declarada não
 * existir na entidade do value help, `getProperty` devolve `undefined` e a descrição
 * simplesmente não é preenchida. Em registro já gravado o valor vindo do servidor
 * mascara a falha - ela só aparece em registro novo.
 *
 * Uso (com o SiagroB1.Web no ar):
 *   node scripts/check-value-help-descriptions.js [url-do-metadata]
 *
 * Ver docs/value-help-description-pattern.md.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

const METADATA_URL = process.argv[2] || "http://localhost:50000/odata/$metadata";
const VIEW_ROOT = path.join(__dirname, "..", "webapp", "view");

// value help -> tipo da entidade no EDM (ver openXxxValueHelp em CommonController)
const HANDLER_TO_TYPE = {
  openProcessingCostsListValueHelp: "ProcessingCost",
  openTruckDriversValueHelp: "TruckDriver",
  openTrucksValueHelp: "Truck",
  openBranchsValueHelp: "Branch",
  openSalesContractsDocTypesValueHelp: "DocNumber",
  openDocTypesValueHelp: "DocNumber",
  openStatesValueHelp: "State",
  openAgentsValueHelp: "AgentModel",
  openLogisticRegionsValueHelp: "LogisticRegion",
  openBusinessPartnersValueHelp: "BusinessPartnerModel",
  openSuppliersValueHelp: "BusinessPartnerModel",
  openCostumersValueHelp: "BusinessPartnerModel",
  openItemValueHelp: "ItemModel",
  openUnitsOfMeasureValueHelp: "UnitOfMeasureModel",
  openHarvestSeasonsValueHelp: "HarvestSeason",
  openWarehouseValueHelp: "WarehouseModel",
  openTaxesValueHelp: "Tax",
  openQualityAttribsValueHelp: "QualityAttrib",
  openProcessingServicesValueHelp: "ProcessingService",
  openStorageAddressesValueHelp: "StorageAddress",
  openMenuItemsValueHelp: "MenuItem",
  openPermissionsValueHelp: "Permission",
  openRolesValueHelp: "Role",
  openProfilesValueHelp: "Profile",
};

const get = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      })
      .on("error", reject);
  });

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".xml")) out.push(p);
  }
  return out;
};

(async () => {
  let meta;
  try {
    meta = await get(METADATA_URL);
  } catch (e) {
    console.error("Não consegui ler o metadata em " + METADATA_URL);
    console.error("Suba o SiagroB1.Web ou passe a URL como argumento.");
    process.exit(2);
  }

  const propsOf = (type) => {
    const m = meta.match(new RegExp('<EntityType Name="' + type + '"[\\s\\S]*?</EntityType>'));
    if (!m) return null;
    return [...m[0].matchAll(/<Property Name="([^"]+)"/g)].map((a) => a[1]);
  };

  let checked = 0;
  let broken = 0;

  for (const file of walk(VIEW_ROOT)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const cd = /descriptionProperty" value="([^"]+)"/.exec(line);
      if (!cd) return;

      let handler = null;
      for (let j = i; j >= Math.max(0, i - 25); j--) {
        const h = /valueHelpRequest="\.(\w+)"/.exec(lines[j]);
        if (h) { handler = h[1]; break; }
      }

      const rel = path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/");
      const type = HANDLER_TO_TYPE[handler];
      if (!type) {
        console.log("? handler não mapeado: " + rel + ":" + (i + 1) + "  (" + handler + ")");
        console.log("  adicione-o em HANDLER_TO_TYPE neste script");
        return;
      }

      const props = propsOf(type);
      if (!props) { console.log("? tipo não encontrado no EDM: " + type); return; }

      for (const entry of cd[1].split(",").map((s) => s.trim())) {
        checked++;
        const [target, explicit] = entry.split(":").map((s) => s.trim());
        const source = explicit || target.split("/").pop();
        if (!props.includes(source)) {
          broken++;
          console.log("QUEBRADO " + rel + ":" + (i + 1));
          console.log("  destino=" + target + "  origem=" + source);
          console.log("  " + type + " não tem '" + source + "'. Props: " + props.join(", "));
          console.log("  corrija declarando a origem: value=\"" + target + ":<propriedade>\"");
        }
      }
    });
  }

  console.log("\nverificados: " + checked + " | quebrados: " + broken);
  process.exit(broken ? 1 : 0);
})();
