import { _decorator, Color, Component, Node, Sprite, Tween, tween, Vec3 } from 'cc';
import { audio } from '../../core/AudioManager';
import type { Card } from '../../shared/cards';
import { cardFrames } from './CardFrames';

const { ccclass, property, menu, requireComponent } = _decorator;

/** 攤牌時不屬於贏家牌型的牌變暗 */
const DIMMED_COLOR = new Color(120, 120, 130, 255);

/** 一張牌：顯示牌背或牌面，翻牌動畫為 scaleX 1 → 0（換圖）→ 1 */
@ccclass('CardView')
@menu('AnimePoker/CardView')
@requireComponent(Sprite)
export class CardView extends Component {
    @property({ type: Node, tooltip: '贏牌時標亮的外框（可選）' })
    highlight: Node | null = null;

    private card: Card | null = null;
    private faceUp = false;
    private baseScale = new Vec3(1, 1, 1);

    protected onLoad(): void {
        this.baseScale = this.node.scale.clone();
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
        this.getComponent(Sprite)!.color = on ? DIMMED_COLOR : Color.WHITE;
    }

    /** 清除標亮與變暗 */
    clearEmphasis(): void {
        this.setHighlight(false);
        this.setDimmed(false);
    }

    private applyFrame(): void {
        const sprite = this.getComponent(Sprite)!;
        sprite.spriteFrame = this.faceUp && this.card ? cardFrames.face(this.card) : cardFrames.back;
    }
}
