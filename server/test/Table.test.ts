import type { Card } from '@shared/cards';
import { ErrorCode } from '@shared/errors';
import { ActionType } from '@shared/poker';
import { ClientMessage, NoticeCode, RoomPhase, ServerMessage } from '@shared/protocol';
import { STARTING_STACK } from '@shared/rules';
import { describe, expect, it } from 'vitest';
import type { Table } from '@shared/table/Table';
import { riggedDeck, seededRng } from './helpers';
import { createTable, player, type ManualScheduler } from './tableHarness';

/** 推進時鐘直到條件成立 */
function until(scheduler: ManualScheduler, condition: () => boolean, maxMs = 60_000): void {
    for (let elapsed = 0; elapsed <= maxMs; elapsed += 100) {
        if (condition()) return;
        scheduler.advance(100);
    }
    throw new Error('條件未在時限內成立');
}

const act = (table: Table, sessionId: string, type: string, extra: Record<string, unknown> = {}) =>
    table.handleMessage(sessionId, ClientMessage.Action, { type, ...extra });

/** 兩位真人對決，按鈕固定在 0 號座位，牌序可指定 */
function headsUp(holes?: Record<number, [Card, Card]>, board?: Card[]) {
    const ctx = createTable({
        rng: () => 0,
        createDeck: () => riggedDeck({ button: 0, seats: [0, 1], holes, board }),
    });
    ctx.table.join('alice', player('Alice'));
    ctx.table.join('bob', player('Bob'));
    return ctx;
}

describe('加入房間', () => {
    it('驗證暱稱、玩家 ID 與頭像', () => {
        const { table } = createTable();
        expect(table.join('s1', player(''))).toEqual({ ok: false, error: ErrorCode.InvalidOptions });
        expect(table.join('s1', player('超過十二個字的暱稱一二三四五'))).toEqual({ ok: false, error: ErrorCode.InvalidOptions });
        expect(table.join('s1', player('Alice', { playerId: 'x' }))).toEqual({ ok: false, error: ErrorCode.InvalidOptions });
        expect(table.join('s1', player('Alice', { avatarId: '../hack' }))).toEqual({ ok: false, error: ErrorCode.InvalidOptions });
        expect(table.join('s1', null)).toEqual({ ok: false, error: ErrorCode.InvalidOptions });
        expect(table.join('s1', player('  Alice  '))).toEqual({ ok: true });
        expect(table.state.seats[0].nickname).toBe('Alice');
    });

    it('建立者成為房主並坐下，即使要求觀戰', () => {
        const { table, output } = createTable();
        table.join('host', player('Host', { asSpectator: true }));
        expect(table.state.hostSessionId).toBe('host');
        expect(table.state.seats[0]).toMatchObject({ occupied: true, sessionId: 'host', stack: STARTING_STACK });
        expect(output.listing).toMatchObject({ hostNickname: 'Host', phase: RoomPhase.Lobby, players: 1, spectators: 0 });
    });

    it('觀戰者不佔座位', () => {
        const { table, output } = createTable();
        table.join('host', player('Host'));
        table.join('viewer', player('Viewer', { asSpectator: true }));
        expect(table.state.seats.filter((s) => s.occupied)).toHaveLength(1);
        expect(output.listing).toMatchObject({ players: 1, spectators: 1 });
    });

    it('同一位玩家已在房間中時拒絕重複加入', () => {
        const { table } = createTable();
        const alice = player('Alice');
        table.join('s1', alice);
        expect(table.join('s2', alice)).toEqual({ ok: false, error: ErrorCode.AlreadyInRoom });
    });

    it('牌桌已滿時改以觀戰加入', () => {
        const { table, output } = createTable();
        table.join('host', player('Host'));
        for (let i = 0; i < 5; i++) table.handleMessage('host', ClientMessage.AddBot, {});
        table.join('late', player('Late'));
        expect(output.sentTo('late', ServerMessage.Notice).map((m) => m.payload.code)).toContain(NoticeCode.SeatedAsSpectator);
        expect(output.listing).toMatchObject({ players: 6, spectators: 1 });
    });
});

