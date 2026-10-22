import { ErrorCode } from '@shared/errors';
import { ActionKind, ActionType, HandCategory, Street, type PlayerAction } from '@shared/poker';
import { BIG_BLIND, SMALL_BLIND } from '@shared/rules';
import { describe, expect, it } from 'vitest';
import { Deck, fisherYates } from '../src/engine/Deck';
import type { HandEvent } from '@shared/events';
import { HandController } from '../src/engine/HandController';
import { createHand, eventsOfType, seededRng, stackOf } from './helpers';

const fold: PlayerAction = { type: ActionType.Fold };
const check: PlayerAction = { type: ActionType.Check };
const call: PlayerAction = { type: ActionType.Call };
const allIn: PlayerAction = { type: ActionType.AllIn };
const raise = (amount: number): PlayerAction => ({ type: ActionType.Raise, amount });

/** 執行動作並要求成功，回傳事件 */
function play(hand: HandController, seat: number, action: PlayerAction): HandEvent[] {
    const result = hand.act(seat, action);
    if (!result.ok) throw new Error(`座位 ${seat} 執行 ${action.type} 失敗：${result.error}`);
    return result.events;
}

const totalStacks = (hand: HandController) => hand.playerStates.reduce((sum, p) => sum + p.stack, 0);

describe('開局', () => {
    it('依序產生開局、盲注、發底牌事件，並輪到大盲的下一位', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        const events = hand.start();

        expect(events.map((e) => e.type)).toEqual(['handStarted', 'blindPosted', 'blindPosted', 'holeCardsDealt', 'actionRequired']);
        expect(events[0]).toMatchObject({ button: 0, smallBlindSeat: 1, bigBlindSeat: 2 });
        expect(eventsOfType(events, 'holeCardsDealt')[0].order).toEqual([1, 2, 0]);
        expect(hand.actorSeat).toBe(0);
        expect(stackOf(hand, 1)).toBe(200 - SMALL_BLIND);
        expect(stackOf(hand, 2)).toBe(200 - BIG_BLIND);

        const holes = [0, 1, 2].flatMap((seat) => hand.holeCards(seat)!);
        expect(new Set(holes).size).toBe(6);
    });

    it('拒絕少於兩人或籌碼為 0 的開局', () => {
        const deck = Deck.shuffled();
        expect(() => new HandController({ seats: [{ seat: 0, stack: 100 }], button: 0, smallBlind: 1, bigBlind: 2, deck })).toThrow();
        expect(
            () => new HandController({ seats: [{ seat: 0, stack: 100 }, { seat: 1, stack: 0 }], button: 0, smallBlind: 1, bigBlind: 2, deck }),
        ).toThrow();
    });
});

describe('行動順序', () => {
    it('三人：全部棄牌給大盲，大盲多付的部分退回', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        hand.start();
        play(hand, 0, fold);
        const events = play(hand, 1, fold);

        expect(eventsOfType(events, 'uncalledReturned')).toEqual([{ type: 'uncalledReturned', seat: 2, amount: 1 }]);
        expect(eventsOfType(events, 'potAwarded')).toEqual([
            { type: 'potAwarded', potIndex: 0, amount: 2, winners: [{ seat: 2, amount: 2 }], category: null },
        ]);
        expect(eventsOfType(events, 'handEnded')[0].showdown).toEqual([]);
        expect(hand.isComplete).toBe(true);
        expect([0, 1, 2].map((s) => stackOf(hand, s))).toEqual([200, 199, 201]);
    });

    it('兩人對決：翻牌前按鈕（小盲）先行動，翻牌後大盲先行動', () => {
        const hand = createHand({ stacks: { 3: 200, 5: 200 }, button: 3 });
        hand.start();
        expect(hand.smallBlindSeat).toBe(3);
        expect(hand.bigBlindSeat).toBe(5);
        expect(hand.actorSeat).toBe(3);

        play(hand, 3, call);
        expect(hand.actorSeat).toBe(5); // 大盲的 option
        const events = play(hand, 5, check);

        expect(eventsOfType(events, 'boardDealt')[0]).toMatchObject({ street: Street.Flop });
        expect(hand.communityCards).toHaveLength(3);
        expect(hand.actorSeat).toBe(5);
    });

    it('大家跟注後，大盲仍可選擇過牌或加注', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        hand.start();
        play(hand, 0, call);
        play(hand, 1, call);
        expect(hand.actorSeat).toBe(2);
        expect(hand.legalActions(2)).toMatchObject({ canCheck: true, canRaise: true, minRaiseTo: 4 });
        expect(hand.legalActions(0)).toBeNull();
    });

    it('翻牌後從按鈕的下一位開始，跳過已棄牌者', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        hand.start();
        play(hand, 0, call);
        play(hand, 1, fold);
        play(hand, 2, check);
        expect(hand.street).toBe(Street.Flop);
        expect(hand.actorSeat).toBe(2);
        play(hand, 2, check);
        expect(hand.actorSeat).toBe(0);
    });
});

