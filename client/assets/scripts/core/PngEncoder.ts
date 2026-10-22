/**
 * 最小的 PNG 編碼器：把 RGBA 像素轉成 PNG 檔案內容（不依賴瀏覽器 canvas，Android 原生環境也能用）。
 * 輸出 8-bit RGB（捨棄 alpha），zlib 使用不壓縮的 stored block：檔案較大，但實作簡單且沒有額外相依。
 * 分享用的截圖會先縮小（約 1280×720，2.7 MB 左右），大小可以接受。
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** deflate stored block 的長度上限 */
const MAX_STORED = 0xffff;

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
    let a = 1;
    let b = 0;
    for (let i = 0; i < bytes.length; i++) {
        a = (a + bytes[i]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

export interface PngOptions {
    /** 像素列由下往上排列時設為 true（WebGL／GLES 的 readPixels） */
    flipY?: boolean;
}

export function encodePng(rgba: ArrayLike<number>, width: number, height: number, options: PngOptions = {}): Uint8Array {
    // 每列前面加一個 filter byte（0 = None）
    const rowBytes = width * 3 + 1;
    const raw = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y++) {
        const srcRow = options.flipY ? height - 1 - y : y;
        let src = srcRow * width * 4;
        let dst = y * rowBytes + 1;
        for (let x = 0; x < width; x++, src += 4, dst += 3) {
            raw[dst] = rgba[src];
            raw[dst + 1] = rgba[src + 1];
            raw[dst + 2] = rgba[src + 2];
        }
    }

    // zlib：2 bytes header + stored blocks（每個 5 bytes header）+ 4 bytes adler32
    const blocks = Math.max(1, Math.ceil(raw.length / MAX_STORED));
    const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
    zlib[0] = 0x78;
    zlib[1] = 0x01;
    let offset = 2;
    for (let i = 0; i < blocks; i++) {
        const start = i * MAX_STORED;
        const length = Math.min(MAX_STORED, raw.length - start);
        zlib[offset] = i === blocks - 1 ? 1 : 0;
        zlib[offset + 1] = length & 0xff;
        zlib[offset + 2] = length >>> 8;
        zlib[offset + 3] = ~length & 0xff;
        zlib[offset + 4] = (~length >>> 8) & 0xff;
        zlib.set(raw.subarray(start, start + length), offset + 5);
        offset += 5 + length;
    }
    writeUint32(zlib, offset, adler32(raw));

    const header = new Uint8Array(13);
    writeUint32(header, 0, width);
    writeUint32(header, 4, height);
    header[8] = 8; // bit depth
    header[9] = 2; // color type：RGB

    const chunks = [chunk('IHDR', header), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))];
    const png = new Uint8Array(SIGNATURE.length + chunks.reduce((sum, c) => sum + c.length, 0));
    png.set(SIGNATURE, 0);
    let pos = SIGNATURE.length;
    for (const c of chunks) {
        png.set(c, pos);
        pos += c.length;
    }
    return png;
}

/** 4 bytes 長度 + 4 bytes 類型 + 資料 + 4 bytes CRC（涵蓋類型與資料） */
function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    writeUint32(out, 0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    writeUint32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
}
