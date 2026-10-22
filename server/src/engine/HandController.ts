import type { Card } from '@shared/cards';
import type { HandEvent, LegalActions, ShowdownResult } from '@shared/events';
import { ErrorCode } from '@shared/errors';
import { ActionKind, ActionType, Street, type HandCategory, type PlayerAction } from '@shared/poker';
import { BettingRound, type HandPlayer } from './BettingRound';
import { Deck } from './Deck';
import { evaluateBest, type HandValue } from './HandEvaluator';
import { blindSeats, seatsAfter } from './positions';
import { buildPots, findUncalled, splitPot, type Pot } from './PotManager';

export interface HandSeat {
    seat: number;
    stack: number;
}

export interface HandOptions {
    /** 本手的參賽者（籌碼必須大於 0），任意順序 */
    seats: readonly HandSeat[];
    button: number;
    smallBlind: number;
    bigBlind: number;
    deck: Deck;
}

export type HandResult = { ok: true; events: HandEvent[] } | { ok: false; error: ErrorCode };

const NEXT_STREET: Partial<Record<Street, Street>> = {
    [Street.Preflop]: Street.Flop,
    [Street.Flop]: Street.Turn,
    [Street.Turn]: Street.River,
};

/**
 * 一手無限注德州撲克的完整流程：盲注 → 發底牌 → 四條街下注 → 攤牌與分池。
 * 只處理規則，不碰網路與計時；所有隨機性來自注入的 Deck。
 */
export class HandController {
    readonly button: number;
    readonly smallBlindSeat: number;
    readonly bigBlindSeat: number;

    private readonly options: HandOptions;
    private readonly players: HandPlayer[];
    private readonly playerBySeat = new Map<number, HandPlayer>();
    private readonly holes = new Map<number, Card[]>();
    private readonly deck: Deck;
    private readonly board: Card[] = [];

    private currentStreet: Street = Street.Preflop;
    private round!: BettingRound;
    private pots: Pot[] = [];
    private revealed = false;
    private complete = false;
    private started = false;

    constructor(options: HandOptions) {
        if (options.seats.length < 2) throw new Error('至少需要 2 位玩家');
        if (options.seats.some((s) => s.stack <= 0)) throw new Error('參賽者籌碼必須大於 0');

        this.options = options;
        this.deck = options.deck;
        this.players = [...options.seats]
            .sort((a, b) => a.seat - b.seat)
            .map(({ seat, stack }) => ({ seat, stack, committed: 0, totalCommitted: 0, folded: false, allIn: false }));
        for (const p of this.players) this.playerBySeat.set(p.seat, p);

        this.button = options.button;
        const blinds = blindSeats(options.button, this.seatOrder);
        this.smallBlindSeat = blinds.smallBlind;
        this.bigBlindSeat = blinds.bigBlind;
    }

    // ---------------------------------------------------------------- 查詢

    get street(): Street {
        return this.currentStreet;
    }

    get isComplete(): boolean {
        return this.complete;
    }

    get communityCards(): readonly Card[] {
        return this.board;
    }

    /** 已收進底池的各池金額（不含本輪桌面上的下注） */
    get potAmounts(): number[] {
        return this.pots.map((p) => p.amount);
    }

    /** 本輪的注額 */
    get currentBet(): number {
        return this.activeRound?.bet ?? 0;
    }

    get actorSeat(): number | null {
        return this.activeRound?.actor?.seat ?? null;
    }

    /** 唯讀的玩家狀態快照 */
    get playerStates(): readonly Readonly<HandPlayer>[] {
        return this.players.map((p) => ({ ...p }));
    }

    holeCards(seat: number): readonly Card[] | undefined {
        return this.holes.get(seat);
    }

    /** 輪到者的合法動作；不是輪到者時為 null */
    legalActions(seat: number): LegalActions | null {
        const actor = this.activeRound?.actor;
        return actor?.seat === seat ? this.round.legalActions(actor) : null;
    }

    /** 逾時的預設動作：能過牌就過牌，否則棄牌 */
    timeoutAction(): PlayerAction {
        const seat = this.actorSeat;
        const legal = seat === null ? null : this.legalActions(seat);
        return legal?.canCheck ? { type: ActionType.Check } : { type: ActionType.Fold };
    }

