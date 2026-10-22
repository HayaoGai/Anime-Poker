import type { ActionRecord, LegalActions } from '@shared/events';
import { ErrorCode } from '@shared/errors';
import { ActionKind, ActionType, type PlayerAction } from '@shared/poker';

/** 一位玩家在這手牌中的籌碼狀態，由 HandController 擁有、BettingRound 直接修改 */
export interface HandPlayer {
    seat: number;
    /** 尚未投入的籌碼 */
    stack: number;
    /** 本輪（這條街）已投入 */
    committed: number;
    /** 整手牌累計投入 */
    totalCommitted: number;
    folded: boolean;
    allIn: boolean;
}

export type ActionResult = { ok: true; record: ActionRecord } | { ok: false; error: ErrorCode };

/**
 * 一條街的下注回合。
 *
 * 加注的重新開放規則：每位玩家記錄行動當下的注額 actedAt。
 * 只有尚未行動，或注額自他行動後已累計提高至少一個完整加注額（lastRaiseSize）時，才能再加注。
 * 因此不足額的 all-in 加注不會讓已行動的玩家重新取得加注權，但多次不足額累積達完整加注時會。
 */
export class BettingRound {
    private readonly players: HandPlayer[];
    private readonly bigBlind: number;
    private readonly actedAt = new Map<number, number>();
    private currentBet: number;
    private lastRaiseSize: number;
    private cursor = 0;

    /**
     * @param playersInOrder 本輪的行動順序（第一位最先行動），可包含已棄牌或 all-in 的玩家，會自動略過
     * @param currentBet 本輪開始時的注額（翻牌前為大盲，之後為 0）
     */
    constructor(playersInOrder: HandPlayer[], options: { currentBet: number; bigBlind: number }) {
        this.players = playersInOrder;
        this.bigBlind = options.bigBlind;
        this.currentBet = options.currentBet;
        this.lastRaiseSize = options.bigBlind;
        this.seekActor();
    }

    get bet(): number {
        return this.currentBet;
    }

    /** 目前輪到的玩家；本輪已結束時為 null */
    get actor(): HandPlayer | null {
        return this.isComplete ? null : this.players[this.cursor];
    }

    get isComplete(): boolean {
        return !this.players.some((p) => this.needsToAct(p));
    }

    legalActions(player: HandPlayer): LegalActions {
        const toCall = Math.max(0, this.currentBet - player.committed);
        const maxRaiseTo = player.committed + player.stack;
        const fullMinRaiseTo = this.currentBet === 0 ? this.bigBlind : this.currentBet + this.lastRaiseSize;

        const reopened = !this.actedAt.has(player.seat) || this.currentBet - this.actedAt.get(player.seat)! >= this.lastRaiseSize;
        // 其他人都 all-in 或棄牌時，加注沒有對象
        const hasOpponentToRespond = this.players.some((p) => p !== player && this.canStillBet(p));
        const canRaise = reopened && hasOpponentToRespond && maxRaiseTo > this.currentBet;

        return {
            canFold: true,
            canCheck: toCall === 0,
            callAmount: Math.min(toCall, player.stack),
            canRaise,
            minRaiseTo: Math.min(fullMinRaiseTo, maxRaiseTo),
            maxRaiseTo,
        };
    }

