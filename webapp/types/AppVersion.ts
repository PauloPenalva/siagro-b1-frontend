export type AppVersion = {
  version: string,
  /**
   * Identificador do build publicado. Vem `null` quando o servidor não hospeda o
   * frontend (dev server do UI5) - nesse caso não há o que comparar. O tipo não
   * declara o `null` porque `strictNullChecks` está desligado neste projeto.
   */
  buildId: string,
}
