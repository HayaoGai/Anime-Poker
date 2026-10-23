import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { computed, Observable } from '../../client/assets/scripts/core/Observable';
import { encodePng } from '../../client/assets/scripts/core/PngEncoder';
import { DisposeBag } from '../../client/assets/scripts/core/ViewModel';
import { resolveLanguage } from '../../client/assets/scripts/i18n/language';
import { hostNickname, mySeatIndex, toTableSnapshot } from '../../client/assets/scripts/models/TableSnapshot';
import { RoomSession } from '../../client/assets/scripts/net/RoomSession';
import { TimeSync } from '../../client/assets/scripts/net/TimeSync';
import { NoticeCode, ServerMessage } from '@shared/protocol';

// 客戶端中不依賴 Cocos 引擎的純邏輯模組

describe('Observable', () => {
    it('訂閱時立即收到目前值，值改變時通知新舊值', () => {
        const value = new Observable(1);
        const listener = vi.fn();
        value.subscribe(listener);
        value.value = 2;
        expect(listener.mock.calls).toEqual([[1, 1], [2, 1]]);
    });

    it('相同的值不重複通知；取消訂閱後不再收到', () => {
        const value = new Observable('a');
        const listener = vi.fn();
        const unsubscribe = value.subscribe(listener, false);
        value.value = 'a';
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
        value.value = 'b';
        expect(listener).not.toHaveBeenCalled();
    });

    it('notify 可在物件內容改變時手動通知', () => {
        const list = new Observable<number[]>([]);
        const listener = vi.fn();
        list.subscribe(listener, false);
        list.value.push(1);
        list.notify();
        expect(listener).toHaveBeenCalledWith([1], [1]);
    });

    it('回呼中取消訂閱不影響同一輪的其他訂閱者', () => {
        const value = new Observable(0);
        const second = vi.fn();
        const unsubscribe = value.subscribe(() => unsubscribe(), false);
        value.subscribe(second, false);
        value.value = 1;
        expect(second).toHaveBeenCalledOnce();
    });
});

describe('computed', () => {
    it('任一來源改變時重新計算，dispose 後停止', () => {
        const a = new Observable(1);
        const b = new Observable(2);
        const sum = computed([a, b], () => a.value + b.value);
        expect(sum.value).toBe(3);
        a.value = 10;
        expect(sum.value).toBe(12);
        sum.dispose();
        b.value = 100;
        expect(sum.value).toBe(12);
    });
});

describe('DisposeBag', () => {
    it('依建立的相反順序釋放', () => {
        const order: number[] = [];
        const bag = new DisposeBag();
        bag.add(() => order.push(1));
        bag.add({ dispose: () => order.push(2) });
        bag.dispose();
        bag.dispose();
        expect(order).toEqual([2, 1]);
    });
});

describe('resolveLanguage', () => {
    it.each([
        [['zh-TW'], 'zh-Hant'],
        [['zh-hk'], 'zh-Hant'],
        [['zh_MO'], 'zh-Hant'],
        [['zh-Hant-TW'], 'zh-Hant'],
        [['zh-CN'], 'zh-Hans'],
        [['zh-Hans'], 'zh-Hans'],
        [['zh'], 'zh-Hans'],
        [['ja-JP', 'zh-TW'], 'en'],
        [[undefined, '', 'zh-tw'], 'zh-Hant'],
        [['en-US'], 'en'],
        [[], 'en'],
    ] as const)('%j → %s', (codes, expected) => {
        expect(resolveLanguage(codes)).toBe(expected);
    });
});

