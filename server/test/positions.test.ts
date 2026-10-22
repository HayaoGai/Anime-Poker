import { describe, expect, it } from 'vitest';
import { blindSeats, nextButton, seatsAfter } from '../src/engine/positions';

describe('seatsAfter', () => {
    it('從下一位開始順時針繞一圈，起點排最後', () => {
        expect(seatsAfter(2, [0, 2, 4])).toEqual([4, 0, 2]);
        expect(seatsAfter(4, [0, 2, 4])).toEqual([0, 2, 4]);
    });

    it('起點不在座位中時從下一個有人的座位開始', () => {
        expect(seatsAfter(3, [0, 2, 4])).toEqual([4, 0, 2]);
        expect(seatsAfter(5, [0, 2, 4])).toEqual([0, 2, 4]);
    });
});

describe('nextButton', () => {
    it('第一手由 rng 決定', () => {
        expect(nextButton([1, 3, 5], null, () => 2)).toBe(5);
    });

    it('之後移到下一位，跳過空位與已離桌的座位', () => {
        expect(nextButton([0, 1, 4], 1, () => 0)).toBe(4);
        expect(nextButton([0, 1, 4], 4, () => 0)).toBe(0);
        expect(nextButton([0, 4], 2, () => 0)).toBe(4);
    });
});

describe('blindSeats', () => {
    it('三人以上：按鈕的下一位小盲、下兩位大盲', () => {
        expect(blindSeats(4, [0, 2, 4, 5])).toEqual({ smallBlind: 5, bigBlind: 0 });
    });

    it('兩人對決：按鈕兼小盲', () => {
        expect(blindSeats(3, [1, 3])).toEqual({ smallBlind: 3, bigBlind: 1 });
    });
});
