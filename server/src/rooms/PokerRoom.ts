import { Room, ServerError, type Client } from '@colyseus/core';
import { ErrorCode } from '@shared/errors';
import { ClientMessage, RoomPhase, type RoomMetadata } from '@shared/protocol';
import { MAX_SEATS, RECONNECT_GRACE_MS } from '@shared/rules';
import { Table, type TableOptions } from '@shared/table/Table';
import { cryptoRng } from '../rng';
import { createPokerState, type PokerState } from './schema';

/** 測試可覆寫 Table 的時間設定（不經由客戶端，客戶端無法影響） */
export const pokerRoomOverrides: Partial<Pick<TableOptions, 'pacing' | 'botThinkMs' | 'actionTimeoutMs' | 'createDeck' | 'rng'>> & {
    reconnectGraceMs?: number;
} = {};

/**
 * Colyseus 轉接層：把連線生命週期與訊息交給 Table，自己不含任何牌局規則。
 */
export class PokerRoom extends Room<{ state: PokerState; metadata: RoomMetadata }> {
    private table!: Table<PokerState>;

    onCreate(): void {
        const { reconnectGraceMs: _, ...overrides } = pokerRoomOverrides;
        this.table = new Table({
            state: createPokerState(),
            rng: cryptoRng,
            ...overrides,
            output: {
                broadcast: (type, payload) => this.broadcast(type, payload),
                send: (sessionId, type, payload) => this.clients.getById(sessionId)?.send(type, payload),
                updateListing: (metadata) => void this.setMatchmaking({ metadata }),
                dissolve: () => void this.disconnect(),
            },
            scheduler: {
                now: () => Date.now(),
                setTimeout: (callback, ms) => this.clock.setTimeout(callback, ms),
            },
        });
        this.state = this.table.state;
        this.metadata = { hostNickname: '', phase: RoomPhase.Lobby, players: 0, maxPlayers: MAX_SEATS, spectators: 0 };

        for (const type of Object.values(ClientMessage)) {
            this.onMessage(type, (client, payload) => this.table.handleMessage(client.sessionId, type, payload));
        }
    }

    onJoin(client: Client, options: unknown): void {
        const result = this.table.join(client.sessionId, options);
        if (!result.ok) throw new ServerError(4000, result.error satisfies ErrorCode);
    }

    async onDrop(client: Client): Promise<void> {
        this.table.disconnect(client.sessionId);
        const grace = pokerRoomOverrides.reconnectGraceMs ?? RECONNECT_GRACE_MS;
        // 寬限期內重連會觸發 onReconnect；逾時則由 Colyseus 呼叫 onLeave
        await this.allowReconnection(client, grace / 1000);
    }

    onReconnect(client: Client): void {
        this.table.reconnect(client.sessionId);
    }

    onLeave(client: Client): void {
        this.table.leave(client.sessionId);
    }

    onDispose(): void {
        this.table.dispose();
    }
}
