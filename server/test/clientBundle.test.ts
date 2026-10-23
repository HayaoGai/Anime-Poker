import type { Server } from '@colyseus/core';
import { RoomName } from '@shared/constants';
import { ClientMessage, ServerMessage } from '@shared/protocol';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MiniHeaders, MiniURL, installWebPolyfills } from '../../client/assets/scripts/net/webPolyfills';
import { createServer } from '../src/app';

/**
 * 以客戶端實際載入的 SDK 打包檔（client/assets/plugins/colyseus.js）連線，
 * 在沒有 fetch / URLSearchParams / Headers、只有 XMLHttpRequest 與假 URL 的沙箱中執行，
 * 模擬 Cocos 原生環境：SDK 會走 XHR 備援路徑，缺少或不能用的 API 由客戶端的 polyfill 補上。
 */
const PORT = 26_000 + Math.floor(performance.now() % 1000);
let server: Server;

beforeAll(async () => {
    server = createServer({ gracefullyShutdown: false });
    await server.listen(PORT);
});

afterAll(async () => {
    await server.gracefullyShutdown(false);
});

/** 測試用的最小 XMLHttpRequest（以 Node 的 fetch 實作），只提供 SDK 用到的介面 */
class TestXMLHttpRequest {
    status = 0;
    statusText = '';
    response: unknown = null;
    responseText = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    private method = 'GET';
    private url = '';
    private headers: Record<string, string> = {};
    private responseHeaders = '';

    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }

    setRequestHeader(key: string, value: string) {
        this.headers[key] = value;
    }

    getAllResponseHeaders() {
        return this.responseHeaders;
    }

    send(body: string | null) {
        fetch(this.url, { method: this.method, headers: this.headers, body: body ?? undefined })
            .then(async (res) => {
                this.status = res.status;
                this.statusText = res.statusText;
                this.responseText = await res.text();
                this.response = this.responseText;
                this.responseHeaders = [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n');
                this.onload?.();
            })
            .catch(() => this.onerror?.());
    }
}

/** Cocos 原生 jsb-adapter 的 Blob polyfill 放到全域的 URL：模擬 <a> 元素，不會解析網址 */
function CocosFakeURL(uri: string) {
    const anchor: Record<string, unknown> = { href: uri };
    if (!('origin' in anchor)) (anchor.protocol as string).toLowerCase();
    return anchor;
}

function loadBundleLikeCocosNative() {
    const sandbox: Record<string, unknown> = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        WebSocket,
        // 每次載入用新的類別，因為 polyfill 會修補 prototype 上的 withCredentials
        XMLHttpRequest: class extends TestXMLHttpRequest {
            /** 與 Cocos 原生相同：只有 getter，嚴格模式下設定會拋錯 */
            get withCredentials() {
                return false;
            }
        },
        performance,
        TextEncoder,
        TextDecoder,
        URL: CocosFakeURL,
    };
    vm.createContext(sandbox);
    for (const api of ['fetch', 'URLSearchParams', 'Headers']) expect(vm.runInContext(`typeof ${api}`, sandbox)).toBe('undefined');

    expect(installWebPolyfills(sandbox)).toEqual(['URL', 'URLSearchParams', 'Headers', 'XMLHttpRequest.withCredentials']);
    vm.runInContext(readFileSync(new URL('../../client/assets/plugins/colyseus.js', import.meta.url), 'utf8'), sandbox);
    return sandbox as { Colyseus: any; URL: unknown; Headers: unknown };
}

describe('客戶端 SDK 打包檔', () => {
    it('在類似 Cocos 原生的環境中，透過 XHR 與 polyfill 完成 matchmaking 與狀態同步', async () => {
        const { Colyseus, URL: sandboxUrl, Headers: sandboxHeaders } = loadBundleLikeCocosNative();
        expect(sandboxUrl).toBe(MiniURL);
        expect(sandboxHeaders).toBe(MiniHeaders);

        const client = new Colyseus.Client(`ws://localhost:${PORT}`);
        const room = await client.create(RoomName.Poker, { playerId: 'bundle-test-0001', nickname: 'Bundle', avatarId: 'avatar_03' });

        const received: string[] = [];
        room.onMessage('*', (type: string) => received.push(type));
        room.send(ClientMessage.TimeSync, { clientTime: 1 });

        const start = Date.now();
        while ((room.state?.seats?.[0]?.nickname !== 'Bundle' || !received.includes(ServerMessage.TimeSync)) && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 20));
        }
        expect(room.state.seats[0].nickname).toBe('Bundle');
        expect(received).toContain(ServerMessage.TimeSync);

        await room.leave();
    });

    // 客戶端 GameClient.errorCode 依這些錯誤碼把例外轉成可翻譯的訊息
    it('加入不存在的房間與被伺服器拒絕時，回傳可辨識的錯誤碼', async () => {
        const { Colyseus } = loadBundleLikeCocosNative();
        const client = new Colyseus.Client(`ws://localhost:${PORT}`);

        const missing = await client.joinById('no-such-room', { playerId: 'bundle-test-0002', nickname: 'A', avatarId: 'avatar_01' }).catch((e: any) => e);
        expect(missing.code).toBe(522);

        const rejected = await client.create(RoomName.Poker, { playerId: 'x', nickname: '', avatarId: 'avatar_01' }).catch((e: any) => e);
        expect({ code: rejected.code, message: rejected.message }).toEqual({ code: 4000, message: 'INVALID_OPTIONS' });
    });
});
