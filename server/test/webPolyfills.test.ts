import { describe, expect, it } from 'vitest';
import { MiniHeaders, MiniURL, MiniURLSearchParams, installWebPolyfills } from '../../client/assets/scripts/net/webPolyfills';

// 客戶端在 Cocos 原生環境使用的 polyfill，與 Node 內建實作比對行為
describe('MiniURL', () => {
    it.each([
        'wss://anime-poker-server.onrender.com/abc/def?roomId=1&sessionId=x',
        'ws://localhost:2567/process/room?a=1',
        'https://example.com:443/path',
        'http://example.com:8080/',
        'wss://example.com',
    ])('%s', (input) => {
        const mine = new MiniURL(input);
        const node = new URL(input);
        for (const key of ['protocol', 'hostname', 'port', 'host', 'pathname', 'search', 'origin', 'href'] as const) {
            expect(mine[key], key).toBe(node[key]);
        }
    });

    it('修改 searchParams 後 toString 反映變更（SDK 重連時的用法）', () => {
        const url = new MiniURL('ws://localhost:2567/p/r?sessionId=abc');
        url.searchParams.set('reconnectionToken', 'tok en');
        url.searchParams.set('sessionId', 'xyz');
        const node = new URL('ws://localhost:2567/p/r?sessionId=abc');
        node.searchParams.set('reconnectionToken', 'tok en');
        node.searchParams.set('sessionId', 'xyz');
        expect(url.toString()).toBe(node.toString());
    });

    it('相對路徑搭配 base', () => {
        expect(new MiniURL('/matchmake', 'http://localhost:2567').href).toBe(new URL('/matchmake', 'http://localhost:2567').href);
    });

    it('拒絕不合法的網址', () => {
        expect(() => new MiniURL('not a url')).toThrow(TypeError);
    });
});

describe('MiniURLSearchParams', () => {
    it('與內建實作的序列化一致', () => {
        const init = { name: '小櫻 & Yuki', empty: '', plus: 'a+b' };
        expect(new MiniURLSearchParams(init).toString()).toBe(new URLSearchParams(init).toString());
        expect(new MiniURLSearchParams('?a=1&b=two%20words&c').get('b')).toBe('two words');
        expect([...new MiniURLSearchParams('a=1&b=2')]).toEqual([...new URLSearchParams('a=1&b=2')]);
    });
});

describe('MiniHeaders', () => {
    it('名稱不分大小寫，append 會合併', () => {
        const mine = new MiniHeaders({ 'Content-Type': 'application/json' });
        mine.append('Accept', 'a');
        mine.append('accept', 'b');
        const node = new Headers({ 'Content-Type': 'application/json' });
        node.append('Accept', 'a');
        node.append('accept', 'b');
        expect(mine.get('content-type')).toBe(node.get('content-type'));
        expect(mine.get('ACCEPT')).toBe(node.get('ACCEPT'));
        expect([...mine].sort()).toEqual([...node].sort());
    });
});

describe('installWebPolyfills', () => {
    it('只在缺少時安裝', () => {
        const bare: Record<string, unknown> = {};
        expect(installWebPolyfills(bare)).toEqual(['URL', 'URLSearchParams', 'Headers']);
        expect(bare.URL).toBe(MiniURL);
        const browser: Record<string, unknown> = { URL, URLSearchParams, Headers };
        expect(installWebPolyfills(browser)).toEqual([]);
        expect(browser.URL).toBe(URL);
    });
});
