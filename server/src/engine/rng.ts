import { randomInt } from 'node:crypto';

/** 回傳 [0, maxExclusive) 的均勻隨機整數 */
export type Rng = (maxExclusive: number) => number;

/**
 * 伺服器唯一的隨機來源：密碼學安全的 crypto.randomInt。
 * 全專案禁用 Math.random（test/noMathRandom.test.ts 會檢查）。
 */
export const cryptoRng: Rng = (maxExclusive) => randomInt(maxExclusive);
