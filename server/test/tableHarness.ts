import type { ServerMessage, ServerPayloads, RoomMetadata } from '@shared/protocol';
import { Table, type Scheduler, type TableOptions, type TableOutput, type Timer } from '@shared/table/Table';
import { cryptoRng } from '../src/rng';
import { createPokerState, type PokerState } from '../src/rooms/schema';

/** 手動推進的時鐘：advance 時依時間順序執行到期的計時器 */
export class ManualScheduler implements Scheduler {
    private time = 1_000_000;
    private timers: { at: number; seq: number; callback: () => void; cleared: boolean }[] = [];
    private seq = 0;

    now(): number {
        return this.time;
    }

    setTimeout(callback: () => void, ms: number): Timer {
        const timer = { at: this.time + ms, seq: this.seq++, callback, cleared: false };
        this.timers.push(timer);
        return { clear: () => void (timer.cleared = true) };
    }

    /** 推進 ms 毫秒，期間到期的計時器依序執行（執行中新增的計時器若也到期會一併執行） */
    advance(ms: number): void {
        const target = this.time + ms;
        for (;;) {
            const due = this.timers
                .filter((t) => !t.cleared && t.at <= target)
                .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
            if (!due) break;
            due.cleared = true;
            this.time = due.at;
            due.callback();
        }
        this.time = target;
        this.timers = this.timers.filter((t) => !t.cleared);
    }

    get pending(): number {
        return this.timers.filter((t) => !t.cleared).length;
    }
}

export interface Sent {
    to: string | '*';
    type: ServerMessage;
    payload: any;
}

export class RecordingOutput implements TableOutput {
    readonly messages: Sent[] = [];
    listing: RoomMetadata | null = null;
    dissolved = false;

    broadcast<T extends ServerMessage>(type: T, payload: ServerPayloads[T]): void {
        this.messages.push({ to: '*', type, payload: structuredClone(payload) });
    }

    send<T extends ServerMessage>(sessionId: string, type: T, payload: ServerPayloads[T]): void {
        this.messages.push({ to: sessionId, type, payload: structuredClone(payload) });
    }

    updateListing(metadata: RoomMetadata): void {
        this.listing = metadata;
    }

    dissolve(): void {
        this.dissolved = true;
    }

    /** 某個 session 收到的訊息（含廣播） */
    received(sessionId: string, type?: ServerMessage): Sent[] {
        return this.messages.filter((m) => (m.to === sessionId || m.to === '*') && (!type || m.type === type));
    }

    sentTo(sessionId: string, type: ServerMessage): Sent[] {
        return this.messages.filter((m) => m.to === sessionId && m.type === type);
    }

    broadcasts(type: ServerMessage): Sent[] {
        return this.messages.filter((m) => m.to === '*' && m.type === type);
    }

    last(sessionId: string, type: ServerMessage): Sent | undefined {
        return this.received(sessionId, type).at(-1);
    }
}

/** 以伺服器實際使用的 Schema 狀態建立牌桌 */
export function createTable(options: Partial<Omit<TableOptions<PokerState>, 'output' | 'scheduler'>> = {}) {
    const output = new RecordingOutput();
    const scheduler = new ManualScheduler();
    const table = new Table({ state: createPokerState(), rng: cryptoRng, output, scheduler, botThinkMs: [1000, 1000], ...options });
    return { table, output, scheduler };
}

let counter = 0;
export function player(nickname: string, extra: Record<string, unknown> = {}) {
    counter++;
    return { playerId: `player-${String(counter).padStart(4, '0')}-test`, nickname, avatarId: 'avatar_01', ...extra };
}
