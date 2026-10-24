import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import TreeTable from "sap/ui/table/TreeTable";
import Form from "sap/ui/layout/form/Form";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { DropInfo$DropEvent } from "sap/ui/core/dnd/DropInfo";
import Control from "sap/ui/core/Control";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import {
	buildMenuTree, diffMenuTree, findNode, findParent, findSiblings, moveNode,
	DropPosition, MenuNode, MenuRow,
} from "siagrob1/helpers/MenuTreeHelpers";

const GROUP = "menuTree";
const SELECT = "Key,Title,Icon,Enabled,Expanded,StandaloneOnly,Order,ParentKey";

/**
 * Organização visual do menu: árvore com arrastar-e-soltar + edição lateral.
 * Tudo é editado em memória e só vai para o servidor no "Salvar".
 * @namespace siagrob1.controller.menus
 */
export default class Main extends BaseController {
	private treeModel = new JSONModel({ nodes: [] as MenuNode[] });
	private uiModel = new JSONModel({ busy: false, dirty: false, selectedPath: null as string });
	private original: MenuRow[] = [];
	private contexts = new Map<string, Context>();
	private listBinding: ODataListBinding;
	private selectedKey: string = null;

	onInit(): void {
		this.getView().setModel(this.treeModel, "tree");
		this.getView().setModel(this.uiModel, "ui");
		this.getRouter().getRoute("menus").attachPatternMatched(() => void this.load());
	}

	private tree(): TreeTable {
		return this.byId("menuTree") as TreeTable;
	}

	private nodes(): MenuNode[] {
		return this.treeModel.getProperty("/nodes") as MenuNode[];
	}

	private async load(): Promise<void> {
		const oModel = this.getView().getModel() as ODataModel;
		if (oModel.hasPendingChanges(GROUP)) oModel.resetChanges(GROUP);
		this.setBusy(true);
		try {
			this.listBinding = oModel.bindList("/MenuItems", undefined, [], [], {
				$select: SELECT,
				$$updateGroupId: GROUP,
			});
			const ctxs = await this.listBinding.requestContexts(0, 10000);
			this.contexts = new Map(ctxs.map((c) => [c.getProperty("Key") as string, c]));
			this.original = ctxs.map((c) => ({ ...(c.getObject() as MenuRow) }));
			this.treeModel.setProperty("/nodes", buildMenuTree(this.original));
			this.uiModel.setProperty("/dirty", false);
			this.select(null);
			this.tree().expandToLevel(1);
		} finally {
			this.setBusy(false);
		}
	}

	/** Re-renderiza a árvore preservando expansão e a seleção pela chave. */
	private refreshTree(selectKey: string = this.selectedKey): void {
		this.treeModel.refresh(true);
		this.uiModel.setProperty("/dirty", true);
		this.select(selectKey);
	}

	private pathOf(key: string, list = this.nodes(), base = "/nodes"): string {
		for (let i = 0; i < list.length; i++) {
			const p = `${base}/${i}`;
			if (list[i].Key === key) return p;
			const child = this.pathOf(key, list[i].children, `${p}/children`);
			if (child) return child;
		}
		return null;
	}

	private select(key: string): void {
		this.selectedKey = key;
		const path = key ? this.pathOf(key) : null;
		this.uiModel.setProperty("/selectedPath", path);
		const form = this.byId("menuItemForm") as Form;
		if (path) form.bindElement({ path, model: "tree" });
		else form.unbindElement("tree");

		if (!path) {
			this.tree().clearSelection();
			return;
		}
		// expande os ancestrais e marca a linha
		const ancestors: string[] = [];
		let parent = findParent(this.nodes(), key);
		while (parent) {
			ancestors.unshift(parent.Key);
			parent = findParent(this.nodes(), parent.Key);
		}
		for (let i = 0; i < 2000; i++) {
			const ctx = this.tree().getContextByIndex(i);
			if (!ctx) break;
			const rowKey = ctx.getProperty("Key") as string;
			if (rowKey === key) {
				if (this.tree().getSelectedIndex() !== i) this.tree().setSelectedIndex(i);
				break;
			}
			if (ancestors.includes(rowKey) && !this.tree().isExpanded(i)) this.tree().expand(i);
		}
	}

	onSelectionChange(): void {
		const ctx = this.tree().getContextByIndex(this.tree().getSelectedIndex());
		const key = ctx ? (ctx.getProperty("Key") as string) : null as string;
		if (key !== this.selectedKey) this.select(key);
	}

	onFieldChange(): void {
		this.uiModel.setProperty("/dirty", true);
	}

	onDrop(ev: DropInfo$DropEvent): void {
		const source = (ev.getParameter("draggedControl") as Control).getBindingContext("tree");
		const target = (ev.getParameter("droppedControl") as Control).getBindingContext("tree");
		if (!source || !target) return;
		const sourceKey = source.getProperty("Key") as string;
		const targetKey = target.getProperty("Key") as string;
		const position = ev.getParameter("dropPosition") as DropPosition;
		if (!moveNode(this.nodes(), sourceKey, targetKey, position)) {
			MessageToast.show("Não é possível mover um item para dentro dele mesmo.");
			return;
		}
		this.refreshTree(sourceKey);
	}