describe('房間大廳', () => {
    it('只有房主能在大廳增減電腦', () => {
        const { table, output } = createTable({ rng: seededRng(1) });
        table.join('host', player('Host'));
        table.join('guest', player('Guest'));

        table.handleMessage('guest', ClientMessage.AddBot, {});
        expect(output.last('guest', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.NotHost });

        table.handleMessage('host', ClientMessage.AddBot, { seat: 4 });
        expect(table.state.seats[4]).toMatchObject({ occupied: true, isBot: true, stack: STARTING_STACK });
        expect(table.state.seats[4].avatarId).toMatch(/^avatar_0[1-6]$/);

        table.handleMessage('host', ClientMessage.AddBot, { seat: 4 });
        expect(output.last('host', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.SeatTaken });

        table.handleMessage('host', ClientMessage.RemoveBot, { seat: 4 });
        expect(table.state.seats[4].occupied).toBe(false);

        table.handleMessage('host', ClientMessage.RemoveBot, { seat: 1 }); // 真人不能被移除
        expect(output.last('host', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.InvalidMessage });
    });

    it('至少兩位參賽者才能開始', () => {
        const { table, output } = createTable();
        table.join('host', player('Host'));
        table.handleMessage('host', ClientMessage.StartGame, {});
        expect(output.last('host', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.NotEnoughPlayers });
        expect(table.state.phase).toBe(RoomPhase.Lobby);
    });

    it('觀戰者可坐下、參賽者可改為觀戰', () => {
        const { table, output } = createTable();
        table.join('host', player('Host'));
        table.join('viewer', player('Viewer', { asSpectator: true }));

        table.handleMessage('viewer', ClientMessage.Sit, { seat: 3 });
        expect(table.state.seats[3].sessionId).toBe('viewer');
        expect(output.listing).toMatchObject({ players: 2, spectators: 0 });

        table.handleMessage('viewer', ClientMessage.Sit, {});
        expect(output.last('viewer', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.NotSpectator });

        table.handleMessage('viewer', ClientMessage.StandUp, {});
        expect(table.state.seats[3].occupied).toBe(false);
        expect(output.listing).toMatchObject({ players: 1, spectators: 1 });
    });

    it('回應時間校正', () => {
        const { table, output, scheduler } = createTable();
        table.join('host', player('Host'));
        table.handleMessage('host', ClientMessage.TimeSync, { clientTime: 123 });
        expect(output.last('host', ServerMessage.TimeSync)?.payload).toEqual({ clientTime: 123, serverTime: scheduler.now() });
    });

    it('未知或格式錯誤的訊息回傳錯誤', () => {
        const { table, output } = createTable();
        table.join('host', player('Host'));
        table.handleMessage('host', 'hack', {});
        table.handleMessage('host', ClientMessage.Action, { type: 'raise', amount: 'lots' });
        expect(output.sentTo('host', ServerMessage.Error).map((m) => m.payload.code)).toEqual([ErrorCode.InvalidMessage, ErrorCode.InvalidMessage]);
    });
});

describe('底牌保密', () => {
    it('底牌只私訊給本人；觀戰者與廣播在攤牌前都看不到', () => {
        const { table, output, scheduler } = createTable({ rng: seededRng(7) });
        table.join('alice', player('Alice'));
        table.join('bob', player('Bob'));
        table.join('viewer', player('Viewer', { asSpectator: true }));
        table.handleMessage('alice', ClientMessage.StartGame, {});
        until(scheduler, () => table.state.turnSeat !== -1);

        const aliceCards: string[] = output.sentTo('alice', ServerMessage.HoleCards)[0].payload.cards;
        const bobCards: string[] = output.sentTo('bob', ServerMessage.HoleCards)[0].payload.cards;
        expect(aliceCards).toHaveLength(2);
        expect(bobCards).toHaveLength(2);
        expect(output.sentTo('viewer', ServerMessage.HoleCards)).toEqual([]);

        // 廣播內容與同步狀態都不得包含任何底牌
        const everythingPublic = JSON.stringify([output.messages.filter((m) => m.to === '*'), table.state.toJSON()]);
        for (const card of [...aliceCards, ...bobCards]) expect(everythingPublic).not.toContain(`"${card}"`);
    });
});