    // ---------------------------------------------------------------- 流程

    start(): HandEvent[] {
        if (this.started) throw new Error('這手牌已經開始');
        this.started = true;

        const events: HandEvent[] = [
            { type: 'handStarted', button: this.button, smallBlindSeat: this.smallBlindSeat, bigBlindSeat: this.bigBlindSeat },
        ];

        events.push(this.postBlind(this.smallBlindSeat, 'small', this.options.smallBlind));
        events.push(this.postBlind(this.bigBlindSeat, 'big', this.options.bigBlind));

        // 從按鈕下一位開始，一次一張繞兩圈
        const order = seatsAfter(this.button, this.seatOrder);
        for (const seat of order) this.holes.set(seat, []);
        for (let round = 0; round < 2; round++) {
            for (const seat of order) this.holes.get(seat)!.push(this.deck.draw());
        }
        events.push({ type: 'holeCardsDealt', order });

        // 翻牌前由大盲的下一位先行動（兩人對決時即按鈕／小盲）
        this.round = new BettingRound(this.playersAfter(this.bigBlindSeat), {
            currentBet: this.options.bigBlind,
            bigBlind: this.options.bigBlind,
        });

        this.advance(events);
        return events;
    }

    act(seat: number, action: PlayerAction): HandResult {
        if (!this.activeRound) return { ok: false, error: ErrorCode.HandOver };
        const player = this.playerBySeat.get(seat);
        if (!player || player.folded) return { ok: false, error: ErrorCode.NotInHand };

        const result = this.round.act(seat, action);
        if (!result.ok) return result;

        const events: HandEvent[] = [{ type: 'playerActed', street: this.currentStreet, ...result.record }];
        this.advance(events);
        return { ok: true, events };
    }

    /**
     * 強制棄牌（離桌、改為觀戰、斷線逾時），不論是否輪到此玩家。
     * 已 all-in 的玩家也會棄牌並失去分池資格。
     */
    forceFold(seat: number): HandEvent[] {
        const player = this.playerBySeat.get(seat);
        if (!this.activeRound || !player || player.folded) return [];

        if (this.round.actor === player) {
            const result = this.act(seat, { type: ActionType.Fold });
            return result.ok ? result.events : [];
        }

        this.round.foldOutOfTurn(seat);
        const events: HandEvent[] = [
            {
                type: 'playerActed',
                street: this.currentStreet,
                seat,
                kind: ActionKind.Fold,
                paid: 0,
                committed: player.committed,
                stack: player.stack,
                allIn: player.allIn,
            },
        ];
        this.advance(events);
        return events;
    }

    // ---------------------------------------------------------------- 內部

    /** 進行中的下注回合；尚未開始或已結束時為 null */
    private get activeRound(): BettingRound | null {
        return this.started && !this.complete ? this.round : null;
    }

    /** 本手參賽者座位（由小到大） */
    private get seatOrder(): number[] {
        return this.players.map((p) => p.seat);
    }

    private playersAfter(seat: number): HandPlayer[] {
        return seatsAfter(seat, this.seatOrder).map((s) => this.playerBySeat.get(s)!);
    }

    private get livePlayers(): HandPlayer[] {
        return this.players.filter((p) => !p.folded);
    }

    private postBlind(seat: number, blind: 'small' | 'big', amount: number): HandEvent {
        const player = this.playerBySeat.get(seat)!;
        const paid = Math.min(amount, player.stack);
        player.stack -= paid;
        player.committed += paid;
        player.totalCommitted += paid;
        if (player.stack === 0) player.allIn = true;
        return { type: 'blindPosted', seat, blind, amount: paid, allIn: player.allIn };
    }

