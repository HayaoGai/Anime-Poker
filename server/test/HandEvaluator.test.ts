import { HandCategory } from '@shared/poker';
import { describe, expect, it } from 'vitest';
import { FULL_DECK, type Card } from '@shared/cards';
import { fisherYates } from '@shared/engine/Deck';
import { evaluateBest, evaluateFive, scoreHand } from '@shared/engine/HandEvaluator';
import { seededRng } from './helpers';

const hand = (text: string) => text.split(' ') as Card[];
const categoryOf = (text: string) => evaluateBest(hand(text)).category;
const score = (text: string) => evaluateBest(hand(text)).score;

describe('牌型判定', () => {
    it.each([
        ['Ah Kh Qh Jh Th', HandCategory.StraightFlush],
        ['5d 4d 3d 2d Ad', HandCategory.StraightFlush],
        ['9s 9h 9d 9c 2s', HandCategory.FourOfAKind],
        ['Ks Kh Kd 2c 2s', HandCategory.FullHouse],
        ['As 9s 7s 4s 2s', HandCategory.Flush],
        ['Ts 9h 8d 7c 6s', HandCategory.Straight],
        ['5s 4h 3d 2c As', HandCategory.Straight],
        ['7s 7h 7d Kc 2s', HandCategory.ThreeOfAKind],
        ['Js Jh 4d 4c As', HandCategory.TwoPair],
        ['Qs Qh 9d 5c 2s', HandCategory.OnePair],
        ['As Jh 9d 5c 3s', HandCategory.HighCard],
    ])('%s', (cards, expected) => {
        expect(categoryOf(cards)).toBe(expected);
    });

    it('Q-K-A-2-3 不是順子', () => {
        expect(categoryOf('Qs Kh Ad 2c 3s')).toBe(HandCategory.HighCard);
    });
});

describe('比較大小', () => {
    it('牌型高者勝', () => {
        // 最小的同花仍大於最大的順子；最小的葫蘆仍大於最大的同花
        expect(score('2s 3s 4s 5s 7s')).toBeGreaterThan(score('As Kh Qd Jc Ts'));
        expect(score('2s 2h 2d 3c 3s')).toBeGreaterThan(score('As Ks Qs Js 9s'));
    });

    it('A-2-3-4-5 是最小的順子', () => {
        expect(score('6s 5h 4d 3c 2s')).toBeGreaterThan(score('5s 4h 3d 2c As'));
        expect(score('6d 5d 4d 3d 2d')).toBeGreaterThan(score('5d 4d 3d 2d Ad'));
    });

    it('同為一對時比 kicker', () => {
        expect(score('As Ah Kd 7c 2s')).toBeGreaterThan(score('Ad Ac Qd 7h 2h'));
        expect(score('As Ah Kd 7c 3s')).toBeGreaterThan(score('Ad Ac Kh 7h 2h'));
    });

    it('兩對先比大對、再比小對、最後比 kicker', () => {
        expect(score('Ks Kh 3d 3c 2s')).toBeGreaterThan(score('Qs Qh Jd Jc As'));
        expect(score('Ks Kh 4d 4c 2s')).toBeGreaterThan(score('Kd Kc 3d 3h As'));
        expect(score('Ks Kh 4d 4c 9s')).toBeGreaterThan(score('Kd Kc 4s 4h 8s'));
    });

    it('同花依序比較五張', () => {
        expect(score('As Js 9s 5s 3s')).toBeGreaterThan(score('Ah Jh 9h 5h 2h'));
    });

    it('葫蘆先比三條', () => {
        expect(score('3s 3h 3d 2c 2s')).toBeGreaterThan(score('2d 2h 2s Ac As'));
    });

    it('花色不影響大小', () => {
        expect(score('As Kh Qd Jc 9s')).toBe(score('Ah Kd Qc Js 9h'));
    });
});

describe('7 選 5', () => {
    it('找出最佳組合', () => {
        const value = evaluateBest(hand('Ah Kh 2c 7d Qh Jh Th'));
        expect(value.category).toBe(HandCategory.StraightFlush);
        expect(new Set(value.bestFive)).toEqual(new Set(hand('Ah Kh Qh Jh Th')));
    });

    it('兩組三條取大的三條與大的對子組葫蘆', () => {
        const value = evaluateBest(hand('9s 9h 9d 4c 4s 4h Ad'));
        expect(value.category).toBe(HandCategory.FullHouse);
        expect(value.score).toBe(evaluateFive(hand('9s 9h 9d 4c 4s')).score);
    });

    it('公共牌就是最大時雙方平手', () => {
        const board = 'As Ks Qs Js Ts';
        expect(score(`${board} 2h 3h`)).toBe(score(`${board} 9s 8s`));
    });

    it('bestFive 依重要性排序（葫蘆先放三條）', () => {
        const { bestFive } = evaluateBest(hand('2c 2s Kd Kh Ks'));
        expect(bestFive.slice(0, 3).every((c) => c[0] === 'K')).toBe(true);
    });

    it('拒絕張數不合法的輸入', () => {
        expect(() => evaluateBest(hand('As Ks Qs Js'))).toThrow();
    });
});

describe('scoreHand（快速計分）', () => {
    it('與 evaluateBest 的分數在隨機牌組上完全一致', () => {
        const rng = seededRng(42);
        for (let i = 0; i < 20_000; i++) {
            const cards = fisherYates([...FULL_DECK], rng).slice(0, 5 + rng(3));
            expect(scoreHand(cards)).toBe(evaluateBest(cards).score);
        }
    });

    it('涵蓋各種牌型的邊界', () => {
        for (const text of [
            'Ah Kh Qh Jh Th 9h 8h',
            '5d 4d 3d 2d Ad Kc Qs',
            'As 2s 3s 4s 5h 6h 9c',
            '9s 9h 9d 9c Ks Kh Kd',
            'Ks Kh Kd Qc Qs Qh 2d',
            'Ks Kh Kd Qc Qs 2h 2d',
            'Js Jh 4d 4c 3s 3h Ad',
            'Js Jh 4d 4c 3s 3h 2d',
            'As Js 9s 5s 3s 2s Kd',
        ]) {
            expect(scoreHand(hand(text))).toBe(evaluateBest(hand(text)).score);
        }
    });
});
