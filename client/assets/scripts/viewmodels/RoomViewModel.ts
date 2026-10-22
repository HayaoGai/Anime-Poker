import { computed, type ReadonlyObservable } from '../core/Observable';
import { ViewModel } from '../core/ViewModel';
import { hostNickname, mySeatIndex, type SeatSnapshot } from '../models/TableSnapshot';
import { tableStore } from '../models/TableStore';
import { ClientMessage, RoomPhase } from '../shared/protocol';
import { MIN_PLAYERS_TO_START } from '../shared/rules';

/**
 * 房間大廳（等待開始）：座位、房主操作（增減電腦、開始遊戲）、觀戰者坐下、離開房間。
 * 所有操作只送出意圖，結果以伺服器同步的狀態為準。
 */
export class RoomViewModel extends ViewModel {
    readonly seats: ReadonlyObservable<SeatSnapshot[]>;
    readonly hostName: ReadonlyObservable<string>;
    readonly isHost: ReadonlyObservable<boolean>;
    readonly mySeat: ReadonlyObservable<number>;
    readonly isSpectator: ReadonlyObservable<boolean>;
    readonly spectatorCount: ReadonlyObservable<number>;
    readonly canStart: ReadonlyObservable<boolean>;
    readonly phase: ReadonlyObservable<RoomPhase | null>;

    constructor() {
        super();
        const s = tableStore.snapshot;
        const derive = <T>(fn: () => T) => {
            const c = computed([s], fn);
            this.bag.add(c);
            return c;
        };
        this.seats = derive(() => s.value?.seats ?? []);
        this.hostName = derive(() => hostNickname(s.value));
        this.isHost = derive(() => !!s.value && s.value.hostSessionId === tableStore.sessionId);
        this.mySeat = derive(() => mySeatIndex(s.value, tableStore.sessionId));
        this.isSpectator = derive(() => mySeatIndex(s.value, tableStore.sessionId) === -1);
        this.spectatorCount = derive(() => s.value?.spectatorCount ?? 0);
        this.canStart = derive(() => (s.value?.seats.filter((seat) => seat.occupied).length ?? 0) >= MIN_PLAYERS_TO_START);
        this.phase = derive(() => s.value?.phase ?? null);
    }

    addBot(seat: number): void {
        tableStore.session?.send(ClientMessage.AddBot, { seat });
    }

    removeBot(seat: number): void {
        tableStore.session?.send(ClientMessage.RemoveBot, { seat });
    }

    sit(seat: number): void {
        tableStore.session?.send(ClientMessage.Sit, { seat });
    }

    start(): void {
        tableStore.session?.send(ClientMessage.StartGame, {});
    }

    leave(): Promise<void> {
        return tableStore.leave();
    }
}
