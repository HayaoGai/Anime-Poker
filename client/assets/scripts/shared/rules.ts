// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/rules.ts，執行 pnpm sync:shared 更新。
/**
 * 遊戲規則常數。籌碼一律為整數，畫面上以 BB 為單位顯示。
 */

export const MAX_SEATS = 6;
export const MIN_PLAYERS_TO_START = 2;

/** 起始盲注 */
export const SMALL_BLIND = 1;
export const BIG_BLIND = 2;

/**
 * 各級盲注為起始盲注的幾倍（每級約 ×1.5～1.6），到最後一級後不再上升。
 * 每一級打的手數等於當下參賽的人數，每個人都剛好輪過一次大盲才升級。
 */
export const BLIND_MULTIPLIERS = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80] as const;

/** 第 level 級（從 0 開始）的盲注；超過最後一級時視為最後一級 */
export function blindsForLevel(level: number): { multiplier: number; smallBlind: number; bigBlind: number } {
    const multiplier = BLIND_MULTIPLIERS[Math.min(Math.max(0, level), BLIND_MULTIPLIERS.length - 1)];
    return { multiplier, smallBlind: SMALL_BLIND * multiplier, bigBlind: BIG_BLIND * multiplier };
}

/** 每位參賽者的起始籌碼：100 BB */
export const STARTING_STACK = BIG_BLIND * 100;

/** 每次行動的時間限制 */
export const ACTION_TIMEOUT_MS = 10_000;

/** 斷線後保留座位的寬限期 */
export const RECONNECT_GRACE_MS = 20_000;

/** 籌碼換算成目前大盲的倍數，最多一位小數 */
export function toBB(chips: number, bigBlind: number = BIG_BLIND): number {
    return Math.round((chips / bigBlind) * 10) / 10;
}