describe('行動與計時', () => {
    it('輪到自己才能行動，並收到合法動作', () => {
        const { table, output, scheduler } = headsUp();
        table.handleMessage('alice', ClientMessage.StartGame, {});
        act(table, 'alice', ActionType.Call); // 發牌動畫播放中
        expect(output.last('alice', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.NotYourTurn });

        until(scheduler, () => table.state.turnSeat === 0);
        expect(output.last('alice', ServerMessage.YourTurn)?.payload).toMatchObject({
            legal: { canCheck: false, callAmount: 1, canRaise: true },
            deadline: table.state.turnDeadline,
        });

        act(table, 'bob', ActionType.Call);
        expect(output.last('bob', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.NotYourTurn });
        act(table, 'alice', ActionType.Raise, { amount: 3 });
        expect(output.last('alice', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.InvalidAmount });

        act(table, 'alice', ActionType.Call);
        expect(table.state.turnSeat).toBe(-1);
        expect(table.state.seats[0]).toMatchObject({ bet: 2, stack: STARTING_STACK - 2 });
        until(scheduler, () => table.state.turnSeat === 1);
    });

    it('逾時自動過牌或棄牌，並標記 timedOut', () => {
        const { table, output, scheduler } = headsUp();
        table.handleMessage('alice', ClientMessage.StartGame, {});
        until(scheduler, () => table.state.turnSeat === 0);

        scheduler.advance(10_000);
        const acted = output.broadcasts(ServerMessage.HandEvent).find((m) => m.payload.type === 'playerActed');
        expect(acted?.payload).toMatchObject({ seat: 0, kind: 'fold', timedOut: true });
    });

    it('電腦會自動行動', () => {
        const { table, output, scheduler } = createTable({ rng: seededRng(3) });
        table.join('host', player('Host'));
        table.handleMessage('host', ClientMessage.AddBot, { seat: 1 });
        table.handleMessage('host', ClientMessage.StartGame, {});

        until(scheduler, () => output.broadcasts(ServerMessage.HandEvent).some((m) => m.payload.type === 'playerActed' && m.payload.seat === 1));
    });
});

describe('離桌與房主', () => {
    it('牌局中離桌視為棄牌，房主轉移給下一位真人，座位在這手結束後清空', () => {
        const { table, output, scheduler } = createTable({ rng: () => 0 });
        table.join('alice', player('Alice'));
        table.join('bob', player('Bob'));
        table.join('carol', player('Carol'));
        table.handleMessage('alice', ClientMessage.StartGame, {});
        until(scheduler, () => table.state.turnSeat !== -1);

        table.leave('alice');
        expect(table.state.hostSessionId).toBe('bob');
        expect(output.broadcasts(ServerMessage.Notice).map((m) => m.payload)).toContainEqual({ code: NoticeCode.HostChanged, nickname: 'Bob' });
        expect(table.state.seats[0]).toMatchObject({ occupied: true, connected: false });

        until(scheduler, () => output.broadcasts(ServerMessage.HandEvent).some((m) => m.payload.type === 'playerActed' && m.payload.seat === 0));
        until(scheduler, () => !table.state.seats[0].occupied);
    });

    it('牌桌上沒有真人參賽者時解散，即使還有觀戰者與電腦', () => {
        const { table, output } = createTable();
        table.join('host', player('Host'));
        table.handleMessage('host', ClientMessage.AddBot, {});
        table.join('viewer', player('Viewer', { asSpectator: true }));

        table.handleMessage('host', ClientMessage.StandUp, {});
        expect(output.broadcasts(ServerMessage.Notice).map((m) => m.payload.code)).toContain(NoticeCode.RoomDissolved);
        expect(output.dissolved).toBe(true);
    });

    it('觀戰者不會成為房主', () => {
        const { table } = createTable();
        table.join('host', player('Host'));
        table.join('viewer', player('Viewer', { asSpectator: true }));
        table.join('guest', player('Guest'));
        table.leave('host');
        expect(table.state.hostSessionId).toBe('guest');
    });
});

