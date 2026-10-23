/**
 * 極簡的 URL / URLSearchParams / Headers polyfill。
 *
 * Colyseus SDK 會用到這些 Web API（組 matchmaking 參數、重連時重組網址、XHR 備援路徑的標頭），
 * 但 Cocos 原生環境（Android）的 JS 引擎不提供。只實作 SDK 用到的部分，
 * 且只在環境缺少時安裝，瀏覽器上不會覆蓋原生實作。
 */

type Pair = [string, string];

const encode = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));

export class MiniURLSearchParams {
    private pairs: Pair[] = [];
    private onChange?: () => void;

    constructor(init?: string | Record<string, string> | Iterable<Pair>) {
        if (typeof init === 'string') {
            for (const part of init.replace(/^\?/, '').split('&')) {
                if (!part) continue;
                const index = part.indexOf('=');
                this.pairs.push(index === -1 ? [decode(part), ''] : [decode(part.slice(0, index)), decode(part.slice(index + 1))]);
            }
        } else if (init && Symbol.iterator in Object(init)) {
            for (const [k, v] of init as Iterable<Pair>) this.pairs.push([String(k), String(v)]);
        } else if (init) {
            for (const [k, v] of Object.entries(init)) this.pairs.push([k, String(v)]);
        }
    }

    /** @internal 由 MiniURL 綁定，參數變動時同步更新 search */
    bind(onChange: () => void): void {
        this.onChange = onChange;
    }

    get(name: string): string | null {
        return this.pairs.find(([k]) => k === name)?.[1] ?? null;
    }

    has(name: string): boolean {
        return this.pairs.some(([k]) => k === name);
    }

    set(name: string, value: string): void {
        const index = this.pairs.findIndex(([k]) => k === name);
        if (index === -1) this.pairs.push([name, String(value)]);
        else this.pairs = [...this.pairs.slice(0, index), [name, String(value)], ...this.pairs.slice(index + 1).filter(([k]) => k !== name)];
        this.onChange?.();
    }

    append(name: string, value: string): void {
        this.pairs.push([name, String(value)]);
        this.onChange?.();
    }

    delete(name: string): void {
        this.pairs = this.pairs.filter(([k]) => k !== name);
        this.onChange?.();
    }

    forEach(callback: (value: string, key: string) => void): void {
        for (const [k, v] of this.pairs) callback(v, k);
    }

    entries(): IterableIterator<Pair> {
        return this.pairs[Symbol.iterator]();
    }

    [Symbol.iterator](): IterableIterator<Pair> {
        return this.entries();
    }

    toString(): string {
        return this.pairs.map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
    }
}

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443' };
const ABSOLUTE = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/;

export class MiniURL {
    protocol = '';
    hostname = '';
    port = '';
    pathname = '/';
    hash = '';
    readonly searchParams: MiniURLSearchParams;
    private query = '';

    constructor(url: string, base?: string | MiniURL) {
        let input = String(url);
        if (!ABSOLUTE.test(input) && base !== undefined) {
            const b = new MiniURL(String(base));
            input = input.startsWith('/') ? `${b.origin}${input}` : `${b.origin}${b.pathname.replace(/[^/]*$/, '')}${input}`;
        }
        const match = ABSOLUTE.exec(input);
        if (!match) throw new TypeError(`Invalid URL: ${url}`);

        const [, protocol, host, path, search = '', hash = ''] = match;
        this.protocol = protocol.toLowerCase();
        const portIndex = host.lastIndexOf(':');
        const hasPort = portIndex !== -1 && !host.endsWith(']');
        this.hostname = (hasPort ? host.slice(0, portIndex) : host).toLowerCase();
        const port = hasPort ? host.slice(portIndex + 1) : '';
        this.port = port === DEFAULT_PORTS[this.protocol] ? '' : port;
        this.pathname = path || '/';
        this.hash = hash;
        this.query = search.replace(/^\?/, '');
        this.searchParams = new MiniURLSearchParams(this.query);
        this.searchParams.bind(() => (this.query = this.searchParams.toString()));
    }

    get host(): string {
        return this.port ? `${this.hostname}:${this.port}` : this.hostname;
    }

