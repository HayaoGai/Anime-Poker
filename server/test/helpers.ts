import { FULL_DECK, type Card } from '@shared/cards';
import { BIG_BLIND, SMALL_BLIND } from '@shared/rules';
import { Deck } from '../src/engine/Deck';
import type { HandEvent } from '@shared/events';
import { HandController, type HandSeat } from '../src/engine/HandController';
import { seatsAfter } from '../src/engine/positions';
import type { Rng } from '../src/engine/rng';

/**
 * 依指定的底牌與公共牌排出牌堆，其餘位置以未使用的牌補齊。
 * 發牌順序與 HandController 相同：按鈕下一位開始一次一張繞兩圈，之後「燒 1 翻 3、燒 1 翻 1、燒 1 翻 1」。
 */
export function riggedDeck(options: {
    button: number;
    seats: readonly number[];
    holes?: Record<number, [Card, Card]>;
    board?: Card[];
}): Deck {
    const used = new Set<Card>([...Object.values(options.holes ?? {}).flat(), ...(options.board ?? [])]);
    const filler = FULL_DECK.filter((c) => !used.has(c));
    const take = (card?: Card) => card ?? filler.shift()!;

    const order = seatsAfter(options.button, [...options.seats].sort((a, b) => a - b));
    const cards: Card[] = [];
    for (let round = 0; round < 2; round++) {
        for (const seat of order) cards.push(take(options.holes?.[seat]?.[round]));
    }
    const board = options.board ?? [];
    cards.push(take(), take(board[0]), take(board[1]), take(board[2])); // 燒牌 + 翻牌
    cards.push(take(), take(board[3])); // 燒牌 + 轉牌
    cards.push(take(), take(board[4])); // 燒牌 + 河牌
    cards.push(...filler);
    return Deck.fromOrder(cards);
}

export function createHand(options: {
    stacks: Record<number, number>;
    button: number;
    holes?: Record<number, [Card, Card]>;
    board?: Card[];
}): HandController {
    const seats: HandSeat[] = Object.entries(options.stacks).map(([seat, stack]) => ({ seat: Number(seat), stack }));
    return new HandController({
        seats,
        button: options.button,
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        deck: riggedDeck({ button: options.button, seats: seats.map((s) => s.seat), holes: options.holes, board: options.board }),
    });
}

export function stackOf(hand: HandController, seat: number): number {
    return hand.playerStates.find((p) => p.seat === seat)!.stack;
}

export function eventsOfType<T extends HandEvent['type']>(events: HandEvent[], type: T): Extract<HandEvent, { type: T }>[] {
    return events.filter((e): e is Extract<HandEvent, { type: T }> => e.type === type);
}

/** 可重現的線性同餘亂數，只用於測試 */
export function seededRng(seed: number): Rng {
    let state = seed >>> 0;
    return (maxExclusive) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % maxExclusive;
    };
}
