import { Observable, type Unsubscribe } from '../core/Observable';
import { ClientMessage, NoticeCode, ServerMessage, type ClientPayloads, type ServerPayloads } from '../shared/protocol';
import { MessageHub, type ConnectionState, type TableSession } from './TableSession';
import { TimeSync } from './TimeSync';

const TIME_SYNC_INTERVAL_MS = 30_000;
const TIME_SYNC_BURST = 4;
/** 送出離開後等待伺服器關閉連線的時間，逾時由客戶端自行關閉 */
const LEAVE_TIMEOUT_MS = 1500;

/**
 * 離開房間且不再自動重連。
 * 部署環境（Render 的代理）不一定會把伺服器端的關閉轉送到客戶端：連線會懸著，約 20 秒後以 1006 斷線，
 * SDK 會誤判為非自願斷線而不斷重連。因此先關閉自動重連，送出離開後若逾時沒有收到關閉，就由客戶端關閉連線。
 */
export function leaveRoom(room: Colyseus.Room): Promise<void> {
    room.reconnection.enabled = false;
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            void room.leave(false).catch(() => undefined);
            resolve();
        }, LEAVE_TIMEOUT_MS);
        room.leave(true)
            .catch(() => undefined)
            .then(() => {
                clearTimeout(timer);
                resolve();
            });
    });
}

/**
 * 包裝一個 Colyseus 房間：帶型別的收發、連線狀態、伺服器時間校正。
 *
 * SDK 會丟棄「尚未註冊類型」的訊息，因此建立時立刻以 '*' 接收所有訊息，交給 MessageHub 分派或暫存。
 */
export class RoomSession<State = unknown> implements TableSession {
    readonly connection = new Observable<ConnectionState>('connected');
    readonly timeSync = new TimeSync();
    readonly room: Colyseus.Room<State>;

    private readonly hub = new MessageHub();
    private timeSyncTimer: ReturnType<typeof setInterval> | null = null;

    constructor(room: Colyseus.Room<State>, options: { timeSync?: boolean } = {}) {
        this.room = room;
        room.onMessage('*', (type, payload) => this.dispatch(String(type), payload));
        // 'closed' 是終止狀態：離開或房間解散後，SDK 才收到的斷線事件不再改變狀態
        room.onDrop(() => {
            if (this.connection.value !== 'closed') this.connection.value = 'reconnecting';
        });
        room.onReconnect(() => {
            if (this.connection.value === 'closed') return;
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
        return this.hub.on(type, listener);
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
        await leaveRoom(this.room);
    }

    private syncTime(times: number): void {
        for (let i = 0; i < times; i++) {
            setTimeout(() => this.send(ClientMessage.TimeSync, { clientTime: Date.now() }), i * 250);
        }
    }

    private dispatch(type: string, payload: unknown): void {
        this.hub.deliver(type, payload);
        // 房間解散：通知送達後立即結束這個連線，不等伺服器關閉（見 leaveRoom）
        if (type === ServerMessage.Notice && (payload as ServerPayloads[typeof ServerMessage.Notice]).code === NoticeCode.RoomDissolved) {
            void this.leave();
        }
    }

    private close(): void {
        if (this.timeSyncTimer) clearInterval(this.timeSyncTimer);
        this.timeSyncTimer = null;
        this.connection.value = 'closed';
    }
}
