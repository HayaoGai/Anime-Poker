import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
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

/** 算圖後的 RGBA 像素（每像素 4 bytes） */
export function renderPixels(svgText) {
    const image = new Resvg(svgText, { font: FONT, shapeRendering: 2, textRendering: 1 }).render();
    return { width: image.width, height: image.height, pixels: image.pixels };
}

/** 輸出 PNG */
export function writePng(file, svgText) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, renderPng(svgText));
}