    act(seat: number, action: PlayerAction): ActionResult {
        const player = this.actor;
        if (!player) return { ok: false, error: ErrorCode.HandOver };
        if (player.seat !== seat) return { ok: false, error: ErrorCode.NotYourTurn };

        const legal = this.legalActions(player);
        let kind: ActionKind;
        let raiseTo: number | null = null;

        switch (action.type) {
            case ActionType.Fold:
                kind = ActionKind.Fold;
                break;
            case ActionType.Check:
                if (!legal.canCheck) return { ok: false, error: ErrorCode.IllegalAction };
                kind = ActionKind.Check;
                break;
            case ActionType.Call:
                if (legal.callAmount === 0) return { ok: false, error: ErrorCode.IllegalAction };
                kind = ActionKind.Call;
                break;
            case ActionType.Raise: {
                if (!legal.canRaise) return { ok: false, error: ErrorCode.IllegalAction };
                const amount = action.amount;
                if (!Number.isInteger(amount) || amount < legal.minRaiseTo || amount > legal.maxRaiseTo) {
                    return { ok: false, error: ErrorCode.InvalidAmount };
                }
                raiseTo = amount;
                kind = this.currentBet === 0 ? ActionKind.Bet : ActionKind.Raise;
                break;
            }
            case ActionType.AllIn:
                if (legal.maxRaiseTo <= this.currentBet) {
                    // 籌碼不足跟注，all-in 等同跟注
                    kind = ActionKind.Call;
                } else {
                    if (!legal.canRaise) return { ok: false, error: ErrorCode.IllegalAction };
                    raiseTo = legal.maxRaiseTo;
                    kind = this.currentBet === 0 ? ActionKind.Bet : ActionKind.Raise;
                }
                break;
            default:
                return { ok: false, error: ErrorCode.IllegalAction };
        }

        let paid = 0;
        if (kind === ActionKind.Fold) {
            player.folded = true;
        } else if (kind === ActionKind.Call) {
            paid = this.pay(player, legal.callAmount);
        } else if (raiseTo !== null) {
            const raiseSize = raiseTo - this.currentBet;
            // 達到完整加注額才更新最小加注；不足額的 all-in 加注只提高注額
            if (raiseSize >= this.lastRaiseSize) this.lastRaiseSize = raiseSize;
            this.currentBet = raiseTo;
            paid = this.pay(player, raiseTo - player.committed);
        }

        this.actedAt.set(player.seat, this.currentBet);
        this.advanceCursor();

        return {
            ok: true,
            record: { seat, kind, paid, committed: player.committed, stack: player.stack, allIn: player.allIn },
        };
    }

    /**
     * 非輪到者的棄牌（離桌、改為觀戰）。輪到者請用 act。
     * 回傳 false 代表此玩家原本就已棄牌。
     */
    foldOutOfTurn(seat: number): boolean {
        const player = this.players.find((p) => p.seat === seat);
        if (!player || player.folded) return false;
        const wasActor = this.actor === player;
        player.folded = true;
        // 輪到者棄牌就換下一位；否則重新確認目前輪到者是否仍需行動（對手只剩他一人時可能不必）
        if (wasActor) this.advanceCursor();
        else this.seekActor();
        return true;
    }

    private pay(player: HandPlayer, amount: number): number {
        const paid = Math.min(amount, player.stack);
        player.stack -= paid;
        player.committed += paid;
        player.totalCommitted += paid;
        if (player.stack === 0) player.allIn = true;
        return paid;
    }

    /** 還能下注的玩家：未棄牌且未 all-in */
    private canStillBet(player: HandPlayer): boolean {
        return !player.folded && !player.allIn;
    }

    /**
     * 是否還需要行動：面對未跟上的注額，或本輪尚未行動。
     * 只剩一位能下注的玩家且已跟上注額時，沒有對手可以回應，不需要行動。
     */
    private needsToAct(player: HandPlayer): boolean {
        if (!this.canStillBet(player)) return false;
        if (player.committed < this.currentBet) return true;
        if (this.actedAt.has(player.seat)) return false;
        return this.players.filter((p) => this.canStillBet(p)).length > 1;
    }

    private advanceCursor(): void {
        this.cursor = (this.cursor + 1) % this.players.length;
        this.seekActor();
    }

    private seekActor(): void {
        if (this.isComplete) return;
        for (let i = 0; i < this.players.length; i++) {
            const index = (this.cursor + i) % this.players.length;
            if (this.needsToAct(this.players[index])) {
                this.cursor = index;
                return;
            }
        }
    }
}