    get origin(): string {
        return `${this.protocol}//${this.host}`;
    }

    get search(): string {
        return this.query ? `?${this.query}` : '';
    }

    set search(value: string) {
        this.query = value.replace(/^\?/, '');
        const fresh = new MiniURLSearchParams(this.query);
        // 保留同一個 searchParams 物件參考
        for (const key of [...this.searchParams].map(([k]) => k)) this.searchParams.delete(key);
        for (const [k, v] of fresh) this.searchParams.append(k, v);
    }

    get href(): string {
        return `${this.origin}${this.pathname}${this.search}${this.hash}`;
    }

    toString(): string {
        return this.href;
    }
}

/** HTTP 標頭，名稱不分大小寫（以小寫儲存） */
export class MiniHeaders {
    private readonly map = new Map<string, string>();

    constructor(init?: MiniHeaders | Record<string, string> | Iterable<Pair>) {
        if (init instanceof MiniHeaders) init.forEach((v, k) => this.append(k, v));
        else if (init && Symbol.iterator in Object(init)) for (const [k, v] of init as Iterable<Pair>) this.append(k, v);
        else if (init) for (const [k, v] of Object.entries(init)) this.append(k, v);
    }

    append(name: string, value: string): void {
        const key = name.toLowerCase();
        const existing = this.map.get(key);
        this.map.set(key, existing === undefined ? String(value) : `${existing}, ${value}`);
    }

    set(name: string, value: string): void {
        this.map.set(name.toLowerCase(), String(value));
    }

    get(name: string): string | null {
        return this.map.get(name.toLowerCase()) ?? null;
    }

    has(name: string): boolean {
        return this.map.has(name.toLowerCase());
    }

    delete(name: string): void {
        this.map.delete(name.toLowerCase());
    }

    forEach(callback: (value: string, key: string) => void): void {
        for (const [k, v] of this.map) callback(v, k);
    }

    entries(): IterableIterator<Pair> {
        return this.map.entries();
    }

    [Symbol.iterator](): IterableIterator<Pair> {
        return this.entries();
    }
}

const POLYFILLS: Record<string, unknown> = { URL: MiniURL, URLSearchParams: MiniURLSearchParams, Headers: MiniHeaders };

/**
 * 環境已有的實作是否能用。Cocos 原生的 jsb-adapter 為了 Blob polyfill 會放一個假的全域 URL
 * （以 document.createElementNS 模擬，不會解析網址），SDK 拿它解析伺服器位址會直接拋錯，視同缺少。
 */
const USABLE: Record<string, (impl: unknown) => boolean> = {
    URL: (impl) => {
        try {
            const url = new (impl as typeof MiniURL)('wss://example.com:2567/p?a=1');
            return url.hostname === 'example.com' && url.port === '2567' && url.searchParams?.get('a') === '1';
        } catch {
            return false;
        }
    },
};

/**
 * Cocos 原生的 XMLHttpRequest.withCredentials 只有 getter（原生沒有實作），但 SDK 的 XHR 備援路徑
 * 與 jsb-adapter 的 fetch 都會設定它，在嚴格模式下直接拋錯。補一個忽略寫入的 setter，回傳是否有修補。
 */
function patchReadonlyWithCredentials(target: Record<string, unknown>): boolean {
    const proto = (target.XMLHttpRequest as { prototype?: object } | undefined)?.prototype;
    if (!proto) return false;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'withCredentials');
    if (!descriptor?.get || descriptor.set || !descriptor.configurable) return false;
    Object.defineProperty(proto, 'withCredentials', { ...descriptor, set() {} });
    return true;
}

/** 環境缺少（或實作不能用）的才安裝，回傳實際安裝的名稱 */
export function installWebPolyfills(target: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): string[] {
    const installed: string[] = [];
    for (const [name, impl] of Object.entries(POLYFILLS)) {
        if (typeof target[name] === 'undefined' || USABLE[name]?.(target[name]) === false) {
            target[name] = impl;
            installed.push(name);
        }
    }
    if (patchReadonlyWithCredentials(target)) installed.push('XMLHttpRequest.withCredentials');
    return installed;
}
