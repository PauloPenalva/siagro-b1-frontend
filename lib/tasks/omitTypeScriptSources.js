/**
 * Remove os fontes TypeScript do resultado do build.
 *
 * O `ui5-tooling-transpile-task` já marca os `.ts` com `OmitFromBuildResult` quando
 * `omitTSFromBuildResult` está ligado, mas o `ui5-task-cachebuster-indexing` roda depois e CLONA
 * cada recurso para o caminho `~<timestamp>~/...`. O clone nasce sem as tags do original, então os
 * fontes voltavam para o dist/ - e o dist/ inteiro é publicado no wwwroot do Gateway.
 *
 * Esta task roda depois do cachebuster e remarca o que sobrou. Os `.js.map` gerados pela task
 * `minify` são mantidos de propósito: eles apontam para os `-dbg.js` (JavaScript transpilado, que
 * também é publicado), não para o TypeScript, e são o que torna legível um stack trace de produção.
 *
 * @param {object} parameters Parâmetros da task do UI5 Tooling.
 * @param {object} parameters.workspace Workspace do build.
 * @param {object} parameters.taskUtil Utilitário de tags do UI5 Tooling.
 * @returns {Promise<undefined>} Promise resolvida quando todos os recursos foram marcados.
 */
module.exports = async function ({ workspace, taskUtil }) {
  const resources = await workspace.byGlob("/**/*.ts");

  for (const resource of resources) {
    taskUtil.setTag(resource, taskUtil.STANDARD_TAGS.OmitFromBuildResult);
  }
};
