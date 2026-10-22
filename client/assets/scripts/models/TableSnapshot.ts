/**
 * 伺服器同步狀態（Colyseus Schema）轉成純資料快照，供 ViewModel 使用（不依賴 cc，可在 Node 測試）。
 * 欄位對應 server/src/rooms/schema.ts。
 */
import type { Card } from '../shared/cards';
import type { RoomPhase } from '../shared/protocol';

export interface SeatSnapshot {
    index: number;
    occupied: boolean;
    sessionId: string;
    isBot: boolean;
    nickname: string;
    avatarId: string;
    stack: number;
    bet: number;
    inHand: boolean;
    folded: boolean;
    allIn: boolean;
    connected: boolean;
    shownCards: Card[];
}

export interface TableSnapshot {
    phase: RoomPhase;
    hostSessionId: string;
    seats: SeatSnapshot[];
    spectatorCount: number;
    handNumber: number;
    buttonSeat: number;
    smallBlindSeat: number;
    bigBlindSeat: number;
    street: string;
    board: Card[];
    pots: number[];
    currentBet: number;
    turnSeat: number;
    turnDeadline: number;
}

/** ArraySchema 或一般陣列轉成陣列 */
function list<T>(value: unknown): T[] {
    if (!value) return [];
    const withToArray = value as { toArray?: () => T[] };
    if (typeof withToArray.toArray === 'function') return withToArray.toArray();
    return Array.from(value as ArrayLike<T>);
}

export function toTableSnapshot(state: any): TableSnapshot {
    return {
        phase: state.phase,
        hostSessionId: state.hostSessionId,
        seats: list<any>(state.seats).map((s, index) => ({
            index,
            occupied: s.occupied,
            sessionId: s.sessionId,
            isBot: s.isBot,
            nickname: s.nickname,
            avatarId: s.avatarId,
            stack: s.stack,
            bet: s.bet,
            inHand: s.inHand,
            folded: s.folded,
            allIn: s.allIn,
            connected: s.connected,
            shownCards: list<Card>(s.shownCards),
        })),
        spectatorCount: state.spectatorCount,
        handNumber: state.handNumber,
        buttonSeat: state.buttonSeat,
        smallBlindSeat: state.smallBlindSeat,
        bigBlindSeat: state.bigBlindSeat,
        street: state.street,
        board: list<Card>(state.board),
        pots: list<number>(state.pots),
        currentBet: state.currentBet,
        turnSeat: state.turnSeat,
        turnDeadline: state.turnDeadline,
    };
}

/** 自己所在的座位，觀戰者為 -1 */
export function mySeatIndex(snapshot: TableSnapshot | null, sessionId: string): number {
    return snapshot?.seats.findIndex((s) => s.occupied && s.sessionId === sessionId) ?? -1;
}

export function hostNickname(snapshot: TableSnapshot | null): string {
    return snapshot?.seats.find((s) => s.occupied && s.sessionId === snapshot.hostSessionId)?.nickname ?? '';
}
