/*
 * Falha se alguma expression binding (`{= ...}`) de view/fragment XML usar `==` ou `!=`.
 * O UI5 só aceita `===` e `!==` ("Expected '}' and instead saw '='") e o erro só
 * aparece em runtime, ao abrir a tela.
 *
 * Uso: node scripts/check-expression-bindings.js
 */
const fs = require("fs");
const path = require("path");

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(view|fragment)\.xml$/.test(e.name)) out.push(p);
  }
  return out;
}

let bad = 0;
for (const file of walk(path.join(__dirname, "..", "webapp"), [])) {
  const xml = fs.readFileSync(file, "utf8");
  for (const m of xml.matchAll(/\{=[\s\S]*?\}"/g)) {
    // remove literais de string antes de procurar o operador
    const expr = m[0].replace(/'[^']*'/g, "''");
    if (/(^|[^=!<>])==(?!=)|!=(?!=)/.test(expr)) {
      bad++;
      const line = xml.slice(0, m.index).split("\n").length;
      console.error(`${path.relative(process.cwd(), file)}:${line}: use === / !== em expression binding`);
    }
  }
}
if (bad) process.exit(1);
console.log("expression bindings ok");
