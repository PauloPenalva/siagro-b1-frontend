/**
 * Data `yyyy-MM-dd` pelo calendário LOCAL do navegador — o "hoje" que o usuário vê no relógio.
 *
 * Não use `new Date().toISOString().slice(0, 10)` como padrão de campo de data: ele dá o dia em UTC,
 * que em Brasília já virou depois das 21:00. Foi assim que a carga CG000008 (CEAGUI), criada em
 * 08/10 às 23:22, nasceu com a data 09/10.
 */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