describe('加注規則', () => {
    it('最小加注為上一次的加注額', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        hand.start();
        expect(hand.legalActions(0)).toMatchObject({ callAmount: 2, minRaiseTo: 4, maxRaiseTo: 200 });
        expect(hand.act(0, raise(3))).toEqual({ ok: false, error: ErrorCode.InvalidAmount });

        const events = play(hand, 0, raise(6));
        expect(eventsOfType(events, 'playerActed')[0]).toMatchObject({ kind: ActionKind.Raise, paid: 6, committed: 6 });

        // 6 是加注 4，下一次最少要加注到 10
        expect(hand.legalActions(1)).toMatchObject({ callAmount: 5, minRaiseTo: 10 });
        expect(hand.act(1, raise(9))).toEqual({ ok: false, error: ErrorCode.InvalidAmount });
        expect(hand.act(1, raise(10.5))).toEqual({ ok: false, error: ErrorCode.InvalidAmount });
        expect(hand.act(1, raise(201))).toEqual({ ok: false, error: ErrorCode.InvalidAmount });
        play(hand, 1, raise(10));
    });

    it('翻牌後第一個下注記為 bet，最小為一個大盲', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200 }, button: 0 });
        hand.start();
        play(hand, 0, call);
        play(hand, 1, check);
        expect(hand.legalActions(1)).toMatchObject({ canCheck: true, minRaiseTo: BIG_BLIND });
        const events = play(hand, 1, raise(BIG_BLIND));
        expect(eventsOfType(events, 'playerActed')[0].kind).toBe(ActionKind.Bet);
    });

    it('不足額的 all-in 加注不會讓已行動的玩家重新取得加注權', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 14 }, button: 0 });
        hand.start();
        play(hand, 0, raise(10)); // 加注 8
        play(hand, 1, call);
        play(hand, 2, allIn); // 到 14，只多 4，不足完整加注

        expect(hand.legalActions(0)).toMatchObject({ canRaise: false, callAmount: 4 });
        expect(hand.act(0, raise(30))).toEqual({ ok: false, error: ErrorCode.IllegalAction });
        expect(hand.act(0, allIn)).toEqual({ ok: false, error: ErrorCode.IllegalAction });
        play(hand, 0, call);
        expect(hand.legalActions(1)).toMatchObject({ canRaise: false });
        play(hand, 1, call);
        expect(hand.street).toBe(Street.Flop);
    });

    it('多次不足額 all-in 累積達到完整加注額時，重新開放加注', () => {
        const hand = createHand({ stacks: { 0: 16, 1: 22, 2: 200, 3: 200 }, button: 0 });
        hand.start();
        expect(hand.actorSeat).toBe(3);
        play(hand, 3, raise(10)); // 加注 8
        play(hand, 0, allIn); // 到 16（+6，不足額）
        play(hand, 1, allIn); // 到 22（+6，不足額），但自座位 3 行動後累計 +12 ≥ 8
        expect(hand.legalActions(2)).toMatchObject({ canRaise: true, minRaiseTo: 30 });
        play(hand, 2, call);
        expect(hand.legalActions(3)).toMatchObject({ canRaise: true, callAmount: 12 });
    });

    it('其他人都 all-in 時不能再加注', () => {
        const hand = createHand({ stacks: { 0: 50, 1: 100, 2: 200 }, button: 0 });
        hand.start();
        play(hand, 0, allIn);
        play(hand, 1, allIn);
        expect(hand.legalActions(2)).toMatchObject({ canRaise: false, callAmount: 98 });
        expect(hand.act(2, allIn)).toEqual({ ok: false, error: ErrorCode.IllegalAction });
    });
});

