import { resources, SpriteFrame } from 'cc';
import type { Card } from '../../shared/cards';

/**
 * 牌面圖片的預載與同步取用。牌桌場景載入時一次載入 53 張（建置時由 Auto Atlas 合併成一張圖集），
 * 之後發牌、翻牌都能同步取得，不會在動畫途中等待載入。
 */
class CardFramesService {
    private readonly frames = new Map<string, SpriteFrame>();
    private loading: Promise<void> | null = null;

    preload(): Promise<void> {
        this.loading ??= new Promise((resolve) => {
            resources.loadDir('textures/cards', SpriteFrame, (err, assets) => {
                if (err) console.warn('[CardFrames] 載入失敗', err);
                for (const frame of assets ?? []) {
                    // 圖片名稱為 card_As、card_back（SpriteFrame 名稱與圖片相同）
                    this.frames.set(frame.name.replace(/^card_/, ''), frame);
                }
                resolve();
            });
        });
        return this.loading;
    }

    face(card: Card): SpriteFrame | null {
        return this.frames.get(card) ?? null;
    }

    get back(): SpriteFrame | null {
        return this.frames.get('back') ?? null;
    }
}

export const cardFrames = new CardFramesService();
