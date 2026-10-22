import { _decorator, Animation, Color, Component, Label, Node, Sprite, SpriteFrame, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import type { I18nKey } from '../../i18n/I18n';
import { t } from '../../i18n/I18n';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import type { SeatSnapshot } from '../../models/TableSnapshot';
import type { Card } from '../../shared/cards';
import { toBB } from '../../shared/rules';
import { AvatarImage } from '../common/AvatarImage';
import { CardView } from './CardView';

const { ccclass, property, menu } = _decorator;

export interface SeatRenderOptions {
    marker: 'dealer' | 'sb' | 'bb' | null;
    /** 顯示底牌：null 不顯示；陣列中 null 代表牌背 */
    cards: (Card | null)[] | null;
    status: I18nKey | null;
    isMe: boolean;
}

const TIMER_COLORS = [new Color(111, 220, 191), new Color(255, 211, 110), new Color(232, 67, 111)];

/** 牌桌上的一個座位 */
@ccclass('SeatView')
@menu('AnimePoker/SeatView')
export class SeatView extends Component {
    @property(Node)
    occupiedRoot: Node | null = null;

    @property(Node)
    emptyRoot: Node | null = null;

    @property(AvatarImage)
    avatar: AvatarImage | null = null;

    @property(Label)
    nickname: Label | null = null;

    @property(Label)
    stack: Label | null = null;

    @property({ type: Sprite, tooltip: '倒數環（FILLED / RADIAL）' })
    timerRing: Sprite | null = null;

    @property({ type: Animation, tooltip: '輪到此座位時播放 turn_pulse' })
    turnGlow: Animation | null = null;

    @property([CardView])
    cards: CardView[] = [];

    @property(Node)
    betRoot: Node | null = null;

    @property(Label)
    betLabel: Label | null = null;

    @property(Sprite)
    marker: Sprite | null = null;

    @property(SpriteFrame)
    dealerFrame: SpriteFrame | null = null;

    @property(SpriteFrame)
    smallBlindFrame: SpriteFrame | null = null;

    @property(SpriteFrame)
    bigBlindFrame: SpriteFrame | null = null;

    @property(Node)
    bubble: Node | null = null;

    @property(Label)
    bubbleLabel: Label | null = null;

    @property({ type: Animation, tooltip: 'all-in 時播放 allin_pop' })
    allInBadge: Animation | null = null;

    @property(Node)
    winGlow: Node | null = null;

    @property(Label)
    resultLabel: Label | null = null;

    @property(LocalizedLabel)
    status: LocalizedLabel | null = null;

    @property({ type: UIOpacity, tooltip: '棄牌時整個座位變淡' })
    dim: UIOpacity | null = null;

    /** 底牌目前顯示的內容，用來判斷是否需要翻牌動畫 */
    private shownCards: (Card | null)[] | null = null;

    protected onLoad(): void {
        if (this.bubble) this.bubble.active = false;
        if (this.allInBadge) this.allInBadge.node.active = false;
        this.clearHand();
        this.setTimer(null);
    }

    render(seat: SeatSnapshot | undefined, options: SeatRenderOptions): void {
        const occupied = !!seat?.occupied;
        if (this.occupiedRoot) this.occupiedRoot.active = occupied;
        if (this.emptyRoot) this.emptyRoot.active = !occupied;
        if (!occupied || !seat) {
            this.setTimer(null);
            return;
        }

        this.avatar?.setAvatar(seat.avatarId);
        if (this.nickname) this.nickname.string = seat.nickname;
        if (this.stack) this.stack.string = t('common.bb', { value: toBB(seat.stack) });

        if (this.betRoot) this.betRoot.active = seat.bet > 0;
        if (this.betLabel) this.betLabel.string = t('common.bb', { value: toBB(seat.bet) });

        if (this.marker) {
            this.marker.node.active = options.marker !== null;
            this.marker.spriteFrame = options.marker === 'dealer' ? this.dealerFrame : options.marker === 'sb' ? this.smallBlindFrame : this.bigBlindFrame;
        }
        if (this.dim) this.dim.opacity = seat.inHand && seat.folded ? 110 : 255;
        if (this.allInBadge && !seat.allIn) this.allInBadge.node.active = false;

        if (this.status) {
            this.status.node.active = options.status !== null;
            if (options.status) this.status.setKey(options.status);
        }
        this.setCards(options.cards);
    }

    /** 直接顯示底牌（不播動畫）；翻牌動畫請用 reveal */
    setCards(cards: (Card | null)[] | null): void {
        const same = JSON.stringify(cards) === JSON.stringify(this.shownCards);
        if (same) return;
        this.shownCards = cards ? [...cards] : null;
        this.cards.forEach((view, i) => {
            const card = cards?.[i];
            view.node.active = !!cards;
            if (cards) view.show(card ?? null, card !== null && card !== undefined);
        });
    }

    /** 攤牌：把牌背翻成牌面 */
    async reveal(cards: Card[]): Promise<void> {
        this.shownCards = [...cards];
        await Promise.all(
            this.cards.map((view, i) => {
                view.node.active = true;
                if (view.isFaceUp && view.code === cards[i]) return Promise.resolve();
                view.show(null, false);
                return view.flip(cards[i], 0.3, i * 0.08);
            }),
        );
    }

    /** 倒數環：fraction 為剩餘比例（1 → 0），null 隱藏 */
    setTimer(fraction: number | null): void {
        const ring = this.timerRing;
        if (!ring) return;
        const active = fraction !== null;
        if (ring.node.active !== active) {
            ring.node.active = active;
            if (this.turnGlow) {
                this.turnGlow.node.active = active;
                if (active) this.turnGlow.play('turn_pulse');
                else this.turnGlow.stop();
            }
        }
        if (fraction === null) return;
        ring.fillRange = fraction;
        // 綠 → 黃 → 紅
        const f = 1 - fraction;
        const [a, b, k] = f < 0.5 ? [TIMER_COLORS[0], TIMER_COLORS[1], f * 2] : [TIMER_COLORS[1], TIMER_COLORS[2], (f - 0.5) * 2];
        const color = new Color();
        Color.lerp(color, a, b, k);
        ring.color = color;
    }

    /** 行動氣泡（過牌、跟注…），1.4 秒後淡出 */
    showAction(text: string): void {
        const bubble = this.bubble;
        if (!bubble || !this.bubbleLabel) return;
        this.bubbleLabel.string = text;
        bubble.active = true;
        Tween.stopAllByTarget(bubble);
        bubble.setScale(0.4, 0.4, 1);
        tween(bubble)
            .to(0.18, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'backOut' })
            .to(0.08, { scale: Vec3.ONE })
            .delay(1.2)
            .to(0.15, { scale: new Vec3(0.6, 0.6, 1) })
            .call(() => (bubble.active = false))
            .start();
    }

    showAllIn(): void {
        if (!this.allInBadge) return;
        this.allInBadge.node.active = true;
        this.allInBadge.play('allin_pop');
    }

    showWinner(resultText: string | null): void {
        if (this.winGlow) {
            this.winGlow.active = true;
            const opacity = this.winGlow.getComponent(UIOpacity);
            if (opacity) {
                opacity.opacity = 0;
                tween(opacity).to(0.3, { opacity: 255 }).start();
            }
        }
        if (this.resultLabel) {
            this.resultLabel.node.active = !!resultText;
            this.resultLabel.string = resultText ?? '';
        }
    }

    /** 新的一手：清除底牌、贏家效果、all-in 標記 */
    clearHand(): void {
        this.setCards(null);
        for (const card of this.cards) card.setHighlight(false);
        if (this.winGlow) this.winGlow.active = false;
        if (this.resultLabel) this.resultLabel.node.active = false;
        if (this.allInBadge) this.allInBadge.node.active = false;
    }

    highlightCards(codes: readonly Card[]): void {
        for (const card of this.cards) card.setHighlight(!!card.code && card.isFaceUp && codes.includes(card.code));
    }

    /** 發牌動畫的落點（世界座標） */
    cardWorldPosition(index: number): Vec3 {
        return (this.cards[index]?.node ?? this.node).worldPosition.clone();
    }

    /** 底牌相對於參考牌（公共牌）的大小比例，發牌動畫依此縮放 */
    cardScale(reference: CardView | undefined): number {
        const mine = this.cards[0]?.getComponent(UITransform);
        const ref = reference?.getComponent(UITransform);
        return mine && ref ? (mine.width * this.cards[0].node.scale.x) / ref.width : 1;
    }

    get avatarWorldPosition(): Vec3 {
        return (this.avatar?.node ?? this.node).worldPosition.clone();
    }

    get betWorldPosition(): Vec3 {
        return (this.betRoot ?? this.node).worldPosition.clone();
    }
}
