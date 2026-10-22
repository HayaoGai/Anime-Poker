// UI 元件：按鈕底圖、彈窗面板、名牌、倒數環、頭像框、D/SB/BB 標記、滑桿。
// 標示 9-slice 的圖片在 Cocos 中以邊界切割後可任意縮放（邊界值見 NINE_SLICE，匯入後會寫入 .meta）。
import path from 'node:path';
import { C } from './lib/palette.mjs';
import { writePng } from './lib/render.mjs';
import { HEART, linear, place, radial, shadowFilter, sparklePath, svg, text } from './lib/shapes.mjs';

/** 9-slice 邊界（上、右、下、左，單位 px），供 Cocos meta 設定使用 */
export const NINE_SLICE = {
    btn_pill_pink: [44, 44, 44, 44],
    btn_pill_lavender: [44, 44, 44, 44],
    btn_pill_mint: [44, 44, 44, 44],
    btn_pill_gold: [44, 44, 44, 44],
    btn_pill_rose: [44, 44, 44, 44],
    btn_pill_gray: [44, 44, 44, 44],
    panel_popup: [48, 48, 48, 48],
    panel_white: [28, 28, 28, 28],
    panel_nameplate: [24, 24, 24, 24],
    panel_input: [24, 24, 24, 24],
    slider_track: [12, 16, 12, 16],
    slider_fill: [12, 16, 12, 16],
};

/** 藥丸形按鈕，含頂部高光與底部厚度 */
function pill(top, bottom, deep) {
    const defs = linear('g', [[0, top], [1, bottom]]) + linear('hl', [[0, '#ffffff', 0.55], [1, '#ffffff', 0]]) + shadowFilter('sh', { dy: 3, blur: 3, opacity: 0.2 });
    const body = `
        <g filter="url(#sh)">
            <rect x="6" y="10" width="148" height="80" rx="40" fill="${deep}"/>
            <rect x="6" y="4" width="148" height="80" rx="40" fill="url(#g)"/>
        </g>
        <rect x="18" y="10" width="124" height="30" rx="15" fill="url(#hl)"/>`;
    return svg(160, 100, body, defs);
}

/** 圓形按鈕（放圖示用） */
function circleButton(top, bottom, deep) {
    const defs = linear('g', [[0, top], [1, bottom]]) + linear('hl', [[0, '#ffffff', 0.6], [1, '#ffffff', 0]]) + shadowFilter('sh', { dy: 3, blur: 3, opacity: 0.22 });
    const body = `
        <g filter="url(#sh)">
            <circle cx="64" cy="68" r="54" fill="${deep}"/>
            <circle cx="64" cy="62" r="54" fill="url(#g)" stroke="#ffffff" stroke-width="4"/>
        </g>
        <ellipse cx="64" cy="34" rx="32" ry="14" fill="url(#hl)"/>`;
    return svg(128, 128, body, defs);
}

function marker(label, fill, textColor, ring) {
    const defs = shadowFilter('sh', { dy: 2, blur: 2, opacity: 0.3 }) + linear('hl', [[0, '#ffffff', 0.5], [1, '#ffffff', 0]]);
    const body = `
        <g filter="url(#sh)"><circle cx="40" cy="40" r="34" fill="${fill}" stroke="${ring}" stroke-width="5"/></g>
        <circle cx="40" cy="40" r="25" fill="none" stroke="${ring}" stroke-width="2" stroke-dasharray="3 4" opacity="0.7"/>
        ${text(label, 40, 41, { size: label.length > 1 ? 26 : 36, fill: textColor, extra: 'dominant-baseline="middle"' })}
        <ellipse cx="40" cy="20" rx="18" ry="8" fill="url(#hl)"/>`;
    return svg(80, 80, body, defs);
}

