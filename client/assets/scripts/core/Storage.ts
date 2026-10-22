import { sys } from 'cc';

const PREFIX = 'animepoker:';

/**
 * localStorage 的 JSON 包裝。所有玩家設定（暱稱、頭像、語系、音量）都存在這裡，沒有登入系統。
 * 讀寫失敗（隱私模式、容量不足、資料毀損）時回傳預設值，不讓遊戲中斷。
 */
export const storage = {
    get<T>(key: string, fallback: T): T {
        try {
            const raw = sys.localStorage.getItem(PREFIX + key);
            return raw === null ? fallback : (JSON.parse(raw) as T);
        } catch {
            return fallback;
        }
    },

    set<T>(key: string, value: T): void {
        try {
            sys.localStorage.setItem(PREFIX + key, JSON.stringify(value));
        } catch (err) {
            console.warn(`[storage] 無法寫入 ${key}`, err);
        }
    },

    remove(key: string): void {
        try {
            sys.localStorage.removeItem(PREFIX + key);
        } catch {
            // 忽略
        }
    },
};
