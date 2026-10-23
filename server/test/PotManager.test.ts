import { describe, expect, it } from 'vitest';
import { buildPots, findUncalled, splitPot } from '@shared/engine/PotManager';

const c = (seat: number, amount: number, folded = false) => ({ seat, amount, folded });

describe('buildPots', () => {
    it('投入相同時只有一個主池', () => {
        expect(buildPots([c(0, 100), c(1, 100), c(2, 100)])).toEqual([{ amount: 300, eligible: [0, 1, 2] }]);
    });

    it('all-in 金額不同時產生邊池', () => {
        expect(buildPots([c(0, 50), c(1, 100), c(2, 100)])).toEqual([
            { amount: 150, eligible: [0, 1, 2] },
            { amount: 100, eligible: [1, 2] },
        ]);
    });

    it('多層 all-in', () => {
        expect(buildPots([c(0, 20), c(1, 50), c(2, 120), c(3, 120)])).toEqual([
            { amount: 80, eligible: [0, 1, 2, 3] },
            { amount: 90, eligible: [1, 2, 3] },
            { amount: 140, eligible: [2, 3] },
        ]);
    });

    it('棄牌者的籌碼留在池中，但沒有資格贏', () => {
        expect(buildPots([c(0, 30, true), c(1, 100), c(2, 100)])).toEqual([{ amount: 230, eligible: [1, 2] }]);
    });

    it('棄牌者的投入跨越多層時，依層計入各池', () => {
        expect(buildPots([c(0, 60, true), c(1, 40), c(2, 100)])).toEqual([
            { amount: 120, eligible: [1, 2] },
            { amount: 80, eligible: [2] },
        ]);
    });
});

describe('findUncalled', () => {
    it('最高投入超出第二高的部分要退回', () => {
        expect(findUncalled([c(0, 150), c(1, 40), c(2, 40, true)])).toEqual({ seat: 0, amount: 110 });
    });

    it('有人跟注時不退回', () => {
        expect(findUncalled([c(0, 100), c(1, 100)])).toBeNull();
    });
});

describe('splitPot', () => {
    it('平分', () => {
        expect([...splitPot(100, [3, 1])]).toEqual([[3, 50], [1, 50]]);
    });

    it('零頭依順序給前面的贏家', () => {
        expect([...splitPot(11, [2, 0, 1])]).toEqual([[2, 4], [0, 4], [1, 3]]);
    });
});
