/**
 * 撲克牌表示法：兩個字元的字串，點數 + 花色，例如 'As'（黑桃 A）、'Td'（方塊 10）。
 * 前後端與網路協定一律使用此格式，客戶端也以此對應牌面圖片。
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['s', 'h', 'd', 'c'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = `${Rank}${Suit}`;

/** 依點數、花色順序排列的完整 52 張牌 */
export const FULL_DECK: readonly Card[] = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}` as Card));

export function rankOf(card: Card): Rank {
    return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
    return card[1] as Suit;
}

/** 點數的數值：2 = 2 … A = 14 */
export function rankValue(rank: Rank): number {
    return RANKS.indexOf(rank) + 2;
}

export function isCard(value: unknown): value is Card {
    return typeof value === 'string' && FULL_DECK.includes(value as Card);
}
