// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/engine/rng.ts，執行 pnpm sync:shared 更新。
/**
 * 回傳 [0, maxExclusive) 的均勻隨機整數。
 * 引擎本身不決定隨機來源：伺服器注入 crypto.randomInt，離線模式由客戶端注入。
 * 全專案的伺服器與 shared 程式碼禁用 Math.random（server/test/noMathRandom.test.ts 會檢查）。
 */
export type Rng = (maxExclusive: number) => number;
