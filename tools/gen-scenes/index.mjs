// 產生場景、Prefab 與 AnimationClip。
//
//   pnpm gen:scenes            只產生尚不存在的檔案（不會覆蓋在編輯器中調整過的場景）
//   pnpm gen:scenes --force    全部重新產生（會覆蓋編輯器中的修改）
//
// 產生前需先讓 Cocos 匯入腳本與素材（產生器從 .meta 讀取 uuid）。
// 新產生的 Prefab／場景會預先建立 .meta 並指定 uuid，彼此的引用因此能在第一次產生時就正確。
import path from 'node:path';
import { ROOT, info, parseArgs, success } from '../lib/common.mjs';
import { writeCommonPrefabs } from './common.mjs';
import { writeTitleScene } from './scenes/title.mjs';

const { flags } = parseArgs();
const force = flags.has('force');

const written = [...writeCommonPrefabs({ force }), writeTitleScene({ force })].filter(Boolean);

for (const file of written) info(`產生 ${path.relative(ROOT, file)}`);
success(written.length ? `完成（${written.length} 個檔案）` : '所有檔案皆已存在（使用 --force 重新產生）');
