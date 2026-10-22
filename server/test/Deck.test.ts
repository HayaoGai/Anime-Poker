import { FULL_DECK } from '@shared/cards';
import { describe, expect, it, vi } from 'vitest';
import { Deck, fisherYates } from '../src/engine/Deck';
import { cryptoRng } from '../src/engine/rng';

describe('Deck', () => {
    it('洗好的牌有 52 張且不重複', () => {
        const deck = Deck.shuffled();
        const cards = deck.drawMany(52);
        expect(new Set(cards).size).toBe(52);
        expect(new Set(cards)).toEqual(new Set(FULL_DECK));
        expect(deck.remaining).toBe(0);
        expect(() => deck.draw()).toThrow();
    });

    it('fromOrder 依指定順序發牌，burn 會跳過一張', () => {
        const deck = Deck.fromOrder(['As', 'Kd', 'Qh']);
        expect(deck.draw()).toBe('As');
        deck.burn();
        expect(deck.draw()).toBe('Qh');
    });
});

describe('fisherYates', () => {
    it('每一步以 [0, i] 的範圍呼叫 rng，由後往前交換', () => {
        const rng = vi.fn(() => 0);
        expect(fisherYates([1, 2, 3, 4], rng)).toEqual([2, 3, 4, 1]);
        expect(rng.mock.calls).toEqual([[4], [3], [2]]);
    });

    it('使用 crypto 時，各種排列出現的機率均勻', () => {
        const trials = 60_000;
        const counts = new Map<string, number>();
        for (let i = 0; i < trials; i++) {
            const key = fisherYates(['a', 'b', 'c'], cryptoRng).join('');
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        expect(counts.size).toBe(6);
        // 期望值 10000，容許 ±5%（約 10 個標準差，誤報機率可忽略）
        for (const count of counts.values()) expect(Math.abs(count - trials / 6)).toBeLessThan(500);
    });
});
