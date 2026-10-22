import { LobbyRoom, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { HEALTH_PATH, RoomName } from '@shared/constants';
import { PokerRoom } from './rooms/PokerRoom';

/** 建立 Colyseus 伺服器並註冊房間；index.ts 與整合測試共用 */
export function createServer(options: { gracefullyShutdown?: boolean } = {}): Server {
    const startedAt = Date.now();

    const server = new Server({
        transport: new WebSocketTransport(),
        greet: false,
        gracefullyShutdown: options.gracefullyShutdown ?? true,
        express: (app) => {
            app.get(HEALTH_PATH, (_req, res) => {
                res.json({ status: 'ok', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
            });
        },
    });

    // 房間列表：客戶端加入 lobby 後即時收到牌桌房間的新增、更新與移除
    server.define(RoomName.Lobby, LobbyRoom);
    server.define(RoomName.Poker, PokerRoom).enableRealtimeListing();

    return server;
}
