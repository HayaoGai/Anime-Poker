import { Canvas, director, instantiate, Node, Prefab } from 'cc';
import { PopupBase } from './PopupBase';

/**
 * 彈窗管理：把彈窗 Prefab 實例化到目前場景的 Canvas 最上層並開啟，
 * 回傳的 Promise 在彈窗關閉時以結果 resolve（例如確認框回傳 true / false）。
 */
class PopupService {
    private readonly opened = new Set<Node>();

    /**
     * @param setup 開啟前設定彈窗內容（例如確認框的文字）
     */
    async show<TResult, TPopup extends PopupBase<TResult> = PopupBase<TResult>>(
        prefab: Prefab,
        setup?: (popup: TPopup) => void,
    ): Promise<TResult | undefined> {
        const canvas = director.getScene()?.getComponentInChildren(Canvas);
        if (!canvas) throw new Error('目前場景沒有 Canvas，無法顯示彈窗');

        const node = instantiate(prefab);
        const popup = node.getComponent(PopupBase) as TPopup | null;
        if (!popup) throw new Error(`Prefab ${prefab.name} 缺少 PopupBase 元件`);

        canvas.node.addChild(node);
        node.setSiblingIndex(canvas.node.children.length - 1);
        this.opened.add(node);
        node.once(Node.EventType.NODE_DESTROYED, () => this.opened.delete(node));

        setup?.(popup);
        return popup.open();
    }

    get count(): number {
        return this.opened.size;
    }

    closeAll(): void {
        for (const node of [...this.opened]) node.getComponent(PopupBase)?.close();
    }
}

export const popups = new PopupService();
