// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/engine/Deck.ts，執行 pnpm sync:shared 更新。
import { FULL_DECK, type Card } from '../cards';
import type { Rng } from './rng';

export class Deck {
    private readonly cards: Card[];
    private position = 0;

    private constructor(cards: Card[]) {
        this.cards = cards;
    }

    /** 建立一副以 Fisher–Yates 洗好的新牌 */
    static shuffled(rng: Rng): Deck {
        return new Deck(fisherYates([...FULL_DECK], rng));
    }

    /** 依指定順序建立牌堆（測試用，第一張最先發出） */
    static fromOrder(cards: readonly Card[]): Deck {
        return new Deck([...cards]);
    }

    get remaining(): number {
        return this.cards.length - this.position;
    }

    draw(): Card {
        if (this.position >= this.cards.length) throw new Error('牌堆已發完');
        return this.cards[this.position++];
    }

    drawMany(count: number): Card[] {
        return Array.from({ length: count }, () => this.draw());
    }

    /** 發公共牌前先燒一張 */
    burn(): void {
        this.draw();
    }
}

/**
 * Fisher–Yates 洗牌（原地）：由後往前，每個位置與 [0, i] 之間的隨機位置交換。
 * 每一種排列出現的機率完全相同，前提是 rng 本身均勻。
 */
export function fisherYates<T>(items: T[], rng: Rng): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = rng(i + 1);
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