describe('中途加入', () => {
    it('遊戲中坐下要等下一手', () => {
        const { table, output, scheduler } = headsUp();
        table.join('carol', player('Carol', { asSpectator: true }));
        table.handleMessage('alice', ClientMessage.StartGame, {});
        until(scheduler, () => table.state.turnSeat === 0);

        table.handleMessage('carol', ClientMessage.Sit, {});
        expect(output.sentTo('carol', ServerMessage.Notice).map((m) => m.payload.code)).toContain(NoticeCode.WaitingNextHand);
        expect(table.state.seats[2]).toMatchObject({ occupied: true, inHand: false, stack: STARTING_STACK });
        expect(output.sentTo('carol', ServerMessage.HoleCards)).toEqual([]);
        act(table, 'carol', ActionType.Fold);
        expect(output.last('carol', ServerMessage.Error)?.payload).toEqual({ code: ErrorCode.NotInHand });

        act(table, 'alice', ActionType.Fold);
        until(scheduler, () => table.state.handNumber === 2 && table.state.turnSeat !== -1);
        expect(table.state.seats[2].inHand).toBe(true);
        expect(output.sentTo('carol', ServerMessage.HoleCards)).toHaveLength(1);
    });
});

describe('斷線重連', () => {
    it('寬限期內倒數照常進行；重連後補送底牌與行動提示', () => {
        const { table, output, scheduler } = headsUp();
        table.handleMessage('alice', ClientMessage.StartGame, {});
        until(scheduler, () => table.state.turnSeat === 0);

        table.disconnect('alice');
        expect(table.state.seats[0].connected).toBe(false);
        const holeCount = output.sentTo('alice', ServerMessage.HoleCards).length;
        const turnCount = output.sentTo('alice', ServerMessage.YourTurn).length;

        table.reconnect('alice');
        expect(table.state.seats[0].connected).toBe(true);
        expect(output.sentTo('alice', ServerMessage.HoleCards)).toHaveLength(holeCount + 1);
        expect(output.sentTo('alice', ServerMessage.YourTurn)).toHaveLength(turnCount + 1);
    });

    it('以新的連線、相同玩家 ID 重新加入時接回原本座位', () => {
        const { table, output, scheduler } = createTable({ rng: () => 0 });
        const alice = player('Alice');
        table.join('alice-1', alice);
        table.join('bob', player('Bob'));
        table.handleMessage('alice-1', ClientMessage.StartGame, {});
        until(scheduler, () => table.state.turnSeat === 0);

        table.disconnect('alice-1');
        expect(table.join('alice-2', alice)).toEqual({ ok: true });
        expect(table.state.seats[0].sessionId).toBe('alice-2');
        expect(table.state.hostSessionId).toBe('alice-2');
        expect(output.sentTo('alice-2', ServerMessage.HoleCards)).toHaveLength(1);

        table.leave('alice-1'); // 舊連線的寬限期結束，不應影響新連線
        expect(table.state.seats[0].sessionId).toBe('alice-2');
    });
});

