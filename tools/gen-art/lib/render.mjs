import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = fileURLToPath(new URL('../fonts/', import.meta.url));

// 只使用隨附的字型，不讀系統字型，確保每台電腦的產出完全相同
const FONT = {
    fontFiles: [path.join(FONT_DIR, 'Fredoka-Bold.ttf'), path.join(FONT_DIR, 'Fredoka-SemiBold.ttf')],
    loadSystemFonts: false,
    defaultFontFamily: 'Fredoka',
};

export function renderPng(svgText) {
    return new Resvg(svgText, { font: FONT, shapeRendering: 2, textRendering: 1 }).render().asPng();
}

/**
 * 輸出 PNG。placeholder 為 true 時，檔案已存在就略過（使用者提供的正式素材不會被覆蓋）。
 * 回傳是否實際寫入。
 */
export function writePng(file, svgText, { placeholder = false } = {}) {
    if (placeholder && existsSync(file)) return false;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, renderPng(svgText));
    return true;
}
