// 產生遊戲美術素材（SVG → resvg → PNG）。
//
//   pnpm gen:art                      產生全部素材
//   pnpm gen:art --only cards,chips   只產生指定類別
//   pnpm gen:art --preview <資料夾>    另外輸出每個類別的預覽圖
//
// 新圖片需先由 Cocos 匯入產生 .meta，再執行一次本指令以套用「不裁切」與 9-slice 邊界設定。
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR, info, parseArgs, success } from '../lib/common.mjs';
import { generateCards } from './cards.mjs';
import { generateChips } from './chips.mjs';
import { generateIcons } from './icons.mjs';
import { ensureAutoAtlas, patchSpriteMeta } from './lib/cocosMeta.mjs';
import { writeContactSheet } from './lib/preview.mjs';
import { generateParticles } from './particles.mjs';
import { NINE_SLICE, generateUi } from './ui.mjs';

// 放在 resources 底下，客戶端才能依 id 動態載入（例如依卡牌字串載入牌面、依頭像 id 載入人聲）
const TEXTURES = path.join(CLIENT_DIR, 'assets', 'resources', 'textures');

/** 建置時合併成圖集的資料夾與圖集大小 */
const ATLASES = { cards: 2048, chips: 1024, icons: 1024, ui: 1024 };

const GENERATORS = {
    cards: { run: () => generateCards(TEXTURES), sheet: { cell: 120, columns: 13 } },
    chips: { run: () => generateChips(TEXTURES), sheet: { cell: 140, columns: 5 } },
    icons: { run: () => generateIcons(TEXTURES), sheet: { cell: 110, columns: 9, background: '#b79cff' } },
    ui: { run: () => generateUi(TEXTURES), sheet: { cell: 150, columns: 8 } },
    particles: { run: () => generateParticles(TEXTURES), sheet: { cell: 110, columns: 7, background: '#4b3f72' } },
};

const { values } = parseArgs();
const only = values.only ? values.only.split(',') : Object.keys(GENERATORS);
const previewDir = values.preview ? path.resolve(values.preview) : null;
if (previewDir) mkdirSync(previewDir, { recursive: true });

const missingMeta = [];
for (const name of only) {
    const generator = GENERATORS[name];
    if (!generator) {
        console.error(`未知的類別：${name}（可用：${Object.keys(GENERATORS).join(', ')}）`);
        process.exit(1);
    }
    const files = generator.run();
    info(`${name}：${files.length} 張`);
    if (previewDir) writeContactSheet(files, path.join(previewDir, `${name}.png`), generator.sheet);

    for (const file of files) {
        const result = patchSpriteMeta(file, { border: NINE_SLICE[path.basename(file, '.png')] });
        if (result === 'missing') missingMeta.push(path.relative(CLIENT_DIR, file));
    }
}

for (const [folder, size] of Object.entries(ATLASES)) {
    if (ensureAutoAtlas(path.join(TEXTURES, folder, `${folder}.pac`), { size }) === 'missing') missingMeta.push(`${folder}.pac`);
}

if (missingMeta.length) {
    info(`${missingMeta.length} 張圖片尚未由 Cocos 匯入（沒有 .meta）。請開啟 Cocos 編輯器匯入後，再執行一次 pnpm gen:art 套用 sprite 設定`);
}
success('素材產生完成');
