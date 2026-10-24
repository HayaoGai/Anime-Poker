import { ActionType } from '@shared/poker';
import { ClientMessage, NoticeCode, RoomPhase, ServerMessage } from '@shared/protocol';
import { STARTING_STACK } from '@shared/rules';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomInt } from '../../client/assets/scripts/core/random';
import { toTableSnapshot, type TableSnapshot } from '../../client/assets/scripts/models/TableSnapshot';
import { LocalTableSession } from '../../client/assets/scripts/net/LocalTableSession';

// 離線模式：客戶端在本機執行 shared/table 的 Table，只有自己與電腦

const me = { playerId: 'offline-test-0001', nickname: 'Lance', avatarId: 'avatar_02', asSpectator: false };

function start() {
    const session = LocalTableSession.create(me);
    if (typeof session === 'string') throw new Error(session);
    let snapshot: TableSnapshot | null = null;
    session.onState((state) => (snapshot = toTableSnapshot(state)));
    return { session, latest: () => snapshot! };
}

/** 讓非同步傳遞的意圖、訊息與狀態全部送達（假時鐘中巢狀的 0ms 計時器要前進 1ms 才會執行；電腦最快 1 秒才行動） */
const settle = () => vi.advanceTimersByTime(10);

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('randomInt', () => {
    it('落在範圍內且每個值都會出現', () => {
        const seen = new Set<number>();
        for (let i = 0; i < 600; i++) {
            const value = randomInt(6);
            expect(Number.isInteger(value) && value >= 0 && value < 6).toBe(true);
            seen.add(value);
        }
        expect(seen.size).toBe(6);
    });
});

