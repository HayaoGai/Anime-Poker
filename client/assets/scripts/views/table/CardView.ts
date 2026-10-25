import { _decorator, Color, Component, instantiate, Node, Prefab, Sprite, Tween, tween, UITransform, Vec3 } from 'cc';
import { audio } from '../../core/AudioManager';
import type { Card } from '../../shared/cards';
import { cardFrames, type CardFaceFrames } from './CardFrames';

const { ccclass, property, menu, requireComponent } = _decorator;

/** 攤牌時不屬於贏家牌型的牌變暗 */
const DIMMED_COLOR = new Color(120, 120, 130, 255);

/** CardFace.prefab 的設計尺寸（與牌面圖片相同），依牌的大小縮放 */
const FACE_WIDTH = 200;
const FACE_HEIGHT = 280;

/** CardFace.prefab 子節點名稱 → 對應的牌面圖層 */
const FACE_LAYERS: Record<keyof CardFaceFrames, string> = { rank: 'Rank', smallSuit: 'SmallSuit', bigSuit: 'BigSuit', deco: 'Deco' };

/**
 * 一張牌：牌背只有本身的 Sprite；牌面為本身顯示底紙，再疊上 CardFace.prefab 的點數、花色與裝飾。
 * 翻牌動畫為 scaleX 1 → 0（換圖）→ 1
 */
@ccclass('CardView')
@menu('AnimePoker/CardView')
@requireComponent(Sprite)
export class CardView extends Component {
    @property({ type: Node, tooltip: '贏牌時標亮的外框（可選）' })
    highlight: Node | null = null;

    @property({ type: Prefab, tooltip: '牌面的點數、花色與裝飾圖層' })
    facePrefab: Prefab | null = null;

    private card: Card | null = null;
    private faceUp = false;
    private baseScale = new Vec3(1, 1, 1);
    private face: Node | null = null;
    private readonly layers = new Map<keyof CardFaceFrames, Sprite>();

    protected onLoad(): void {
        this.baseScale = this.node.scale.clone();
        this.ensureFace();
        this.setHighlight(false);
    }

    get code(): Card | null {
        return this.card;
    }

    get isFaceUp(): boolean {
        return this.faceUp;
    }

    /** 直接顯示（不播動畫）；card 為 null 時顯示牌背 */
    show(card: Card | null, faceUp: boolean): void {
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this.baseScale);
        this.card = card;
        this.faceUp = faceUp && card !== null;
        this.applyFrame();
    }

    /** 翻到牌面 */
    flip(card: Card, duration = 0.28, delay = 0): Promise<void> {
        this.card = card;
        return new Promise((resolve) => {
            const half = duration / 2;
            tween(this.node)
                .delay(delay)
                .to(half, { scale: new Vec3(0, this.baseScale.y * 1.06, 1) }, { easing: 'quadIn' })
                .call(() => {
                    this.faceUp = true;
                    this.applyFrame();
                    void audio.playSfx('card_flip', 0.8);
                })
                .to(half, { scale: this.baseScale }, { easing: 'quadOut' })
                .call(() => resolve())
                .start();
        });
    }

    setHighlight(on: boolean): void {
        if (this.highlight) this.highlight.active = on;
    }

    setDimmed(on: boolean): void {
        // Sprite 的顏色不會傳給子節點，牌面各層要一起設定
        const color = on ? DIMMED_COLOR : Color.WHITE;
        this.getComponent(Sprite)!.color = color;
        this.ensureFace();
        for (const sprite of this.layers.values()) sprite.color = color;
    }

    /** 清除標亮與變暗 */
    clearEmphasis(): void {
        this.setHighlight(false);
        this.setDimmed(false);
    }

    /** 建立牌面圖層。牌桌可能在節點啟用（onLoad）前就呼叫 show()，因此在第一次需要時建立 */
    private ensureFace(): void {
        if (this.face || !this.facePrefab) return;
        const face = instantiate(this.facePrefab);
        const size = this.getComponent(UITransform)!.contentSize;
        face.setScale(size.width / FACE_WIDTH, size.height / FACE_HEIGHT, 1);
        face.active = false;
        this.node.addChild(face);
        // 疊在牌的底紙之上、標亮外框之下
        face.setSiblingIndex(0);
        for (const [layer, name] of Object.entries(FACE_LAYERS) as [keyof CardFaceFrames, string][]) {
            const sprite = face.getChildByName(name)?.getComponent(Sprite);
            if (sprite) this.layers.set(layer, sprite);
        }
        this.face = face;
    }

    private applyFrame(): void {
        this.ensureFace();
        const sprite = this.getComponent(Sprite)!;
        const card = this.faceUp ? this.card : null;
        sprite.spriteFrame = card ? cardFrames.paper : cardFrames.back;
        if (!this.face) return;
        this.face.active = card !== null;
        if (!card) return;
        const frames = cardFrames.face(card);
        for (const [layer, target] of this.layers) {
            const frame = frames[layer];
            target.node.active = frame !== null;
            target.spriteFrame = frame;
        }
    }
}
