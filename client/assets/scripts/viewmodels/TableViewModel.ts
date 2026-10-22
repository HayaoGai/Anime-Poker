import { computed, Observable, type Computed, type ReadonlyObservable } from '../core/Observable';
import { ViewModel } from '../core/ViewModel';
import { mySeatIndex, type SeatSnapshot, type TableSnapshot } from '../models/TableSnapshot';
import { tableStore } from '../models/TableStore';
import type { Card } from '../shared/cards';
import type { LegalActions } from '../shared/events';
import { ActionType, type PlayerAction } from '../shared/poker';
import { ClientMessage, ServerMessage, type ServerPayloads } from '../shared/protocol';
import { MAX_SEATS, toBB } from '../shared/rules';

export type HandEventPayload = ServerPayloads[typeof ServerMessage.HandEvent];

/** 加注快捷：最小、½ 池、1 池（皆為「加注到」的金額） */
export interface RaiseShortcuts {
    min: number;
    halfPot: number;
    pot: number;
    max: number;
}

/**
 * 牌桌：座位以「自己在正下方」旋轉排列；底牌、合法動作只有自己收得到。
 * 客戶端只送出意圖（棄牌、過牌／跟注、加注到某金額、all-in），結果以伺服器廣播為準。
 */
export class TableViewModel extends ViewModel {
    readonly snapshot: ReadonlyObservable<TableSnapshot | null> = tableStore.snapshot;
    readonly mySeat: Computed<number>;
    readonly isSpectator: Computed<boolean>;
    /** 自己的底牌（新的一手開始時清空） */
    readonly holeCards = new Observable<Card[]>([]);
    /** 輪到自己時的合法動作；其他時候為 null */
    readonly legal = new Observable<LegalActions | null>(null);
    readonly deadline = new Observable(0);
    readonly connection = tableStore.session!.connection;

    private handNumber = 0;
    private readonly session = tableStore.session!;

    constructor() {
        super();
        const s = tableStore.snapshot;
        this.mySeat = computed([s], () => mySeatIndex(s.value, this.session.sessionId));
        this.isSpectator = computed([this.mySeat], () => this.mySeat.value === -1);
        this.bag.add(this.mySeat);
        this.bag.add(this.isSpectator);

        this.bag.add(
            this.session.on(ServerMessage.HoleCards, ({ handNumber, cards }) => {
                this.handNumber = handNumber;
                this.holeCards.value = cards;
            }),
        );
        this.bag.add(
            this.session.on(ServerMessage.YourTurn, ({ legal, deadline }) => {
                this.legal.value = legal;
                this.deadline.value = deadline;
            }),
        );
        // 輪到別人（或自己已行動）時收起行動面板
        this.bag.add(
            s.subscribe((snapshot) => {
                if (!snapshot || snapshot.turnSeat !== this.mySeat.value) this.legal.value = null;
                if (snapshot && snapshot.handNumber !== this.handNumber && this.holeCards.value.length) {
                    this.holeCards.value = [];
                }
            }),
        );
    }

    /** 牌局事件（依伺服器的節奏逐一送達） */
    onHandEvent(listener: (event: HandEventPayload) => void): void {
        this.bag.add(this.session.on(ServerMessage.HandEvent, listener));
    }

    onGameOver(listener: (payload: ServerPayloads[typeof ServerMessage.GameOver]) => void): void {
        this.bag.add(this.session.on(ServerMessage.GameOver, listener));
    }

    onNotice(listener: (payload: ServerPayloads[typeof ServerMessage.Notice]) => void): void {
        this.bag.add(this.session.on(ServerMessage.Notice, listener));
    }

    onError(listener: (payload: ServerPayloads[typeof ServerMessage.Error]) => void): void {
        this.bag.add(this.session.on(ServerMessage.Error, listener));
    }

    /** 實際座位 → 畫面位置（0 為正下方，順時針） */
    visualIndex(seat: number): number {
        const anchor = Math.max(0, this.mySeat.value);
        return (seat - anchor + MAX_SEATS) % MAX_SEATS;
    }

    seat(index: number): SeatSnapshot | undefined {
        return this.snapshot.value?.seats[index];
    }

    /** 剩餘行動時間（毫秒），以校正後的伺服器時間計算 */
    remaining(deadline: number): number {
        return this.session.timeSync.remaining(deadline);
    }

    /** 桌面上所有籌碼：已收進底池 + 本輪所有人的下注 */
    totalPot(): number {
        const s = this.snapshot.value;
        if (!s) return 0;
        return s.pots.reduce((a, b) => a + b, 0) + s.seats.reduce((a, seat) => a + seat.bet, 0);
    }

    /** 底池加注：先跟注後的底池大小，加上目前注額（½ 池同理） */
    raiseShortcuts(legal: LegalActions): RaiseShortcuts {
        const currentBet = this.snapshot.value?.currentBet ?? 0;
        const potAfterCall = this.totalPot() + legal.callAmount;
        const clamp = (v: number) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(v)));
        return {
            min: legal.minRaiseTo,
            halfPot: clamp(currentBet + potAfterCall / 2),
            pot: clamp(currentBet + potAfterCall),
            max: legal.maxRaiseTo,
        };
    }

    // ---------------------------------------------------------------- 意圖

    fold(): void {
        this.act({ type: ActionType.Fold });
    }

    checkOrCall(): void {
        const legal = this.legal.value;
        if (!legal) return;
        this.act(legal.canCheck ? { type: ActionType.Check } : { type: ActionType.Call });
    }

    raiseTo(amount: number): void {
        const legal = this.legal.value;
        if (!legal?.canRaise) return;
        if (amount >= legal.maxRaiseTo) this.act({ type: ActionType.AllIn });
        else this.act({ type: ActionType.Raise, amount: Math.round(amount) });
    }

    standUp(): void {
        this.session.send(ClientMessage.StandUp, {});
    }

    sit(): void {
        this.session.send(ClientMessage.Sit, {});
    }

    leave(): Promise<void> {
        return tableStore.leave();
    }

    private act(action: PlayerAction): void {
        this.legal.value = null;
        this.session.send(ClientMessage.Action, action);
    }
}

/** 籌碼 → 「12.5 BB」的數值部分 */
export const bb = (chips: number) => toBB(chips);