describe('攤牌與分池', () => {
    it('all-in 後先公開底牌再發完公共牌，主池與邊池分別結算', () => {
        const hand = createHand({
            stacks: { 0: 50, 1: 100, 2: 200 },
            button: 0,
            holes: { 0: ['As', 'Ad'], 1: ['Ks', 'Kd'], 2: ['Qs', 'Qd'] },
            board: ['2c', '7h', '9d', '3s', '8c'],
        });
        hand.start();
        play(hand, 0, allIn);
        play(hand, 1, allIn);
        const events = play(hand, 2, call);

        const types = events.map((e) => e.type);
        expect(types.indexOf('handsRevealed')).toBeLessThan(types.indexOf('boardDealt'));
        expect(eventsOfType(events, 'boardDealt').map((e) => e.street)).toEqual([Street.Flop, Street.Turn, Street.River]);
        expect(eventsOfType(events, 'handsRevealed')[0].hands.map((h) => h.seat)).toEqual([1, 2, 0]);

        expect(eventsOfType(events, 'potAwarded')).toEqual([
            { type: 'potAwarded', potIndex: 0, amount: 150, winners: [{ seat: 0, amount: 150 }], category: HandCategory.OnePair },
            { type: 'potAwarded', potIndex: 1, amount: 100, winners: [{ seat: 1, amount: 100 }], category: HandCategory.OnePair },
        ]);
        expect([0, 1, 2].map((s) => stackOf(hand, s))).toEqual([150, 100, 100]);
        expect(eventsOfType(events, 'handEnded')[0].showdown).toHaveLength(3);
    });

    it('平手時平分，零頭給按鈕左手邊第一位贏家', () => {
        const hand = createHand({
            stacks: { 0: 200, 1: 200, 2: 200 },
            button: 0,
            holes: { 0: ['2h', '3h'], 1: ['6h', '7h'], 2: ['4h', '5h'] },
            board: ['As', 'Ks', 'Qs', 'Js', 'Ts'],
        });
        hand.start();
        play(hand, 0, call);
        play(hand, 1, fold); // 小盲的 1 留在池中，池為 5
        play(hand, 2, check);
        for (const street of [Street.Flop, Street.Turn, Street.River]) {
            expect(hand.street).toBe(street);
            play(hand, 2, check);
            play(hand, 0, check);
        }

        expect(hand.isComplete).toBe(true);
        expect([0, 1, 2].map((s) => stackOf(hand, s))).toEqual([200, 199, 201]);
    });

    it('河牌下注無人跟注時退回，不需攤牌', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200 }, button: 0 });
        hand.start();
        play(hand, 0, call);
        play(hand, 1, check);
        play(hand, 1, raise(20));
        const events = play(hand, 0, fold);

        expect(eventsOfType(events, 'uncalledReturned')[0]).toMatchObject({ seat: 1, amount: 20 });
        expect(eventsOfType(events, 'handsRevealed')).toEqual([]);
        expect(eventsOfType(events, 'potAwarded')[0]).toMatchObject({ amount: 4, winners: [{ seat: 1, amount: 4 }] });
        expect([stackOf(hand, 0), stackOf(hand, 1)]).toEqual([198, 202]);
    });

    it('大盲籌碼不足時 all-in，多跟的部分退回後直接發完', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 1 }, button: 0 });
        const start = hand.start();
        expect(eventsOfType(start, 'blindPosted')[1]).toMatchObject({ seat: 1, amount: 1, allIn: true });
        expect(hand.legalActions(0)).toMatchObject({ callAmount: 1, canRaise: false });
        const events = play(hand, 0, call);

        expect(eventsOfType(events, 'uncalledReturned')[0]).toMatchObject({ seat: 0, amount: 1 });
        expect(eventsOfType(events, 'boardDealt')).toHaveLength(3);
        expect(hand.isComplete).toBe(true);
        expect(stackOf(hand, 0) + stackOf(hand, 1)).toBe(201);
    });
});

