/**
 * 客戶端的隨機工具。只用於產生本機的玩家 ID 等非遊戲邏輯用途；
 * 牌局的所有隨機性都在伺服器以 crypto.randomInt 處理。
 */

function randomBytes(count: number): Uint8Array {
    const bytes = new Uint8Array(count);
    const crypto = (globalThis as { crypto?: { getRandomValues?(array: Uint8Array): Uint8Array } }).crypto;
    if (crypto?.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        // Cocos 原生環境可能沒有 Web Crypto；玩家 ID 不涉及安全，退回 Math.random
        for (let i = 0; i < count; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
}

/** RFC 4122 第 4 版 UUID */
export function uuidV4(): string {
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