describe('TimeSync', () => {
    it('以往返延遲最短的樣本估算伺服器時間差', () => {
        const sync = new TimeSync();
        expect(sync.serverNow(1000)).toBe(1000);

        // 伺服器比本機快 5000ms：延遲 200ms 的樣本誤差較大，延遲 20ms 的較準
        sync.addSample(0, 5150, 200);
        sync.addSample(1000, 6010, 1020);
        expect(sync.offset).toBe(5000);
        expect(sync.serverNow(2000)).toBe(7000);
        expect(sync.remaining(7500, 2000)).toBe(500);
        expect(sync.remaining(6000, 2000)).toBe(0);
    });

    it('只保留最近的樣本', () => {
        const sync = new TimeSync(2);
        sync.addSample(0, 100, 0); // rtt 0、offset 100：最準，但會被擠出
        sync.addSample(0, 200, 10); // rtt 10、offset 195
        sync.addSample(0, 300, 10); // rtt 10、offset 295
        // 延遲 0 的樣本已移除（否則結果會是 100）；剩下的延遲相同時取較早者
        expect(sync.offset).toBe(195);
    });
});

describe('TableSnapshot', () => {
    // 模擬 Colyseus 解碼後的狀態：集合有 toArray()
    const schemaArray = <T>(items: T[]) => ({ toArray: () => items, length: items.length });
    const seat = (overrides: Record<string, unknown> = {}) => ({
        occupied: false, sessionId: '', isBot: false, nickname: '', avatarId: '', stack: 0, bet: 0,
        inHand: false, folded: false, allIn: false, connected: true, shownCards: schemaArray([]), ...overrides,
    });
    const state = {
        phase: 'lobby', hostSessionId: 'h1', spectatorCount: 1, handNumber: 0, buttonSeat: -1, smallBlindSeat: -1, bigBlindSeat: -1,
        street: '', board: schemaArray(['As']), pots: schemaArray([10]), currentBet: 0, turnSeat: -1, turnDeadline: 0,
        seats: schemaArray([seat(), seat({ occupied: true, sessionId: 'h1', nickname: 'Host', shownCards: schemaArray(['Kd', 'Kh']) }), seat({ occupied: true, sessionId: 'me', nickname: 'Me' })]),
    };

    it('轉成純資料並保留座位索引', () => {
        const snapshot = toTableSnapshot(state);
        expect(snapshot.seats.map((s) => s.index)).toEqual([0, 1, 2]);
        expect(snapshot.seats[1].shownCards).toEqual(['Kd', 'Kh']);
        expect(snapshot.board).toEqual(['As']);
        expect(snapshot.pots).toEqual([10]);
    });

    it('找出自己的座位與房主暱稱', () => {
        const snapshot = toTableSnapshot(state);
        expect(mySeatIndex(snapshot, 'me')).toBe(2);
        expect(mySeatIndex(snapshot, 'spectator')).toBe(-1);
        expect(mySeatIndex(null, 'me')).toBe(-1);
        expect(hostNickname(snapshot)).toBe('Host');
    });
});

