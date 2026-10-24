/**
 * Lógica pura da tela de organização do menu (árvore editável de MENU_ITEMS).
 */

export type MenuRow = {
	Key: string;
	Title: string;
	Icon: string;
	Enabled: boolean;
	Expanded: boolean;
	StandaloneOnly: boolean;
	Order: number;
	ParentKey: string;
};

export type MenuNode = MenuRow & { isNew?: boolean; children: MenuNode[] };

export type DropPosition = "On" | "Before" | "After";

const EDITABLE_FIELDS = ["Title", "Icon", "Enabled", "Expanded", "StandaloneOnly", "ParentKey", "Order"] as const;

/** Passo da numeração de Order: deixa espaço para inserções manuais futuras. */
export const ORDER_STEP = 10;

export function buildMenuTree(rows: MenuRow[]): MenuNode[] {
	const nodes = new Map<string, MenuNode>();
	rows.forEach((r) => nodes.set(r.Key, { ...r, children: [] }));

	const roots: MenuNode[] = [];
	nodes.forEach((n) => {
		const parent = n.ParentKey ? nodes.get(n.ParentKey) : undefined;
		(parent ? parent.children : roots).push(n);
	});

	const sort = (list: MenuNode[]) => {
		list.sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0) || a.Title.localeCompare(b.Title));
		list.forEach((n) => sort(n.children));
	};
	sort(roots);
	return roots;
}

export function findNode(tree: MenuNode[], key: string): MenuNode {
	for (const n of tree) {
		if (n.Key === key) return n;
		const found = findNode(n.children, key);
		if (found) return found;
	}
	return undefined;
}

/** Lista de irmãos que contém o nó (raiz ou children do pai). */
export function findSiblings(tree: MenuNode[], key: string): MenuNode[] {
	if (tree.some((n) => n.Key === key)) return tree;
	for (const n of tree) {
		const found = findSiblings(n.children, key);
		if (found) return found;
	}
	return undefined;
}

export function findParent(tree: MenuNode[], key: string, parent: MenuNode = null): MenuNode {
	for (const n of tree) {
		if (n.Key === key) return parent;
		const found = findParent(n.children, key, n);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * Move `sourceKey` para dentro (On), antes ou depois de `targetKey`.
 * Devolve false (sem alterar nada) se o movimento criaria um ciclo.
 */
export function moveNode(tree: MenuNode[], sourceKey: string, targetKey: string, position: DropPosition): boolean {
	if (sourceKey === targetKey) return false;
	const source = findNode(tree, sourceKey);
	if (!source || !findNode(tree, targetKey)) return false;
	if (findNode(source.children, targetKey)) return false;

	const from = findSiblings(tree, sourceKey);
	from.splice(from.indexOf(source), 1);

	if (position === "On") {
		findNode(tree, targetKey).children.push(source);
	} else {
		const to = findSiblings(tree, targetKey);
		const idx = to.findIndex((n) => n.Key === targetKey);
		to.splice(position === "Before" ? idx : idx + 1, 0, source);
	}
	return true;
}

export type MenuDiff = {
	creates: MenuRow[];
	updates: { Key: string; changes: Partial<MenuRow> }[];
	/** Chaves a excluir, filhos antes dos pais (a FK ParentKey exige). */
	deletes: string[];
};

/** Renumera Order/ParentKey a partir da posição na árvore e compara com o original. */
export function diffMenuTree(tree: MenuNode[], original: MenuRow[]): MenuDiff {
	const originalByKey = new Map(original.map((r) => [r.Key, r]));
	const seen = new Set<string>();
	const diff: MenuDiff = { creates: [], updates: [], deletes: [] };

	const walk = (list: MenuNode[], parentKey: string) => {
		list.forEach((n, i) => {
			n.ParentKey = parentKey;
			n.Order = (i + 1) * ORDER_STEP;
			seen.add(n.Key);
			const { children, isNew, ...row } = n;
			const before = originalByKey.get(n.Key);
			if (isNew || !before) {
				diff.creates.push(row);
			} else {
				const changes: Partial<MenuRow> = {};
				EDITABLE_FIELDS.forEach((f) => {
					if ((row[f] ?? null) !== (before[f] ?? null)) (changes as Record<string, unknown>)[f] = row[f];
				});
				if (Object.keys(changes).length) diff.updates.push({ Key: n.Key, changes });
			}
			walk(children, n.Key);
		});
	};
	walk(tree, null);

	const depth = (key: string): number => {
		let d = 0;
		let p = originalByKey.get(key)?.ParentKey;
		while (p && d < 50) {
			d++;
			p = originalByKey.get(p)?.ParentKey;
		}
		return d;
	};
	diff.deletes = original
		.filter((r) => !seen.has(r.Key))
		.map((r) => r.Key)
		.sort((a, b) => depth(b) - depth(a));
	return diff;
}
