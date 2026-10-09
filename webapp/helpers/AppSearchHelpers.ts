/** Item do menu lateral como o `/security` o devolve (camelCase). */
type MenuNode = {
  title?: string;
  key?: string;
  enabled?: boolean;
  icon?: string;
  items?: MenuNode[];
};

export type MenuData = { navigation?: MenuNode[]; fixedNavigation?: MenuNode[] };

/** Um aplicativo que a pesquisa do ShellBar pode abrir. */
export type MenuApp = { key: string; title: string; group: string; icon: string };

function normalize(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Achata o menu lateral do usuário na lista de aplicativos pesquisáveis.
 *
 * O menu já vem filtrado pelo perfil, então a pesquisa nunca oferece uma tela que o usuário não
 * pode abrir. Só as folhas entram: o grupo também tem `key`, mas ela identifica o item de menu,
 * não é uma rota. Item desabilitado fica de fora, como no próprio menu.
 */
export function flattenMenuApps(menu: MenuData): MenuApp[] {
  const apps: MenuApp[] = [];

  const visit = (nodes: MenuNode[], parent?: MenuNode) => {
    for (const node of nodes ?? []) {
      if (!node || node.enabled === false) {
        continue;
      }

      if (node.items?.length) {
        visit(node.items, node);
      } else if (node.key) {
        apps.push({
          key: node.key,
          title: node.title ?? "",
          group: parent?.title ?? "",
          icon: node.icon || parent?.icon || "",
        });
      }
    }
  };

  visit(menu?.navigation);
  visit(menu?.fixedNavigation);

  return apps;
}

/**
 * Filtra os aplicativos pelo texto digitado, em título e grupo, sem diferenciar maiúscula nem
 * acento. Cada palavra precisa aparecer, em qualquer ordem ("venda contr" acha "Contratos de
 * Venda"). Busca vazia não sugere nada, para a lista não abrir ao só focar o campo.
 */
export function filterApps(apps: MenuApp[], query: string): MenuApp[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [];
  }

  return apps.filter((app) => {
    const text = normalize(`${app.title} ${app.group}`);

    return words.every((word) => text.includes(word));
  });
}

/**
 * Decide qual aplicativo abrir quando o usuário confirma a pesquisa só com o texto (Enter, sem
 * escolher sugestão).
 *
 * "Contratos de Venda" também casa com "Contratos de Compra", então o título exato vence e só na
 * falta dele se abre o primeiro resultado.
 */
export function resolveApp(apps: MenuApp[], query: string): MenuApp {
  const search = normalize(query);

  if (!search) {
    return undefined;
  }

  return apps.find((app) => normalize(app.title) === search) ?? filterApps(apps, query)[0];
}
