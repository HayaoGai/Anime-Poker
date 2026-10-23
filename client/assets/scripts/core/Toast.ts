import { Canvas, director, instantiate, Label, Node, Prefab, tween, UIOpacity, Vec3 } from 'cc';
import { audio } from './AudioManager';

const SHOW_SECONDS = 2.4;
const GAP = 96;
/** 預設與頂部按鈕列同高，避免蓋住面板標題 */
const DEFAULT_TOP_Y = 440;

/**
 * 畫面上方的短暫提示（房間通知、錯誤訊息）。最新的在最上面，同時最多 3 則。
 * Prefab 由場景的 View 註冊（含 Label 子節點），之後任何地方都能呼叫 toast.show。
 */
class ToastService {
    private prefab: Prefab | null = null;
    private topY = DEFAULT_TOP_Y;
    private active: Node[] = [];

    /** @param topY 第一則提示的 y 座標（各場景依頂部 UI 調整） */
    register(prefab: Prefab | null, topY = DEFAULT_TOP_Y): void {
        if (prefab) this.prefab = prefab;
        this.topY = topY;
    }

    show(text: string): void {
        const canvas = director.getScene()?.getComponentInChildren(Canvas);
        if (!this.prefab || !canvas || !text) return;

        // 切換場景時，上一個場景的提示連同 tween 一起被銷毀，淡出後的移除不會執行，先清掉
        this.active = this.active.filter((n) => n.isValid);

        const node = instantiate(this.prefab);
        const label = node.getComponentInChildren(Label);
        if (label) label.string = text;
        canvas.node.addChild(node);
        node.setSiblingIndex(canvas.node.children.length - 1);

        this.active.unshift(node);
        while (this.active.length > 3) this.active.pop()!.destroy();
        this.layout();
        void audio.playSfx('notice', 0.6);

        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity)
            .to(0.2, { opacity: 255 })
            .delay(SHOW_SECONDS)
            .to(0.3, { opacity: 0 })
            .call(() => {
                const index = this.active.indexOf(node);
                if (index !== -1) this.active.splice(index, 1);
                node.destroy();
            })
            .start();
    }

    private layout(): void {
        this.active.forEach((node, i) => {
            const base = node.position;
            tween(node).to(0.18, { position: new Vec3(base.x, this.topY - i * GAP, 0) }, { easing: 'quadOut' }).start();
        });
    }
}

export const toast = new ToastService();
