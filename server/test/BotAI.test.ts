import type { Card } from '@shared/cards';
import type { LegalActions } from '@shared/events';
import { ActionType } from '@shared/poker';
import { BIG_BLIND } from '@shared/rules';
import { describe, expect, it } from 'vitest';
import { decideBotAction, estimateEquity } from '@shared/engine/BotAI';
import { seededRng } from './helpers';

const cards = (text: string) => (text ? (text.split(' ') as Card[]) : []);

const facing = (callAmount: number, overrides: Partial<LegalActions> = {}): LegalActions => ({
    canFold: true,
    canCheck: callAmount === 0,
    callAmount,
    canRaise: true,
    minRaiseTo: 4,
    maxRaiseTo: 200,
    ...overrides,
});

describe('estimateEquity', () => {
    it('AA 對一位隨機對手約 85%', () => {
        expect(estimateEquity(cards('As Ad'), [], 1, 4000, seededRng(1))).toBeCloseTo(0.85, 1);
    });

    it('已成同花順時接近 100%，對手越多勝率越低', () => {
        expect(estimateEquity(cards('Ah Kh'), cards('Qh Jh Th'), 1, 500, seededRng(2))).toBe(1);
        const vsOne = estimateEquity(cards('Jc Jd'), [], 1, 2000, seededRng(3));
        const vsFive = estimateEquity(cards('Jc Jd'), [], 5, 2000, seededRng(3));
        expect(vsFive).toBeLessThan(vsOne);
    });
});

describe('decideBotAction', () => {
    it('強牌會加注，加注額合法', () => {
        const rng = seededRng(10);
        for (let i = 0; i < 20; i++) {
            const action = decideBotAction(
                { hole: cards('As Ah'), board: cards('Ad 7c 2h'), legal: facing(0, { minRaiseTo: BIG_BLIND }), pot: 12, currentBet: 0, opponents: 1, bigBlind: BIG_BLIND },
                rng,
            );
            expect([ActionType.Raise, ActionType.AllIn]).toContain(action.type);
            if (action.type === ActionType.Raise) {
                expect(action.amount).toBeGreaterThanOrEqual(BIG_BLIND);
                expect(action.amount).toBeLessThanOrEqual(200);
                expect(Number.isInteger(action.amount)).toBe(true);
            }
        }
    });

    it('弱牌面對大額下注會棄牌', () => {
        const rng = seededRng(11);
        let folds = 0;
        for (let i = 0; i < 20; i++) {
            const action = decideBotAction(
                { hole: cards('7c 2d'), board: cards('Ks Qs 9h'), legal: facing(150), pot: 170, currentBet: 150, opponents: 1, bigBlind: BIG_BLIND },
                rng,
            );
            if (action.type === ActionType.Fold) folds++;
        }
        expect(folds).toBe(20);
    });

    it('不能加注時不會送出加注', () => {
        const rng = seededRng(12);
        for (let i = 0; i < 20; i++) {
            const action = decideBotAction(
                { hole: cards('As Ah'), board: [], legal: facing(98, { canRaise: false }), pot: 150, currentBet: 100, opponents: 2, bigBlind: BIG_BLIND },
                rng,
            );
            expect([ActionType.Call, ActionType.Fold]).toContain(action.type);
        }
    });

    it('可以免費看牌時不會棄牌', () => {
        const rng = seededRng(13);
        for (let i = 0; i < 20; i++) {
            const action = decideBotAction(
                { hole: cards('7c 2d'), board: cards('Ks Qs 9h'), legal: facing(0, { minRaiseTo: BIG_BLIND }), pot: 10, currentBet: 0, opponents: 2, bigBlind: BIG_BLIND },
                rng,
            );
            expect(action.type).not.toBe(ActionType.Fold);
        }
    });
});