describe('LocalTableSession', () => {
    it('開桌時自己是房主，並預先坐好 3 位電腦；不顯示自己加入的通知', () => {
        const { session, latest } = start();
        const notices: unknown[] = [];
        session.on(ServerMessage.Notice, (n) => notices.push(n));
        settle();

        const s = latest();
        expect(s.phase).toBe(RoomPhase.Lobby);
        expect(s.hostSessionId).toBe(session.sessionId);
        expect(s.seats[0]).toMatchObject({ occupied: true, sessionId: session.sessionId, nickname: 'Lance', isBot: false });
        expect(s.seats.filter((seat) => seat.isBot)).toHaveLength(3);
        expect(notices).toEqual([]);
    });

    it('加入參數不合法時回傳錯誤碼', () => {
        expect(LocalTableSession.create({ ...me, nickname: '' })).toBe('INVALID_OPTIONS');
    });

    it('房間大廳的操作非同步套用：送出後狀態才更新', () => {
        const { session, latest } = start();
        settle();
        session.send(ClientMessage.RemoveBot, { seat: 1 });
        expect(latest().seats[1].isBot).toBe(true);
        settle();
        expect(latest().seats[1].occupied).toBe(false);
    });

    it('開始遊戲後與電腦打完數手牌：先收到事件再收到狀態，底牌與行動提示只給自己', async () => {
        const { session, latest } = start();
        const log: string[] = [];
        let holeCards = 0;
        session.on(ServerMessage.HandEvent, (event) => log.push(`event:${event.type}:${event.handNumber}`));
        session.on(ServerMessage.HoleCards, ({ cards }) => {
            expect(cards).toHaveLength(2);
            holeCards++;
        });
        // 能過牌就過牌，否則棄牌：最多只輸盲注，數手內不會被淘汰（被淘汰時牌桌會解散）
        session.on(ServerMessage.YourTurn, ({ legal }) => {
            session.send(ClientMessage.Action, legal.canCheck ? { type: ActionType.Check } : { type: ActionType.Fold });
        });
        session.onState((state) => log.push(`state:${toTableSnapshot(state).handNumber}`));
        settle();
        session.send(ClientMessage.StartGame, {});

        for (let i = 0; i < 600 && latest().handNumber < 4 && session.connection.value !== 'closed'; i++) {
            await vi.advanceTimersByTimeAsync(500);
        }

        expect(session.connection.value).toBe('connected');
        expect(latest().phase).toBe(RoomPhase.Playing);
        expect(latest().handNumber).toBeGreaterThanOrEqual(4);
        expect(holeCards).toBeGreaterThanOrEqual(3);
        // 第一手的 handStarted 事件送達時，狀態還沒有更新到第 1 手（與 Colyseus 的訊息、patch 順序相同）
        expect(log.indexOf('event:handStarted:1')).toBeLessThan(log.indexOf('state:1'));
        // 籌碼守恆
        const total = latest().seats.reduce((sum, seat) => sum + seat.stack + seat.bet, 0) + latest().pots.reduce((a, b) => a + b, 0);
        expect(total).toBe(STARTING_STACK * 4);
    });

    it('暫停時牌桌時鐘與計時器停住，繼續後從停住的地方接著走', async () => {
        const { session, latest } = start();
        let yourTurn = 0;
        session.on(ServerMessage.YourTurn, () => yourTurn++);
        settle();
        session.send(ClientMessage.StartGame, {});
        // 等到輪到自己（不行動，讓倒數持續）
        for (let i = 0; i < 600 && !yourTurn; i++) await vi.advanceTimersByTimeAsync(100);
        expect(yourTurn).toBe(1);
        const turnSeat = latest().turnSeat;
        const remaining = session.timeSync.remaining(latest().turnDeadline);
        expect(remaining).toBeGreaterThan(0);

        session.setPaused(true);
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(session.timeSync.remaining(latest().turnDeadline)).toBe(remaining);
        expect(latest().turnSeat).toBe(turnSeat);

        session.setPaused(false);
        await vi.advanceTimersByTimeAsync(remaining - 100);
        expect(latest().turnSeat).toBe(turnSeat);
        // 倒數結束：超時自動行動，輪到下一位
        await vi.advanceTimersByTimeAsync(200);
        expect(latest().turnSeat).not.toBe(turnSeat);
    });

    it('離開後關閉連線，停止所有計時器與訊息', async () => {
        const { session } = start();
        settle();
        session.send(ClientMessage.StartGame, {});
        vi.advanceTimersByTime(3000);

        const events: unknown[] = [];
        session.on(ServerMessage.HandEvent, (e) => events.push(e));
        // 訂閱前已產生的事件會補送，離開前先清掉
        events.length = 0;
        await session.leave();
        expect(session.connection.value).toBe('closed');
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(60_000);
        expect(events).toEqual([]);
    });

    it('改為觀戰使牌桌沒有真人參賽者：先送達解散通知，再關閉連線', () => {
        const { session } = start();
        const notices: string[] = [];
        session.on(ServerMessage.Notice, ({ code }) => notices.push(code));
        settle();
        session.send(ClientMessage.StandUp, {});
        settle();
        expect(notices).toEqual([NoticeCode.RoomDissolved]);
        expect(session.connection.value).toBe('closed');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('比賽中改為觀戰：這手打完後先送達比賽結束，再關閉連線，不送解散通知', async () => {
        const { session } = start();
        const received: string[] = [];
        session.on(ServerMessage.Notice, ({ code }) => received.push(code));
        session.on(ServerMessage.GameOver, () => received.push('gameOver'));
        settle();
        session.send(ClientMessage.StartGame, {});
        vi.advanceTimersByTime(3000);
        session.send(ClientMessage.StandUp, {});

        for (let i = 0; i < 600 && session.connection.value !== 'closed'; i++) await vi.advanceTimersByTimeAsync(500);
        expect(session.connection.value).toBe('closed');
        expect(received).toContain('gameOver');
        expect(received).not.toContain(NoticeCode.RoomDissolved);
        expect(vi.getTimerCount()).toBe(0);
    });
});
