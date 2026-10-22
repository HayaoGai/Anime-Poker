import { rankOf, rankValue, suitOf, type Card } from '@shared/cards';
import { HandCategory } from '@shared/poker';

export interface HandValue {
    category: HandCategory;
    /** 可直接比大小的分數，越大越強；相同代表平手 */
    score: number;
    /** 組成最佳牌型的 5 張牌，依重要性排序（例如葫蘆先放三條） */
    bestFive: Card[];
}

/** 從 5～7 張牌中找出最佳的 5 張 */
export function evaluateBest(cards: readonly Card[]): HandValue {
    if (cards.length < 5 || cards.length > 7) throw new Error(`需要 5～7 張牌，收到 ${cards.length} 張`);

    let best: HandValue | null = null;
    for (const combo of combinations(cards.length)) {
        const value = evaluateFive(combo.map((i) => cards[i]));
        if (!best || value.score > best.score) best = value;
    }
    return best!;
}

/** 評估剛好 5 張牌 */
export function evaluateFive(cards: readonly Card[]): HandValue {
    // 依「同點數張數多 → 點數大」排序，排序結果同時就是比較 kicker 的順序
    const counts = new Map<number, number>();
    for (const card of cards) {
        const value = rankValue(rankOf(card));
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const shape = groups.map(([, count]) => count).join('');

    const isFlush = cards.every((card) => suitOf(card) === suitOf(cards[0]));
    const straightHigh = groups.length === 5 ? straightHighCard(groups.map(([value]) => value)) : 0;

    let category: HandCategory;
    let kickers: number[];

    if (straightHigh && isFlush) {
        category = HandCategory.StraightFlush;
        kickers = [straightHigh];
    } else if (shape === '41') {
        category = HandCategory.FourOfAKind;
        kickers = groups.map(([value]) => value);
    } else if (shape === '32') {
        category = HandCategory.FullHouse;
        kickers = groups.map(([value]) => value);
    } else if (isFlush) {
        category = HandCategory.Flush;
        kickers = groups.map(([value]) => value);
    } else if (straightHigh) {
        category = HandCategory.Straight;
        kickers = [straightHigh];
    } else if (shape === '311') {
        category = HandCategory.ThreeOfAKind;
        kickers = groups.map(([value]) => value);
    } else if (shape === '221') {
        category = HandCategory.TwoPair;
        kickers = groups.map(([value]) => value);
    } else if (shape === '2111') {
        category = HandCategory.OnePair;
        kickers = groups.map(([value]) => value);
    } else {
        category = HandCategory.HighCard;
        kickers = groups.map(([value]) => value);
    }

    // 分數 = 牌型 + 最多 5 個 kicker，每個佔 4 bits（點數最大 14）
    let score = category;
    for (let i = 0; i < 5; i++) score = score * 16 + (kickers[i] ?? 0);

    return { category, score, bestFive: orderByImportance(cards, groups, straightHigh) };
}

/** 傳入 5 個由大到小、互不相同的點數；是順子則回傳最大牌，否則回傳 0。A-2-3-4-5（wheel）的最大牌為 5 */
function straightHighCard(valuesDesc: number[]): number {
    if (valuesDesc[0] - valuesDesc[4] === 4) return valuesDesc[0];
    if (valuesDesc.join(',') === '14,5,4,3,2') return 5;
    return 0;
}

function orderByImportance(cards: readonly Card[], groups: [number, number][], straightHigh: number): Card[] {
    const order = groups.map(([value]) => value);
    // wheel 的 A 當 1 用，排在最後
    if (straightHigh === 5) order.push(order.shift()!);
    return [...cards].sort((a, b) => order.indexOf(rankValue(rankOf(a))) - order.indexOf(rankValue(rankOf(b))));
}

const comboCache = new Map<number, number[][]>();

/** n 張中取 5 張的所有索引組合（n = 5～7，結果快取） */
function combinations(n: number): number[][] {
    let cached = comboCache.get(n);
    if (!cached) {
        cached = [];
        const pick = (start: number, chosen: number[]) => {
            if (chosen.length === 5) {
                cached!.push([...chosen]);
                return;
            }
            for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
        };
        pick(0, []);
        comboCache.set(n, cached);
    }
    return cached;
}
