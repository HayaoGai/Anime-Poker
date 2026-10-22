/**
 * 遊戲規則常數。籌碼一律為整數，畫面上以 BB 為單位顯示。
 */

export const MAX_SEATS = 6;
export const MIN_PLAYERS_TO_START = 2;

/** 盲注不升級（練習房） */
export const SMALL_BLIND = 1;
export const BIG_BLIND = 2;

/** 每位參賽者的起始籌碼：100 BB */
export const STARTING_STACK = BIG_BLIND * 100;

/** 每次行動的時間限制 */
export const ACTION_TIMEOUT_MS = 10_000;

/** 斷線後保留座位的寬限期 */
export const RECONNECT_GRACE_MS = 20_000;

/** 籌碼換算成 BB，最多一位小數 */
export function toBB(chips: number): number {
    return Math.round((chips / BIG_BLIND) * 10) / 10;
}
