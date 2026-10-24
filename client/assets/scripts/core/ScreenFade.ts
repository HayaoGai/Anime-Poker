import { _decorator, BlockInputEvents, Canvas, Color, Component, director, easing, Graphics, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

/** 每格最多推進的秒數：場景剛載入的頭幾格常卡頓很久，不限制的話淡出會一閃而過 */
const MAX_STEP = 1 / 30;

export interface ScreenFadeOptions {
    /** 起始透明度（0–255），預設 255 */
    from?: number;
    /** 預設 sineOut */
    ease?: (k: number) => number;
    /** 淡出期間擋住點按 */
    blockInput?: boolean;
}

/**
 * 全畫面純色遮罩，蓋在 Canvas 最上層，淡出到全透明後自行移除。
 * Graphics 不受 UIOpacity 影響，因此每格以新的透明度重畫。
 */
@ccclass('ScreenFade')
export class ScreenFade extends Component {
    private graphics: Graphics | null = null;
    private color = new Color();
    private from = 255;
    private duration = 0;
    private elapsed = 0;
    private ease: (k: number) => number = easing.sineOut;
    private done: (() => void) | null = null;

    /** 回傳的 Promise 在淡出結束（或遮罩隨場景被銷毀）時完成；找不到 Canvas 時立即完成 */
    static show(color: Color, duration: number, options: ScreenFadeOptions = {}): Promise<void> {
        const canvas = director.getScene()?.getComponentInChildren(Canvas)?.node;
        const size = canvas?.getComponent(UITransform)?.contentSize;
        if (!canvas || !size || duration <= 0) return Promise.resolve();

        const node = new Node('ScreenFade');
        node.layer = canvas.layer;
        canvas.addChild(node);
        node.addComponent(UITransform).setContentSize(size);
        if (options.blockInput) node.addComponent(BlockInputEvents);
        const fade = node.addComponent(ScreenFade);
        fade.graphics = node.addComponent(Graphics);
        fade.color.set(color);
        fade.from = options.from ?? 255;
        fade.duration = duration;
        if (options.ease) fade.ease = options.ease;
        fade.draw(fade.from);
        return new Promise((resolve) => (fade.done = resolve));
    }

    protected update(dt: number): void {
        this.elapsed += Math.min(dt, MAX_STEP);
        const t = Math.min(this.elapsed / this.duration, 1);
        this.draw(this.from * (1 - this.ease(t)));
        if (t >= 1) this.node.destroy();
    }

    protected onDestroy(): void {
        this.done?.();
        this.done = null;
    }

    private draw(alpha: number): void {
        const g = this.graphics;
        const size = this.node.getComponent(UITransform)?.contentSize;
        if (!g || !size) return;
        g.clear();
        this.color.a = alpha;
        g.fillColor = this.color;
        // 畫成兩倍大，畫面比例與設計解析度不同時也能蓋滿
        g.rect(-size.width, -size.height, size.width * 2, size.height * 2);
        g.fill();
    }
}
