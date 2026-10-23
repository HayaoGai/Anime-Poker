// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/engine/positions.ts，執行 pnpm sync:shared 更新。
import type { Rng } from './rng';

/**
 * 座位依編號順時針排列。以下函式的 seats 一律為「本手參賽者的座位」，由小到大排序。
 */

/** 從 start 的下一位開始，順時針列出所有座位（start 本身若在其中則排最後） */
export function seatsAfter(start: number, seats: readonly number[]): number[] {
    const next = seats.findIndex((seat) => seat > start);
    const index = next === -1 ? 0 : next;
    return [...seats.slice(index), ...seats.slice(0, index)];
}

/**
 * 決定這一手的按鈕位置：第一手隨機，之後移到上一個按鈕的下一位。
 * 練習房採「移動按鈕」的簡化規則，不處理 dead button。
 */
export function nextButton(seats: readonly number[], previousButton: number | null, rng: Rng): number {
    if (seats.length < 2) throw new Error('至少需要 2 位玩家');
    if (previousButton === null) return seats[rng(seats.length)];
    return seatsAfter(previousButton, seats)[0];
}

/** 盲注位置：兩人對決時按鈕兼小盲，否則依序為按鈕的下一位、下兩位 */
export function blindSeats(button: number, seats: readonly number[]): { smallBlind: number; bigBlind: number } {
    if (seats.length === 2) {
        return { smallBlind: button, bigBlind: seatsAfter(button, seats)[0] };
    }
    const [smallBlind, bigBlind] = seatsAfter(button, seats);
    return { smallBlind, bigBlind };
}