	onMoveUp(): void {
		this.shift(-1);
	}

	onMoveDown(): void {
		this.shift(1);
	}

	private shift(delta: number): void {
		const siblings = findSiblings(this.nodes(), this.selectedKey);
		const i = siblings.findIndex((n) => n.Key === this.selectedKey);
		const j = i + delta;
		if (j < 0 || j >= siblings.length) return;
		[siblings[i], siblings[j]] = [siblings[j], siblings[i]];
		this.refreshTree();
	}

	/** Sobe um nível: vira irmão logo depois do pai. */
	onOutdent(): void {
		const parent = findParent(this.nodes(), this.selectedKey);
		if (!parent) return;
		moveNode(this.nodes(), this.selectedKey, parent.Key, "After");
		this.refreshTree();
	}

	/** Desce um nível: vira último filho do irmão de cima. */
	onIndent(): void {
		const siblings = findSiblings(this.nodes(), this.selectedKey);
		const i = siblings.findIndex((n) => n.Key === this.selectedKey);
		if (i <= 0) return;
		moveNode(this.nodes(), this.selectedKey, siblings[i - 1].Key, "On");
		this.refreshTree();
	}

	onCreate(): void {
		const node: MenuNode = {
			Key: `novoItem${Date.now() % 100000}`,
			Title: "Novo item",
			Icon: "sap-icon://folder-blank",
			Enabled: true,
			Expanded: false,
			StandaloneOnly: false,
			Order: 0,
			ParentKey: null,
			isNew: true,
			children: [],
		};
		const selected = this.selectedKey ? findNode(this.nodes(), this.selectedKey) : null;
		(selected ? selected.children : this.nodes()).push(node);
		this.refreshTree(node.Key);
		setTimeout(() => this.byId("keyInput")?.focus(), 100);
	}

	async onDelete(): Promise<void> {
		const node = findNode(this.nodes(), this.selectedKey);
		if (!node) return;
		if (node.children.length) {
			MessageBox.warning("Este item tem subitens. Mova ou exclua os subitens antes.");
			return;
		}
		if (!(await confirmDialog(`Excluir o item "${node.Title}" do menu?`, "Excluir item"))) return;
		const siblings = findSiblings(this.nodes(), node.Key);
		siblings.splice(siblings.indexOf(node), 1);
		this.refreshTree(null);
	}

	async onDiscard(): Promise<void> {
		if (await confirmDialog("Descartar todas as alterações não salvas?", "Descartar")) await this.load();
	}

	async onRefresh(): Promise<void> {
		if (this.uiModel.getProperty("/dirty") && !(await confirmDialog("Há alterações não salvas. Recarregar mesmo assim?", "Recarregar"))) return;
		await this.load();
	}

	private validate(): string {
		const keys = new Set<string>();
		const walk = (list: MenuNode[]): string => {
			for (const n of list) {
				if (!n.Key?.trim() || !n.Title?.trim()) return "Todo item precisa de Código e Título.";
				if (keys.has(n.Key)) return `Código "${n.Key}" repetido.`;
				keys.add(n.Key);
				const err = walk(n.children);
				if (err) return err;
			}
			return null;
		};
		return walk(this.nodes());
	}

	async onSave(): Promise<void> {
		const error = this.validate();
		if (error) {
			MessageBox.warning(error);
			return;
		}
		const diff = diffMenuTree(this.nodes(), this.original);
		const oModel = this.getView().getModel() as ODataModel;
		this.setBusy(true);
		try {
			// Em fases: pai novo precisa existir antes do filho apontar para ele,
			// e o filho precisa sair do pai antes de o pai ser excluído.
			if (diff.creates.length) {
				diff.creates.forEach((row) => {
					this.listBinding.create(row, true).created().catch((): void => undefined);
				});
				if (!(await this.submit(oModel))) return;
			}
			if (diff.updates.length) {
				diff.updates.forEach(({ Key, changes }) => {
					Object.entries(changes).forEach(([f, v]) => {
						this.contexts.get(Key).setProperty(f, v).catch((): void => undefined);
					});
				});
				if (!(await this.submit(oModel))) return;
			}
			for (const key of diff.deletes) {
				const p = this.contexts.get(key).delete(GROUP);
				if (!(await this.submit(oModel))) return;
				await p.catch((): void => undefined);
			}
			MessageToast.show("Menu salvo. Recarregue a página para ver o menu novo.");
			await this.load();
		} finally {
			this.setBusy(false);
		}
	}

	private async submit(oModel: ODataModel): Promise<boolean> {
		await oModel.submitBatch(GROUP);
		if (!oModel.hasPendingChanges(GROUP)) return true;
		oModel.resetChanges(GROUP);
		MessageBox.error("Não foi possível salvar todas as alterações. A árvore será recarregada.", {
			onClose: (): void => void this.load(),
		});
		return false;
	}
}
