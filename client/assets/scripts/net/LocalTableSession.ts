import { Observable, type Unsubscribe } from '../core/Observable';
import { randomInt } from '../core/random';
import type { ErrorCode } from '../shared/errors';
import { ClientMessage, ServerMessage, type ClientPayloads, type JoinOptions, type ServerPayloads } from '../shared/protocol';
import { createPlainTableState } from '../shared/table/state';
import { Table, type Timer } from '../shared/table/Table';
import { MessageHub, type ConnectionState, type TableSession } from './TableSession';
import { TimeSync } from './TimeSync';

const LOCAL_SESSION_ID = 'local-player';
/** 開桌時預先坐好的電腦人數，房間大廳中仍可增減 */
const PREFILLED_BOTS = 3;

/**
 * 離線模式：在本機執行與伺服器相同的 Table（shared/table），只有自己與電腦，不需要網路。
 * 對房間大廳與 Table 場景而言與 RoomSession 沒有差別：
 *   - 送出的意圖與 Table 的輸出都以 setTimeout 非同步傳遞，不會在同一個呼叫堆疊中重入；
 *   - 訊息先送達、狀態後更新（同一輪產生的變更合併成一次），與 Colyseus 的訊息與狀態 patch 順序相同；
 *   - 訊息內容複製一份再送出，與經過網路序列化一樣不共用參考。
 * 可以暫停：牌桌時鐘與所有計時器（電腦思考、行動倒數、發下一手）一起停住，繼續時從停住的地方接著走。
 */
export class LocalTableSession implements TableSession {
    readonly connection = new Observable<ConnectionState>('connected');
    readonly timeSync: TimeSync = new LocalTimeSync(() => this.now());
    readonly sessionId = LOCAL_SESSION_ID;
    readonly offline = true;

    private readonly hub = new MessageHub();
    private readonly stateListeners = new Set<(state: unknown) => void>();
    private readonly timers = new Set<PendingTimer>();
    /** 暫停開始的本機時間；未暫停時為 null */
    private pausedAt: number | null = null;
    /** 累計暫停的毫秒數：牌桌時鐘 = 本機時鐘 - 累計暫停 */
    private pausedTotal = 0;
    private readonly table: Table;
    private outbox: { type: string; payload: unknown }[] = [];
    private stateDirty = false;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    /** 房間解散：送完解散通知後關閉 */
    private closeAfterFlush = false;

    /** 開一桌並以房主身分坐下；加入參數不合法時回傳錯誤碼 */
    static create(options: JoinOptions): LocalTableSession | ErrorCode {
        const session = new LocalTableSession();
        const result = session.table.join(session.sessionId, options);
        if (!result.ok) {
            session.close();
            return result.error;
        }
        // 「某某加入房間」是給其他玩家看的通知，離線時只有自己，不顯示
        session.outbox = [];
        for (let i = 0; i < PREFILLED_BOTS; i++) session.table.handleMessage(session.sessionId, ClientMessage.AddBot, {});
        session.markDirty();
        return session;
    }

    private constructor() {
        this.table = new Table({
            state: createPlainTableState(),
            rng: randomInt,
            output: {
                broadcast: (type, payload) => this.post(type, payload),
                send: (sessionId, type, payload) => sessionId === this.sessionId && this.post(type, payload),
                updateListing: () => undefined,
                dissolve: () => {
                    this.closeAfterFlush = true;
                    this.scheduleFlush();
                },
            },
            scheduler: {
                now: () => this.now(),
                setTimeout: (callback, ms) => this.schedule(callback, ms),
            },
        });
    }

    private get closed(): boolean {
        return this.connection.value === 'closed';
    }

    on<T extends ServerMessage>(type: T, listener: (payload: ServerPayloads[T]) => void): Unsubscribe {
        return this.hub.on(type, listener);
    }

    onState(listener: (state: unknown) => void): Unsubscribe {
        this.stateListeners.add(listener);
        if (!this.closed) listener(this.table.state);
        return () => this.stateListeners.delete(listener);
    }

    send<T extends ClientMessage>(type: T, payload: ClientPayloads[T]): void {
        if (this.closed) return;
        const copy = clone(payload);
        this.schedule(() => this.table.handleMessage(this.sessionId, type, copy), 0);
    }

    setPaused(paused: boolean): void {
        if (this.closed || paused === (this.pausedAt !== null)) return;
        if (paused) {
            this.pausedAt = Date.now();
        } else {
            this.pausedTotal += Date.now() - this.pausedAt!;
            this.pausedAt = null;
        }
        for (const timer of this.timers) this.arm(timer);
    }

    async leave(): Promise<void> {
        if (this.closed) return;
        this.close();
    }

    // ---------------------------------------------------------------- 排程與輸出

    /** 牌桌時鐘：暫停期間停住 */
    private now(): number {
        return (this.pausedAt ?? Date.now()) - this.pausedTotal;
    }

    /**
     * Table 的計時器與送進來的意圖：執行後 Table 的狀態可能已改變。
     * 以牌桌時鐘記下到期時間，暫停時取消底層的 setTimeout，繼續時依剩餘時間重新排程。
     */
    private schedule(callback: () => void, ms: number): Timer {
        const timer: PendingTimer = { callback, due: this.now() + ms, handle: null };
        this.timers.add(timer);
        this.arm(timer);
        return {
            clear: () => {
                if (timer.handle) clearTimeout(timer.handle);
                this.timers.delete(timer);
            },
        };
    }

    /** 依目前是否暫停，重新設定計時器底層的 setTimeout */
    private arm(timer: PendingTimer): void {
        if (timer.handle) clearTimeout(timer.handle);
        timer.handle = null;
        if (this.pausedAt !== null) return;
        timer.handle = setTimeout(() => {
            this.timers.delete(timer);
            if (this.closed) return;
            timer.callback();
            this.markDirty();
        }, Math.max(0, timer.due - this.now()));
    }

    private post(type: string, payload: unknown): void {
        this.outbox.push({ type, payload: clone(payload) });
        this.scheduleFlush();
    }

    private markDirty(): void {
        this.stateDirty = true;
        this.scheduleFlush();
    }

    private scheduleFlush(): void {
        if (!this.flushTimer && !this.closed) this.flushTimer = setTimeout(() => this.flush(), 0);
    }

    private flush(): void {
        this.flushTimer = null;
        const messages = this.outbox;
        this.outbox = [];
        for (const { type, payload } of messages) {
            if (this.closed) return;
            this.hub.deliver(type, payload);
        }
        if (this.closeAfterFlush) {
            this.close();
            return;
        }
        if (this.stateDirty && !this.closed) {
            this.stateDirty = false;
            for (const listener of [...this.stateListeners]) listener(this.table.state);
        }
    }

    private close(): void {
        if (this.closed) return;
        this.connection.value = 'closed';
        this.table.dispose();
        for (const timer of this.timers) if (timer.handle) clearTimeout(timer.handle);
        this.timers.clear();
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = null;
        this.outbox = [];
    }
}

interface PendingTimer {
    callback: () => void;
    /** 到期時間（牌桌時鐘） */
    due: number;
    handle: ReturnType<typeof setTimeout> | null;
}

/** 牌桌時鐘就在本機，不需要校正：伺服器時間直接取牌桌時鐘（暫停期間停住，倒數也跟著停） */
class LocalTimeSync extends TimeSync {
    constructor(private readonly clock: () => number) {
        super();
    }

    serverNow(): number {
        return this.clock();
    }
}

/** 訊息都是純資料（JSON 可表示），複製一份模擬經過網路序列化 */
function clone<T>(value: T): T {
    return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
