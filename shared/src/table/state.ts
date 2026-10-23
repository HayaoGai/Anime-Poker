import { MAX_SEATS } from '../rules';

/**
 * Table 讀寫的狀態陣列。伺服器是 Colyseus 的 ArraySchema（變更會自動同步給客戶端），
 * 客戶端離線模式是附加 clear() 的一般陣列。只宣告 Table 用到的操作。
 */
export interface StateList<T> extends Iterable<T> {
    readonly length: number;
    [index: number]: T;
    push(...items: T[]): number;
    clear(): void;
    entries(): IterableIterator<[number, T]>;
    filter(predicate: (value: T, index: number) => unknown): T[];
    map<U>(callback: (value: T, index: number) => U): U[];
    findIndex(predicate: (value: T, index: number) => unknown): number;
}

/** 一個座位的公開資訊；欄位說明見 server/src/rooms/schema.ts */
export interface SeatData {
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
    shownCards: StateList<string>;
}

/** 同步給所有人（含觀戰者）的牌桌狀態，只放公開資訊 */
export interface TableState {
    phase: string;
    hostSessionId: string;
    seats: StateList<SeatData>;
    spectatorCount: number;
    handNumber: number;
    buttonSeat: number;
    smallBlindSeat: number;
    bigBlindSeat: number;
    street: string;
    board: StateList<string>;
    pots: StateList<number>;
    currentBet: number;
    turnSeat: number;
    turnDeadline: number;
}

function plainList<T>(): StateList<T> {
    return Object.assign([] as T[], {
        clear(this: T[]) {
            this.length = 0;
        },
    });
}

/** 以一般物件建立的狀態（離線模式），初始值與伺服器的 Schema 預設值相同 */
export function createPlainTableState(): TableState {
    const seats = plainList<SeatData>();
    for (let i = 0; i < MAX_SEATS; i++) {
        seats.push({
            occupied: false,
            sessionId: '',
            isBot: false,
            nickname: '',
            avatarId: '',
            stack: 0,
            bet: 0,
            inHand: false,
            folded: false,
            allIn: false,
            connected: true,
            shownCards: plainList<string>(),
        });
    }
    return {
        phase: 'lobby',
        hostSessionId: '',
        seats,
        spectatorCount: 0,
        handNumber: 0,
        buttonSeat: -1,
        smallBlindSeat: -1,
        bigBlindSeat: -1,
        street: '',
        board: plainList<string>(),
        pots: plainList<number>(),
        currentBet: 0,
        turnSeat: -1,
        turnDeadline: 0,
    };
}