const ITEMS = {
    // ---- 按鈕 ----
    btn_pill_pink: () => pill('#ffb1c9', C.pink, C.pinkDeep),
    btn_pill_lavender: () => pill('#d2c2ff', C.lavender, '#7b5fe0'),
    btn_pill_mint: () => pill('#a6f0db', C.mint, C.mintDeep),
    btn_pill_gold: () => pill('#ffe6a3', C.gold, C.goldDeep),
    btn_pill_rose: () => pill('#ff9fb7', '#f2668d', '#b8325a'),
    btn_pill_gray: () => pill('#e4e0ec', C.gray, C.grayDeep),
    btn_circle_pink: () => circleButton('#ffb1c9', C.pink, C.pinkDeep),
    btn_circle_lavender: () => circleButton('#d2c2ff', C.lavender, '#7b5fe0'),
    btn_circle_dark: () => circleButton('#6b5f8f', C.purpleDeep, '#2a2342'),

    // ---- 面板 ----
    panel_popup: () =>
        svg(
            160,
            160,
            `<rect x="6" y="6" width="148" height="148" rx="40" fill="${C.cream}" stroke="${C.pink}" stroke-width="6"/>
             <rect x="16" y="16" width="128" height="128" rx="30" fill="none" stroke="${C.pinkLight}" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>`,
        ),
    panel_white: () => svg(80, 80, `<rect x="2" y="2" width="76" height="76" rx="24" fill="#ffffff"/>`),
    panel_nameplate: () =>
        svg(80, 64, `<rect x="2" y="2" width="76" height="60" rx="22" fill="${C.purpleDeep}" fill-opacity="0.82" stroke="#ffffff" stroke-opacity="0.6" stroke-width="3"/>`),
    panel_input: () => svg(80, 64, `<rect x="3" y="3" width="74" height="58" rx="20" fill="#ffffff" stroke="${C.lavender}" stroke-width="4"/>`),

    // ---- 牌桌 ----
    // 倒數環：白色，Cocos 以 Sprite FILLED（RADIAL）顯示進度並依剩餘時間著色
    timer_ring: () => svg(160, 160, `<circle cx="80" cy="80" r="70" fill="none" stroke="#ffffff" stroke-width="12"/>`),
    timer_ring_bg: () => svg(160, 160, `<circle cx="80" cy="80" r="70" fill="none" stroke="#000000" stroke-opacity="0.35" stroke-width="12"/>`),
    avatar_frame: () => {
        const defs = linear('ring', [[0, C.pink], [1, C.lavender]], { x1: 0, y1: 0, x2: 1, y2: 1 });
        return svg(
            160,
            160,
            `<circle cx="80" cy="80" r="66" fill="none" stroke="url(#ring)" stroke-width="10"/>
             <circle cx="80" cy="80" r="72" fill="none" stroke="#ffffff" stroke-width="3"/>
             ${place(HEART, 80, 146, 28, { fill: C.pinkDeep, stroke: '#ffffff', strokeWidth: 3 })}
             ${place(sparklePath(), 136, 30, 22, { fill: C.gold })}`,
            defs,
        );
    },
    avatar_mask: () => svg(128, 128, `<circle cx="64" cy="64" r="64" fill="#ffffff"/>`),
    marker_dealer: () => marker('D', '#ffffff', C.purpleDeep, C.gold),
    marker_sb: () => marker('SB', C.sky, '#ffffff', '#ffffff'),
    marker_bb: () => marker('BB', C.pinkDeep, '#ffffff', '#ffffff'),
    // 贏家光暈、公共牌高亮
    glow: () => svg(256, 256, `<circle cx="128" cy="128" r="128" fill="url(#g)"/>`, radial('g', [[0, '#ffffff', 1], [0.35, '#ffffff', 0.5], [1, '#ffffff', 0]])),
    card_highlight: () =>
        svg(
            220,
            300,
            `<rect x="6" y="6" width="208" height="288" rx="22" fill="none" stroke="${C.gold}" stroke-width="8"/>
             <rect x="2" y="2" width="216" height="296" rx="26" fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity="0.8"/>`,
        ),

    // ---- 加注滑桿 ----
    slider_track: () => svg(64, 24, `<rect x="2" y="2" width="60" height="20" rx="10" fill="${C.purpleDeep}" fill-opacity="0.55"/>`),
    slider_fill: () => svg(64, 24, `<rect x="2" y="2" width="60" height="20" rx="10" fill="${C.pink}"/>`),
    slider_thumb: () =>
        svg(
            72,
            72,
            `<circle cx="36" cy="36" r="30" fill="#ffffff" stroke="${C.pink}" stroke-width="5"/>${place(HEART, 36, 37, 30, { fill: C.pinkDeep })}`,
            '',
        ),
};

export function generateUi(textures) {
    return Object.entries(ITEMS).map(([name, make]) => {
        const file = path.join(textures, 'ui', `${name}.png`);
        writePng(file, make());
        return file;
    });
}