describe('強制棄牌與逾時', () => {
    it('非輪到者離桌時立即棄牌，不影響目前輪到的人', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        hand.start();
        const events = hand.forceFold(1);
        expect(eventsOfType(events, 'playerActed')[0]).toMatchObject({ seat: 1, kind: ActionKind.Fold });
        expect(hand.actorSeat).toBe(0);

        play(hand, 0, fold);
        expect(hand.isComplete).toBe(true);
        expect([stackOf(hand, 1), stackOf(hand, 2)]).toEqual([199, 201]);
    });

    it('只剩一人時這手牌立即結束', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200 }, button: 0 });
        hand.start();
        const events = hand.forceFold(1);
        expect(hand.isComplete).toBe(true);
        expect(eventsOfType(events, 'potAwarded')[0].winners).toEqual([{ seat: 0, amount: 2 }]);
        expect(hand.forceFold(0)).toEqual([]);
    });

    it('逾時：能過牌就過牌，否則棄牌', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        hand.start();
        expect(hand.timeoutAction()).toEqual(fold);
        play(hand, 0, call);
        play(hand, 1, call);
        expect(hand.timeoutAction()).toEqual(check);
    });
});

describe('錯誤處理', () => {
    it('回傳對應的錯誤碼', () => {
        const hand = createHand({ stacks: { 0: 200, 1: 200, 2: 200 }, button: 0 });
        expect(hand.act(0, call)).toEqual({ ok: false, error: ErrorCode.HandOver }); // 尚未開始
        hand.start();
        expect(hand.act(1, call)).toEqual({ ok: false, error: ErrorCode.NotYourTurn });
        expect(hand.act(0, check)).toEqual({ ok: false, error: ErrorCode.IllegalAction });
        expect(hand.act(4, call)).toEqual({ ok: false, error: ErrorCode.NotInHand });
        play(hand, 0, fold);
        expect(hand.act(0, call)).toEqual({ ok: false, error: ErrorCode.NotInHand });
        play(hand, 1, fold);
        expect(hand.act(2, check)).toEqual({ ok: false, error: ErrorCode.HandOver });
    });
});

describe('隨機牌局模擬', () => {
    it('任意合法動作下，籌碼守恆、牌局一定會結束', () => {
        const rng = seededRng(20261022);

        for (let i = 0; i < 3000; i++) {
            // 隨機 2～6 位玩家坐在隨機座位，籌碼 1～300
            const unique = fisherYates([0, 1, 2, 3, 4, 5], rng).slice(0, 2 + rng(5));
            const seats = unique.map((seat) => ({ seat, stack: 1 + rng(300) }));
            const hand = new HandController({
                seats,
                button: unique[rng(unique.length)],
                smallBlind: SMALL_BLIND,
                bigBlind: BIG_BLIND,
                deck: Deck.shuffled(seededRng(i)),
            });
            const before = seats.reduce((sum, s) => sum + s.stack, 0);
            const events = hand.start();

            let steps = 0;
            while (!hand.isComplete) {
                if (++steps > 200) throw new Error('牌局未在合理步數內結束');
                const seat = hand.actorSeat!;
                expect(events.at(-1)).toMatchObject({ type: 'actionRequired', seat });

                if (rng(40) === 0) {
                    // 偶爾有非輪到者離桌
                    const others = unique.filter((s) => s !== seat);
                    events.push(...hand.forceFold(others[rng(others.length)]));
                    continue;
                }

                const legal = hand.legalActions(seat)!;
                const options: PlayerAction[] = [fold];
                if (legal.canCheck) options.push(check, check);
                if (legal.callAmount > 0) options.push(call, call);
                if (legal.canRaise) {
                    options.push(raise(legal.minRaiseTo + rng(legal.maxRaiseTo - legal.minRaiseTo + 1)), allIn);
                }
                events.push(...play(hand, seat, options[rng(options.length)]));
            }

            expect(totalStacks(hand)).toBe(before);
            expect(hand.playerStates.every((p) => p.stack >= 0)).toBe(true);
            expect(hand.actorSeat).toBeNull();
            expect(events.at(-1)?.type).toBe('handEnded');

            // 底池全數發出：贏得的總額 = 所有人投入
            const awarded = eventsOfType(events, 'potAwarded').reduce((sum, e) => sum + e.amount, 0);
            const contributed = hand.playerStates.reduce((sum, p) => sum + p.totalCommitted, 0);
            expect(awarded).toBe(contributed);
        }
    });
});
