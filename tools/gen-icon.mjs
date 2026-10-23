// 產生 Android 啟動圖示：自適應圖示（Android 8+）與舊版的方形、圓形圖示。
//
//   pnpm gen:icon
//
// 來源圖放在 client/native-res/，兩張大小相同的正方形 PNG，建議 432×432（即 xxxhdpi 的 108dp）：
//   foreground.png  前景層，背景透明。桌面只看得到中央 2/3，重要內容放在中央直徑 61% 的圓內（432 時為 264px）
//   background.png  背景層
// 輸出到 client/native/engine/android/res/（Gradle 實際讀取的資源資料夾）。
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR, fail, info, success } from './lib/common.mjs';

const SRC = path.join(CLIENT_DIR, 'native-res');
const RES = path.join(CLIENT_DIR, 'native', 'engine', 'android', 'res');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const LAYER_DP = 108; // 自適應圖示的圖層大小
const VIEWPORT_DP = 72; // 圖層中央、桌面上看得到的範圍
const LEGACY_DP = 48; // 舊版圖示大小
const LEGACY_CORNER = 0.2; // 舊版方形圖示的圓角（佔邊長比例）

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 pnpm gen:icon 產生 -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

function pngSize(png) {
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function image(png, x, y, size) {
    return `<image x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="none" href="data:image/png;base64,${png.toString('base64')}"/>`;
}

function render(svgBody, size, viewBox) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${svgBody}</svg>`;
    return new Resvg(svg).render().asPng();
}

/** 縮放正方形 PNG；每次最多縮小一半，避免一次縮太多產生鋸齒 */
function resize(png, from, to) {
    while (from !== to) {
        const next = to < from ? Math.max(to, Math.ceil(from / 2)) : to;
        png = render(image(png, 0, 0, from), next, `0 0 ${from} ${from}`);
        from = next;
    }
    return png;
}

function readLayer(name) {
    const file = path.join(SRC, name);
    let png;
    try {
        png = readFileSync(file);
    } catch {
        fail(`找不到 ${path.relative(CLIENT_DIR, file)}`);
    }
    const { width, height } = pngSize(png);
    if (width !== height) fail(`${name} 必須是正方形（目前 ${width}×${height}）`);
    return { png, size: width };
}

const fg = readLayer('foreground.png');
const bg = readLayer('background.png');
if (fg.size !== bg.size) fail(`前景與背景大小不同（${fg.size} 與 ${bg.size}）`);
const size = fg.size;
info(`來源圖 ${size}×${size}`);

// 舊版圖示：把兩層疊起來，只取桌面看得到的中央範圍，再裁成圓角方形或圓形
const viewport = (size * VIEWPORT_DP) / LAYER_DP;
const offset = (size - viewport) / 2;
const layers = image(bg.png, 0, 0, size) + image(fg.png, 0, 0, size);
function legacy(clip) {
    return render(`<defs><clipPath id="c">${clip}</clipPath></defs><g clip-path="url(#c)">${layers}</g>`, viewport, `${offset} ${offset} ${viewport} ${viewport}`);
}
const corner = viewport * LEGACY_CORNER;
const square = legacy(`<rect x="${offset}" y="${offset}" width="${viewport}" height="${viewport}" rx="${corner}"/>`);
const round = legacy(`<circle cx="${size / 2}" cy="${size / 2}" r="${viewport / 2}"/>`);

for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const layerSize = LAYER_DP * scale;
    const legacySize = LEGACY_DP * scale;
    writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), resize(fg.png, size, layerSize));
    writeFileSync(path.join(dir, 'ic_launcher_background.png'), resize(bg.png, size, layerSize));
    writeFileSync(path.join(dir, 'ic_launcher.png'), resize(square, viewport, legacySize));
    writeFileSync(path.join(dir, 'ic_launcher_round.png'), resize(round, viewport, legacySize));
    info(`mipmap-${density}：圖層 ${layerSize}px、舊版圖示 ${legacySize}px`);
}

const anydpi = path.join(RES, 'mipmap-anydpi-v26');
mkdirSync(anydpi, { recursive: true });
writeFileSync(path.join(anydpi, 'ic_launcher.xml'), ADAPTIVE_XML);
writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), ADAPTIVE_XML);

success(`已輸出到 ${path.relative(CLIENT_DIR, RES)}`);
