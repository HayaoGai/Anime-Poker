import type { Observable, Unsubscribe } from '../core/Observable';
import type { ClientMessage, ClientPayloads, ServerMessage, ServerPayloads } from '../shared/protocol';
import type { TimeSync } from './TimeSync';

export type ConnectionState = 'connected' | 'reconnecting' | 'closed';

/**
 * 牌桌房間的連線介面，房間大廳與 Table 場景只透過它收發。
 * 實作：RoomSession（連線到伺服器的 Colyseus 房間）、LocalTableSession（離線模式，牌局在本機執行）。
 */
export interface TableSession {
    readonly connection: Observable<ConnectionState>;
    readonly timeSync: TimeSync;
    readonly sessionId: string;
    /** 離線模式（只有自己與電腦） */
    readonly offline: boolean;
    on<T extends ServerMessage>(type: T, listener: (payload: ServerPayloads[T]) => void): Unsubscribe;
    /** 狀態同步（每次更新後呼叫，訂閱時若已有狀態會立即呼叫一次） */
    onState(listener: (state: unknown) => void): Unsubscribe;
    send<T extends ClientMessage>(type: T, payload: ClientPayloads[T]): void;
    leave(): Promise<void>;
}

/**
 * 依類型分派伺服器訊息。某類型還沒有人訂閱時先暫存，第一個訂閱者出現時補送
 * （例如切換場景期間、或重連後馬上送達的底牌）。
 */
export class MessageHub {
    private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
    private readonly pending = new Map<string, unknown[]>();

    on<T extends ServerMessage>(type: T, listener: (payload: ServerPayloads[T]) => void): Unsubscribe {
        let set = this.listeners.get(type);
        if (!set) this.listeners.set(type, (set = new Set()));
        set.add(listener as (payload: unknown) => void);

        const queued = this.pending.get(type);
        if (queued) {
            this.pending.delete(type);
            for (const payload of queued) invoke(listener as (payload: unknown) => void, type, payload);
        }
        return () => set!.delete(listener as (payload: unknown) => void);
    }

    deliver(type: string, payload: unknown): void {
        const set = this.listeners.get(type);
        if (set && set.size) {
            for (const listener of [...set]) invoke(listener, type, payload);
            return;
        }
        const queue = this.pending.get(type) ?? [];
        // 只保留最近幾則，避免長時間沒人訂閱的類型無限累積
        queue.push(payload);
        if (queue.length > 20) queue.shift();
        this.pending.set(type, queue);
    }
}

/**
 * 個別訂閱者（通常是 UI）出錯時只記錄下來：不能影響其他訂閱者，
 * 也不能中斷 session 收到訊息後的處理（例如收到房間解散通知後立即離開）。
 */
function invoke(listener: (payload: unknown) => void, type: string, payload: unknown): void {
    try {
        listener(payload);
    } catch (err) {
        console.error(`[MessageHub] 處理 ${type} 時發生錯誤`, err, err instanceof Error ? err.stack : '');
    }
}
