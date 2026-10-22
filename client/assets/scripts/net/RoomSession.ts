import { Observable, type Unsubscribe } from '../core/Observable';
import { ClientMessage, ServerMessage, type ClientPayloads, type ServerPayloads } from '../shared/protocol';
import { TimeSync } from './TimeSync';

export type ConnectionState = 'connected' | 'reconnecting' | 'closed';

const TIME_SYNC_INTERVAL_MS = 30_000;
const TIME_SYNC_BURST = 4;

/**
 * 包裝一個 Colyseus 房間：帶型別的收發、連線狀態、伺服器時間校正。
 *
 * SDK 會丟棄「尚未註冊類型」的訊息，因此建立時立刻以 '*' 接收所有訊息；
 * 某類型還沒有人訂閱時先暫存，第一個訂閱者出現時補送（例如重連後馬上送達的底牌）。
 */
export class RoomSession<State = unknown> {
    readonly connection = new Observable<ConnectionState>('connected');
    readonly timeSync = new TimeSync();
    readonly room: Colyseus.Room<State>;

    private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
    private readonly pending = new Map<string, unknown[]>();
    private timeSyncTimer: ReturnType<typeof setInterval> | null = null;

    constructor(room: Colyseus.Room<State>, options: { timeSync?: boolean } = {}) {
        this.room = room;
        room.onMessage('*', (type, payload) => this.dispatch(String(type), payload));
        room.onDrop(() => (this.connection.value = 'reconnecting'));
        room.onReconnect(() => {
            this.connection.value = 'connected';
            if (options.timeSync) this.syncTime(TIME_SYNC_BURST);
        });
        room.onLeave(() => this.close());

        if (options.timeSync) {
            this.on(ServerMessage.TimeSync, ({ clientTime, serverTime }) => this.timeSync.addSample(clientTime, serverTime, Date.now()));
            this.syncTime(TIME_SYNC_BURST);
            this.timeSyncTimer = setInterval(() => this.syncTime(1), TIME_SYNC_INTERVAL_MS);
        }
    }

    get sessionId(): string {
        return this.room.sessionId;
    }

    get state(): State {
        return this.room.state;
    }

    on<T extends ServerMessage>(type: T, listener: (payload: ServerPayloads[T]) => void): Unsubscribe {
        let set = this.listeners.get(type);
        if (!set) this.listeners.set(type, (set = new Set()));
        set.add(listener as (payload: unknown) => void);

        const queued = this.pending.get(type);
        if (queued) {
            this.pending.delete(type);
            for (const payload of queued) listener(payload as ServerPayloads[T]);
        }
        return () => set!.delete(listener as (payload: unknown) => void);
    }

    /** 自訂訊息以外的狀態同步（每次 patch 後呼叫） */
    onState(listener: (state: State) => void): Unsubscribe {
        this.room.onStateChange(listener);
        if (this.room.state) listener(this.room.state);
        return () => this.room.onStateChange.remove(listener);
    }

    send<T extends ClientMessage>(type: T, payload: ClientPayloads[T]): void {
        if (this.connection.value === 'closed') return;
        this.room.send(type, payload);
    }

    async leave(): Promise<void> {
        if (this.connection.value === 'closed') return;
        this.close();
        await this.room.leave(true).catch(() => undefined);
    }

    private syncTime(times: number): void {
        for (let i = 0; i < times; i++) {
            setTimeout(() => this.send(ClientMessage.TimeSync, { clientTime: Date.now() }), i * 250);
        }
    }

    private dispatch(type: string, payload: unknown): void {
        const set = this.listeners.get(type);
        if (set && set.size) {
            for (const listener of [...set]) listener(payload);
            return;
        }
        const queue = this.pending.get(type) ?? [];
        // 只保留最近幾則，避免長時間沒人訂閱的類型無限累積
        queue.push(payload);
        if (queue.length > 20) queue.shift();
        this.pending.set(type, queue);
    }

    private close(): void {
        if (this.timeSyncTimer) clearInterval(this.timeSyncTimer);
        this.timeSyncTimer = null;
        this.connection.value = 'closed';
    }
}