describe('encodePng', () => {
    /** 依序讀出 chunk，並檢查每個 chunk 的 CRC */
    function readChunks(png: Uint8Array): Map<string, Buffer> {
        const buf = Buffer.from(png);
        expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const chunks = new Map<string, Buffer>();
        for (let pos = 8; pos < buf.length; ) {
            const length = buf.readUInt32BE(pos);
            const type = buf.toString('latin1', pos + 4, pos + 8);
            const data = buf.subarray(pos + 8, pos + 8 + length);
            expect(buf.readUInt32BE(pos + 8 + length)).toBe(crc32(buf.subarray(pos + 4, pos + 8 + length)));
            chunks.set(type, data);
            pos += 12 + length;
        }
        return chunks;
    }

    it('產生合法的 RGB PNG，zlib 可正確解壓出原始像素', () => {
        // 2×2：紅 綠 / 藍 白（alpha 會被捨棄）
        const rgba = [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 255, 0];
        const chunks = readChunks(encodePng(rgba, 2, 2));
        const header = chunks.get('IHDR')!;
        expect([header.readUInt32BE(0), header.readUInt32BE(4), header[8], header[9]]).toEqual([2, 2, 8, 2]);
        expect(chunks.has('IEND')).toBe(true);
        expect([...inflateSync(chunks.get('IDAT')!)]).toEqual([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
    });

    it('flipY 反轉列順序；超過 64 KB 的資料分成多個 stored block', () => {
        const width = 200;
        const height = 120;
        const rgba = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) rgba.fill(y, y * width * 4, (y + 1) * width * 4);
        const raw = inflateSync(readChunks(encodePng(rgba, width, height, { flipY: true })).get('IDAT')!);
        const rowBytes = width * 3 + 1;
        expect(raw.length).toBe(rowBytes * height);
        expect(raw.length).toBeGreaterThan(0xffff);
        expect(raw[1]).toBe(height - 1);
        expect(raw[(height - 1) * rowBytes + 1]).toBe(0);
    });
});

describe('RoomSession', () => {
    /** 模擬 SDK 的 Room：可手動觸發訊息與斷線；leave() 預設永遠不回應（模擬代理吞掉伺服器的關閉） */
    function fakeRoom() {
        const signal = () => {
            const callbacks: ((...args: any[]) => void)[] = [];
            return Object.assign((cb: (...args: any[]) => void) => void callbacks.push(cb), {
                fire: (...args: any[]) => callbacks.forEach((cb) => cb(...args)),
                remove: () => undefined,
            });
        };
        let onAny: (type: string, payload: unknown) => void = () => undefined;
        const room = {
            sessionId: 'me',
            state: undefined,
            reconnection: { enabled: true },
            onDrop: signal(),
            onReconnect: signal(),
            onLeave: signal(),
            onStateChange: signal(),
            onMessage: (_type: string, cb: typeof onAny) => void (onAny = cb),
            send: vi.fn(),
            leave: vi.fn((_consented?: boolean) => new Promise<number>(() => undefined)),
            receive: (type: string, payload: unknown) => onAny(type, payload),
        };
        return room;
    }

    it('收到房間解散通知：先送達通知，再結束連線並關閉自動重連', () => {
        const room = fakeRoom();
        const session = new RoomSession(room as never);
        const notices: unknown[] = [];
        session.on(ServerMessage.Notice, (p) => notices.push(p.code));
        room.receive(ServerMessage.Notice, { code: NoticeCode.RoomDissolved });
        expect(notices).toEqual([NoticeCode.RoomDissolved]);
        expect(session.connection.value).toBe('closed');
        expect(room.reconnection.enabled).toBe(false);
        expect(room.leave).toHaveBeenCalledWith(true);
    });

    it('訂閱者拋出例外時，其他訂閱者照常收到，收到解散通知後仍立即離開', () => {
        const room = fakeRoom();
        const session = new RoomSession(room as never);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const notices: unknown[] = [];
        session.on(ServerMessage.Notice, () => {
            throw new Error('UI 出錯');
        });
        session.on(ServerMessage.Notice, (p) => notices.push(p.code));
        room.receive(ServerMessage.Notice, { code: NoticeCode.RoomDissolved });
        expect(notices).toEqual([NoticeCode.RoomDissolved]);
        expect(session.connection.value).toBe('closed');
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('伺服器沒有關閉連線時，leave() 逾時後由客戶端關閉', async () => {
        vi.useFakeTimers();
        try {
            const room = fakeRoom();
            const session = new RoomSession(room as never);
            const done = vi.fn();
            void session.leave().then(done);
            await vi.advanceTimersByTimeAsync(1000);
            expect(done).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(600);
            expect(done).toHaveBeenCalled();
            expect(room.leave).toHaveBeenLastCalledWith(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('離開後才收到的斷線與重連事件不改變狀態', () => {
        const room = fakeRoom();
        const session = new RoomSession(room as never);
        void session.leave();
        room.onDrop.fire(1006);
        room.onReconnect.fire();
        expect(session.connection.value).toBe('closed');
    });
});