    /** 推進牌局直到需要玩家行動或這手牌結束 */
    private advance(events: HandEvent[]): void {
        while (!this.complete) {
            if (this.livePlayers.length === 1) {
                this.collectBets(events);
                this.awardPots(events, null);
                return;
            }

            if (!this.round.isComplete) {
                events.push({ type: 'actionRequired', seat: this.round.actor!.seat, street: this.currentStreet });
                return;
            }

            this.collectBets(events);

            const next = NEXT_STREET[this.currentStreet];
            if (!next) {
                this.showdown(events);
                return;
            }

            // 能下注的玩家不足兩位：公開底牌後把公共牌一次發完
            const canBet = this.livePlayers.filter((p) => !p.allIn);
            if (canBet.length < 2) {
                this.reveal(events);
                while (NEXT_STREET[this.currentStreet]) this.dealStreet(events, NEXT_STREET[this.currentStreet]!);
                this.showdown(events);
                return;
            }

            this.dealStreet(events, next);
            this.round = new BettingRound(this.playersAfter(this.button), { currentBet: 0, bigBlind: this.options.bigBlind });
        }
    }

    /** 退回無人跟注的部分，再把本輪下注收進底池 */
    private collectBets(events: HandEvent[]): void {
        const uncalled = findUncalled(this.players.map((p) => ({ seat: p.seat, amount: p.committed, folded: p.folded })));
        if (uncalled) {
            const player = this.playerBySeat.get(uncalled.seat)!;
            player.committed -= uncalled.amount;
            player.totalCommitted -= uncalled.amount;
            player.stack += uncalled.amount;
            if (player.stack > 0) player.allIn = false;
            events.push({ type: 'uncalledReturned', seat: uncalled.seat, amount: uncalled.amount });
        }

        const hadBets = this.players.some((p) => p.committed > 0);
        for (const p of this.players) p.committed = 0;
        this.pots = buildPots(this.players.map((p) => ({ seat: p.seat, amount: p.totalCommitted, folded: p.folded })));
        if (hadBets) events.push({ type: 'betsCollected', street: this.currentStreet, pots: this.potAmounts });
    }

    private dealStreet(events: HandEvent[], street: Street): void {
        this.deck.burn();
        const cards = this.deck.drawMany(street === Street.Flop ? 3 : 1);
        this.board.push(...cards);
        this.currentStreet = street;
        events.push({ type: 'boardDealt', street, cards });
    }

    private reveal(events: HandEvent[]): void {
        if (this.revealed) return;
        this.revealed = true;
        const hands = this.playersAfter(this.button)
            .filter((p) => !p.folded)
            .map((p) => ({ seat: p.seat, cards: [...this.holes.get(p.seat)!] }));
        events.push({ type: 'handsRevealed', hands });
    }

    private showdown(events: HandEvent[]): void {
        this.reveal(events);
        const values = new Map<number, HandValue>();
        for (const p of this.livePlayers) values.set(p.seat, evaluateBest([...this.holes.get(p.seat)!, ...this.board]));
        this.awardPots(events, values);
    }

    /** values 為 null 代表無人攤牌（其他人都棄牌），唯一的玩家贏得所有底池 */
    private awardPots(events: HandEvent[], values: Map<number, HandValue> | null): void {
        // 零頭依按鈕左手邊開始的順序分配
        const positionOrder = seatsAfter(this.button, this.seatOrder);

        this.pots.forEach((pot, potIndex) => {
            let winners: number[];
            let category: HandCategory | null = null;
            if (values) {
                const best = Math.max(...pot.eligible.map((seat) => values.get(seat)!.score));
                winners = pot.eligible.filter((seat) => values.get(seat)!.score === best);
                category = values.get(winners[0])!.category;
            } else {
                winners = pot.eligible;
            }

            const ordered = positionOrder.filter((seat) => winners.includes(seat));
            const shares = splitPot(pot.amount, ordered);
            for (const [seat, amount] of shares) this.playerBySeat.get(seat)!.stack += amount;

            events.push({
                type: 'potAwarded',
                potIndex,
                amount: pot.amount,
                winners: ordered.map((seat) => ({ seat, amount: shares.get(seat)! })),
                category,
            });
        });

        this.pots = [];
        this.complete = true;

        const showdown: ShowdownResult[] = values
            ? [...values].map(([seat, v]) => ({ seat, category: v.category, bestFive: v.bestFive }))
            : [];
        events.push({ type: 'handEnded', showdown });
    }
}