describe('淘汰與比賽結束', () => {
    const allInHand = () =>
        headsUp({ 0: ['As', 'Ad'], 1: ['7c', '2d'] }, ['Ks', '9h', '4c', '3d', 'Jh']);

    it('輸光的真人轉為觀戰；只剩一人時比賽結束並回到大廳', () => {
        const { table, output, scheduler } = allInHand();
        table.handleMessage('alice', ClientMessage.StartGame, {});
        until(scheduler, () => table.state.turnSeat === 0);
        act(table, 'alice', ActionType.AllIn);
        until(scheduler, () => table.state.turnSeat === 1);
        act(table, 'bob', ActionType.Call);

        until(scheduler, () => output.broadcasts(ServerMessage.GameOver).length > 0);
        expect(output.broadcasts(ServerMessage.GameOver)[0].payload).toEqual({ winnerSeat: 0, nickname: 'Alice' });
        expect(output.sentTo('bob', ServerMessage.Notice).map((m) => m.payload.code)).toContain(NoticeCode.Eliminated);
        expect(table.state.seats[1].occupied).toBe(false);
        expect(table.state.seats[0].stack).toBe(STARTING_STACK * 2);

        until(scheduler, () => table.state.phase === RoomPhase.Lobby);
        expect(output.listing).toMatchObject({ phase: RoomPhase.Lobby, players: 1, spectators: 1 });
    });

    it('唯一的真人輸光時房間解散', () => {
        // 小範圍（按鈕、頭像、思考時間）固定為 0，讓按鈕落在 0 號座位；電腦估算勝率的抽樣仍使用正常亂數
        const seeded = seededRng(5);
        const ctx = createTable({
            rng: (n) => (n <= 6 ? 0 : seeded(n)),
            createDeck: () => riggedDeck({ button: 0, seats: [0, 1], holes: { 0: ['7c', '2d'], 1: ['As', 'Ad'] }, board: ['Ks', '9h', '4c', '3d', 'Jh'] }),
        });
        ctx.table.join('alice', player('Alice'));
        ctx.table.handleMessage('alice', ClientMessage.AddBot, { seat: 1 });
        ctx.table.handleMessage('alice', ClientMessage.StartGame, {});
        until(ctx.scheduler, () => ctx.table.state.turnSeat === 0);
        act(ctx.table, 'alice', ActionType.AllIn);

        until(ctx.scheduler, () => ctx.output.dissolved);
    });
});

describe('完整模擬', () => {
    it('一位真人與五台電腦打到結束，過程中籌碼總數不變', () => {
        const { table, output, scheduler } = createTable({ rng: seededRng(2026) });
        table.join('human', player('Human'));
        for (let i = 0; i < 5; i++) table.handleMessage('human', ClientMessage.AddBot, {});
        table.handleMessage('human', ClientMessage.StartGame, {});

        const total = STARTING_STACK * 6;
        let handsChecked = 0;
        let lastTurnMessages = 0;

        for (let step = 0; step < 200_000 && handsChecked < 40 && !output.dissolved && table.state.phase === RoomPhase.Playing; step++) {
            scheduler.advance(200);

            // 真人：保守打法，能過牌就過牌、小額才跟注，其餘棄牌（避免太快輸光，讓模擬涵蓋更多手）
            const turns = output.sentTo('human', ServerMessage.YourTurn);
            if (turns.length > lastTurnMessages && table.state.turnSeat === 0) {
                lastTurnMessages = turns.length;
                const { legal } = turns.at(-1)!.payload;
                act(table, 'human', legal.canCheck ? ActionType.Check : legal.callAmount <= 4 ? ActionType.Call : ActionType.Fold);
            }

            const ended = output.broadcasts(ServerMessage.HandEvent).filter((m) => m.payload.type === 'handEnded').length;
            if (ended > handsChecked) {
                handsChecked = ended;
                // 籌碼只會在座位間移動；輸光者的座位籌碼本來就是 0
                expect(table.state.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(total);
            }
        }

        expect(handsChecked).toBe(40);
    });
});
