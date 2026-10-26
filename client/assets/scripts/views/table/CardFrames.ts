import { SpriteFrame } from 'cc';
import { loadBundle } from '../../core/Bundles';
import { type Card, rankOf, suitOf } from '../../shared/cards';

/** 牌面各層的圖片（CardFace.prefab 的子節點依序疊上）；deco 為 null 代表該點數沒有裝飾 */
export interface CardFaceFrames {
    rank: SpriteFrame | null;
    smallSuit: SpriteFrame | null;
    bigSuit: SpriteFrame | null;
    deco: SpriteFrame | null;
}

/** 花色只有兩種顏色，點數與人頭牌徽章依顏色各有一份 */
const SUIT_COLOR = { s: 'black', c: 'black', h: 'red', d: 'red' } as const;

/**
 * 牌面元件的預載與同步取用。牌面由底紙、點數、花色與裝飾組合而成（圖片由 tools/gen-art/cards.mjs 產生），
 * 牌桌場景載入時一次載入（建置時由 Auto Atlas 合併成一張圖集），之後發牌、翻牌都能同步取得，不會在動畫途中等待載入。
 */
class CardFramesService {
    private readonly frames = new Map<string, SpriteFrame>();
    private loading: Promise<void> | null = null;

    preload(): Promise<void> {
        this.loading ??= loadBundle('table').then(
            (table) =>
                new Promise((resolve) => {
                    table.loadDir('textures/cards', SpriteFrame, (err, assets) => {
                        if (err) console.warn('[CardFrames] 載入失敗', err);
                        // SpriteFrame 名稱與圖片相同，例如 card_back、rank_red_A、suit_s
                        for (const frame of assets ?? []) this.frames.set(frame.name, frame);
                        resolve();
                    });
                }),
        );
        return this.loading;
    }

    face(card: Card): CardFaceFrames {
        const rank = rankOf(card);
        const suit = suitOf(card);
        const color = SUIT_COLOR[suit];
        let deco: string | null = null;
        if (rank === 'J' || rank === 'Q' || rank === 'K') deco = `emblem_${color}_${rank}`;
        else if (rank === 'A') deco = 'sparkle';
        return {
            rank: this.get(`rank_${color}_${rank}`),
            smallSuit: this.get(`suit_small_${suit}`),
            bigSuit: this.get(`suit_${suit}`),
            deco: deco ? this.get(deco) : null,
        };
    }

    /** 牌面底紙 */
    get paper(): SpriteFrame | null {
        return this.get('card_face');
    }

    get back(): SpriteFrame | null {
        return this.get('card_back');
    }

    private get(name: string): SpriteFrame | null {
        return this.frames.get(name) ?? null;
    }
}

export const cardFrames = new CardFramesService();
