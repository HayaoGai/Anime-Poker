// 產生場景、Prefab 與 AnimationClip，並更新建置設定的場景清單。
//
//   pnpm gen:scenes            只產生尚不存在的檔案（不會覆蓋在編輯器中調整過的場景）
//   pnpm gen:scenes --force    全部重新產生（會覆蓋編輯器中的修改）
//
// 產生前需先讓 Cocos 匯入腳本與素材（產生器從 .meta 讀取 uuid）。
// 新產生的 Prefab／場景會預先建立 .meta 並指定 uuid，彼此的引用因此能在第一次產生時就正確。
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR, ROOT, info, parseArgs, success } from '../lib/common.mjs';
import { writeCommonPrefabs } from './common.mjs';
import { ownUuid } from './lib/cocos.mjs';
import { writeLobby } from './scenes/lobby.mjs';
import { writeTable } from './scenes/table.mjs';
import { writeTitleScene } from './scenes/title.mjs';

/** 建置包含的場景，第一個為起始場景 */
const SCENES = ['scenes/Title.scene', 'scenes/Lobby.scene', 'scenes/Table.scene'];

const { flags } = parseArgs();
const force = flags.has('force');

const written = [...writeCommonPrefabs({ force }), writeTitleScene({ force }), ...writeLobby({ force }), ...writeTable({ force })].filter(Boolean);
for (const file of written) info(`產生 ${path.relative(ROOT, file)}`);

// 建置設定的場景清單與起始場景
const configFile = path.join(CLIENT_DIR, 'build-config', 'web-mobile.json');
const config = JSON.parse(readFileSync(configFile, 'utf8'));
config.scenes = SCENES.map((scene) => ({ url: `db://assets/${scene}`, uuid: ownUuid(scene) }));
config.startScene = config.scenes[0].uuid;
const next = `${JSON.stringify(config, null, 2)}\n`;
if (next !== readFileSync(configFile, 'utf8').replace(/\r\n/g, '\n')) {
    writeFileSync(configFile, next);
    info(`更新建置設定的場景清單：${SCENES.map((s) => path.basename(s)).join('、')}`);
}

success(written.length ? `完成（${written.length} 個檔案）` : '所有檔案皆已存在（使用 --force 重新產生）');
