import type { Server } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { RoomName } from '@shared/constants';
import { ClientMessage, NoticeCode, RoomPhase, ServerMessage, type RoomMetadata } from '@shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/app';
import { DEFAULT_PACING, type Pacing } from '../src/rooms/Table';
import { pokerRoomOverrides } from '../src/rooms/PokerRoom';

const PORT = 25_000 + Math.floor(performance.now() % 1000);

let server: Server;

beforeAll(async () => {
    // 縮短節奏與計時，讓整合測試在幾秒內跑完
    const fast = Object.fromEntries(Object.keys(DEFAULT_PACING).map((k) => [k, 10])) as Pacing;
    Object.assign(pokerRoomOverrides, { pacing: fast, botThinkMs: [10, 20], actionTimeoutMs: 3000, reconnectGraceMs: 1000 });
    server = createServer({ gracefullyShutdown: false });
    await server.listen(PORT);
});

afterAll(async () => {
    await server.gracefullyShutdown(false);
});

/** 收集房間收到的所有訊息 */
function record(room: Room) {
    const messages: { type: string; payload: any }[] = [];
    room.onMessage('*', (type, payload) => messages.push({ type: String(type), payload }));
    return messages;
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error('等待逾時');
        await new Promise((r) => setTimeout(r, 20));
    }
}

let seq = 0;
const options = (nickname: string, extra: Record<string, unknown> = {}) => ({
    playerId: `integration-${++seq}-${Date.now()}`,
    nickname,
    avatarId: 'avatar_02',
    ...extra,
});

describe('Colyseus 整合', () => {
    it('房間列表即時更新；底牌只送給本人，觀戰者收不到', async () => {
        const url = `ws://localhost:${PORT}`;
        const lobby = await new Client(url).joinOrCreate(RoomName.Lobby);
        const listed = new Map<string, RoomMetadata>();
        lobby.onMessage('rooms', (rooms: any[]) => rooms.forEach((r) => listed.set(r.roomId, r.metadata)));
        lobby.onMessage('+', ([roomId, room]: [string, any]) => listed.set(roomId, room.metadata));

        const alice = await new Client(url).create(RoomName.Poker, options('Alice'));
        await waitFor(() => listed.get(alice.roomId)?.hostNickname === 'Alice');

        const bob = await new Client(url).joinById(alice.roomId, options('Bob'));
        const viewer = await new Client(url).joinById(alice.roomId, options('Viewer', { asSpectator: true }));
        const [aliceMsgs, bobMsgs, viewerMsgs] = [record(alice), record(bob), record(viewer)];

        await waitFor(() => listed.get(alice.roomId)?.players === 2 && listed.get(alice.roomId)?.spectators === 1);

        alice.send(ClientMessage.StartGame, {});
        await waitFor(() => aliceMsgs.some((m) => m.type === ServerMessage.HoleCards) && bobMsgs.some((m) => m.type === ServerMessage.HoleCards));
        await waitFor(() => listed.get(alice.roomId)?.phase === RoomPhase.Playing);
        await waitFor(() => (viewer.state as any).turnSeat !== -1);

        const aliceCards = aliceMsgs.find((m) => m.type === ServerMessage.HoleCards)!.payload.cards as string[];
        const bobCards = bobMsgs.find((m) => m.type === ServerMessage.HoleCards)!.payload.cards as string[];
        expect(aliceCards).toHaveLength(2);
        expect(new Set([...aliceCards, ...bobCards]).size).toBe(4);

        // 觀戰者：沒有底牌訊息，收到的廣播與同步狀態裡也找不到任何人的底牌
        expect(viewerMsgs.some((m) => m.type === ServerMessage.HoleCards)).toBe(false);
        const viewerSees = JSON.stringify([viewerMsgs, (viewer.state as any).toJSON()]);
        for (const card of [...aliceCards, ...bobCards]) expect(viewerSees).not.toContain(`"${card}"`);
        // Bob 也看不到 Alice 的牌
        const bobSees = JSON.stringify([bobMsgs, (bob.state as any).toJSON()]);
        for (const card of aliceCards) expect(bobSees).not.toContain(`"${card}"`);

        // 唯一的另一位真人離開後只剩 Alice；Alice 也離開時房間解散，觀戰者收到通知
        await bob.leave();
        await alice.leave();
        await waitFor(() => viewerMsgs.some((m) => m.type === ServerMessage.Notice && m.payload.code === NoticeCode.RoomDissolved));
        await lobby.leave();
    });

    it('非自願斷線後可在寬限期內重連，並補送底牌', async () => {
        const url = `ws://localhost:${PORT}`;
        const alice = await new Client(url).create(RoomName.Poker, options('Alice'));
        const bobClient = new Client(url);
        const bob = await bobClient.joinById(alice.roomId, options('Bob'));
        bob.reconnection.enabled = false; // 由測試手動重連
        const aliceMsgs = record(alice);

        alice.send(ClientMessage.StartGame, {});
        await waitFor(() => (alice.state as any).turnSeat !== -1);

        const token = bob.reconnectionToken;
        await bob.leave(false); // 非自願斷線
        await waitFor(() => (alice.state as any).seats[1].connected === false);

        const back = await bobClient.reconnect(token);
        const backMsgs = record(back);
        await waitFor(() => (alice.state as any).seats[1].connected === true);
        await waitFor(() => backMsgs.some((m) => m.type === ServerMessage.HoleCards));
        expect(aliceMsgs.some((m) => m.type === ServerMessage.Notice && m.payload.code === NoticeCode.PlayerLeft)).toBe(false);

        await back.leave();
        await alice.leave();
    });

    it('寬限期過後視為離開', async () => {
        const url = `ws://localhost:${PORT}`;
        const alice = await new Client(url).create(RoomName.Poker, options('Alice'));
        const bob = await new Client(url).joinById(alice.roomId, options('Bob'));
        bob.reconnection.enabled = false;
        const aliceMsgs = record(alice);

        await bob.leave(false);
        await waitFor(() => aliceMsgs.some((m) => m.type === ServerMessage.Notice && m.payload.code === NoticeCode.PlayerLeft), 4000);
        // 訊息立即送出，狀態則在下一次 patch 才同步
        await waitFor(() => (alice.state as any).seats[1].occupied === false);
        await alice.leave();
    });

    it('格式錯誤的加入參數會被拒絕', async () => {
        const client = new Client(`ws://localhost:${PORT}`);
        await expect(client.create(RoomName.Poker, options(''))).rejects.toThrow(/INVALID_OPTIONS/);
    });

    it('客戶端送出的非法動作只會收到錯誤，不影響牌局', async () => {
        const url = `ws://localhost:${PORT}`;
        const alice = await new Client(url).create(RoomName.Poker, options('Alice'));
        const messages = record(alice);
        alice.send(ClientMessage.AddBot, {});
        alice.send(ClientMessage.StartGame, {});
        alice.send(ClientMessage.Action, { type: 'raise', amount: 999_999 });
        alice.send(ClientMessage.Action, { type: 'teleport' });

        await waitFor(() => messages.filter((m) => m.type === ServerMessage.Error).length >= 2);
        const codes = messages.filter((m) => m.type === ServerMessage.Error).map((m) => m.payload.code);
        expect(codes).toContain('INVALID_MESSAGE');
        await alice.leave();
    });
});
