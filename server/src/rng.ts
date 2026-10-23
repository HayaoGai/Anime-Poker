import type { Rng } from '@shared/engine/rng';
import { randomInt } from 'node:crypto';

/**
 * 伺服器唯一的隨機來源：密碼學安全的 crypto.randomInt。
 * 全專案禁用 Math.random（test/noMathRandom.test.ts 會檢查）。
 */
export const cryptoRng: Rng = (maxExclusive) => randomInt(maxExclusive);
