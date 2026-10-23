import { Observable, type Unsubscribe } from '../core/Observable';
import type { TableSession } from '../net/TableSession';
import { toTableSnapshot, type TableSnapshot } from './TableSnapshot';

/**
 * 目前所在的牌桌房間（連線房間或離線牌局）。跨場景保留：Lobby 的房間大廳與 Table 場景共用同一個 session，
 * 切換場景期間收到的訊息由 session 暫存，Table 場景訂閱時補送。
 */
class TableStore {
    readonly snapshot = new Observable<TableSnapshot | null>(null);
    private current: TableSession | null = null;
    private unsubscribes: Unsubscribe[] = [];

    get session(): TableSession | null {
        return this.current;
    }

    get sessionId(): string {
        return this.current?.sessionId ?? '';
    }

    attach(session: TableSession): void {
        this.detach();
        this.current = session;
        this.unsubscribes.push(session.onState((state) => (this.snapshot.value = toTableSnapshot(state))));
        // 房間解散、被踢出或重連失敗時清除
        this.unsubscribes.push(session.connection.subscribe((c) => c === 'closed' && this.current === session && this.detach(), false));
    }

    async leave(): Promise<void> {
        const session = this.current;
        this.detach();
        await session?.leave();
    }

    private detach(): void {
        for (const unsubscribe of this.unsubscribes) unsubscribe();
        this.unsubscribes = [];
        this.current = null;
        this.snapshot.value = null;
    }
}

export const tableStore = new TableStore();
