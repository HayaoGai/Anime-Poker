// 撲克牌：52 張牌面 + 牌背，200×280。檔名 card_<點數><花色>.png（例如 card_As.png），與協定的卡牌字串一致。
import path from 'node:path';
import { C, SUIT_COLOR } from './lib/palette.mjs';
import { writePng } from './lib/render.mjs';
import { HEART, SUIT_PATH, linear, place, radial, sparklePath, starPath, svg, text } from './lib/shapes.mjs';

const W = 200;
const H = 280;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
const LABEL = { T: '10' };

// 點數牌的牌面圖案位置（L/C/R 欄 × y），y 大於中線的圖案倒置
const X = { L: 66, C: 100, R: 134 };
const PIPS = {
    2: [['C', 74], ['C', 206]],
    3: [['C', 74], ['C', 140], ['C', 206]],
    4: [['L', 74], ['R', 74], ['L', 206], ['R', 206]],
    5: [['L', 74], ['R', 74], ['C', 140], ['L', 206], ['R', 206]],
    6: [['L', 74], ['R', 74], ['L', 140], ['R', 140], ['L', 206], ['R', 206]],
    7: [['L', 74], ['R', 74], ['C', 107], ['L', 140], ['R', 140], ['L', 206], ['R', 206]],
    8: [['L', 74], ['R', 74], ['C', 107], ['L', 140], ['R', 140], ['C', 173], ['L', 206], ['R', 206]],
    9: [['L', 74], ['R', 74], ['L', 118], ['R', 118], ['C', 140], ['L', 162], ['R', 162], ['L', 206], ['R', 206]],
    T: [['L', 74], ['R', 74], ['C', 96], ['L', 118], ['R', 118], ['L', 162], ['R', 162], ['C', 184], ['L', 206], ['R', 206]],
};

function cardBase(id, extraDefs = '') {
    const defs = linear(`${id}-paper`, [[0, '#ffffff'], [1, '#fff4f8']]) + extraDefs;
    const body = `
        <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="url(#${id}-paper)" stroke="#e7dcf3" stroke-width="3"/>
        <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="10" fill="none" stroke="#f6e3ee" stroke-width="2"/>`;
    return { defs, body };
}

/** 左上與右下（倒置）的角標 */
function corners(rank, suit) {
    const color = SUIT_COLOR[suit];
    const label = LABEL[rank] ?? rank;
    const index = `
        ${text(label, 0, 0, { size: label.length > 1 ? 34 : 40, fill: color, extra: 'dominant-baseline="middle"' })}
        ${place(SUIT_PATH[suit], 0, 34, 24, { fill: color })}`;
    return `
        <g transform="translate(28 34)">${index}</g>
        <g transform="translate(${W - 28} ${H - 34}) rotate(180)">${index}</g>`;
}

function pipCard(rank, suit) {
    const color = SUIT_COLOR[suit];
    return PIPS[rank].map(([col, y]) => place(SUIT_PATH[suit], X[col], y, 36, { fill: color, rotate: y > 140 ? 180 : 0 })).join('');
}

function aceCard(suit, id) {
    const color = SUIT_COLOR[suit];
    const halo = suit === 'h' || suit === 'd' ? C.pinkLight : C.lavenderLight;
    const defs = radial(`${id}-halo`, [[0, halo, 1], [1, halo, 0]]);
    const body = `
        <circle cx="100" cy="140" r="70" fill="url(#${id}-halo)"/>
        <circle cx="100" cy="140" r="58" fill="none" stroke="${halo}" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>
        ${place(SUIT_PATH[suit], 100, 140, 86, { fill: color })}
        ${place(sparklePath(), 52, 92, 26, { fill: C.gold })}
        ${place(sparklePath(), 150, 190, 22, { fill: C.gold })}
        ${place(sparklePath(), 150, 96, 14, { fill: C.pink })}
        ${place(sparklePath(), 54, 186, 12, { fill: C.lavender })}`;
    return { defs, body };
}

/** 人頭牌的頂部徽章：K 王冠、Q 后冠、J 星星緞帶 */
function emblem(rank, color) {
    if (rank === 'K') {
        return `<path d="M72 92 L72 70 L86 82 L100 62 L114 82 L128 70 L128 92 Z" fill="${C.gold}" stroke="${C.goldDeep}" stroke-width="3" stroke-linejoin="round"/>
            <circle cx="100" cy="60" r="5" fill="${color}"/><circle cx="72" cy="68" r="4" fill="${color}"/><circle cx="128" cy="68" r="4" fill="${color}"/>`;
    }
    if (rank === 'Q') {
        return `<path d="M74 92 Q100 56 126 92 Z" fill="${C.gold}" stroke="${C.goldDeep}" stroke-width="3" stroke-linejoin="round"/>
            ${place(HEART, 100, 76, 18, { fill: color })}`;
    }
    return `<path d="M76 84 Q88 74 100 84 Q112 74 124 84 L118 94 Q100 86 82 94 Z" fill="${C.pink}" stroke="${C.pinkDeep}" stroke-width="2.5" stroke-linejoin="round"/>
        ${place(starPath(), 100, 74, 26, { fill: C.gold, stroke: C.goldDeep, strokeWidth: 2 })}`;
}

function faceCard(rank, suit, id) {
    const color = SUIT_COLOR[suit];
    const red = suit === 'h' || suit === 'd';
    const [light, mid] = red ? [C.pinkLight, C.pink] : [C.lavenderLight, C.lavender];
    const defs =
        linear(`${id}-panel`, [[0, '#ffffff'], [1, light]]) +
        `<pattern id="${id}-dots" width="22" height="22" patternUnits="userSpaceOnUse">${place(HEART, 11, 11, 7, { fill: mid, opacity: 0.35 })}</pattern>`;
    const body = `
        <rect x="42" y="52" width="116" height="176" rx="14" fill="url(#${id}-panel)" stroke="${mid}" stroke-width="3"/>
        <rect x="42" y="52" width="116" height="176" rx="14" fill="url(#${id}-dots)"/>
        ${emblem(rank, color)}
        ${text(rank, 100, 168, { size: 84, fill: '#ffffff', stroke: color, strokeWidth: 12 })}
        ${place(SUIT_PATH[suit], 100, 200, 26, { fill: color })}
        ${place(sparklePath(), 58, 120, 14, { fill: C.gold })}
        ${place(sparklePath(), 142, 196, 12, { fill: C.gold })}`;
    return { defs, body };
}

function cardSvg(rank, suit) {
    const id = `c${rank}${suit}`;
    let content;
    if (rank === 'A') content = aceCard(suit, id);
    else if ('JQK'.includes(rank)) content = faceCard(rank, suit, id);
    else content = { defs: '', body: pipCard(rank, suit) };

    const base = cardBase(id, content.defs);
    return svg(W, H, base.body + content.body + corners(rank, suit), base.defs);
}

function backSvg() {
    const defs =
        linear('bg', [[0, C.pink], [1, C.lavender]], { x1: 0, y1: 0, x2: 1, y2: 1 }) +
        `<pattern id="motif" width="36" height="36" patternUnits="userSpaceOnUse">
            ${place(HEART, 9, 9, 10, { fill: '#ffffff', opacity: 0.45 })}
            ${place(sparklePath(), 27, 27, 11, { fill: '#ffffff', opacity: 0.55 })}
        </pattern>` +
        radial('glow', [[0, '#ffffff', 0.9], [1, '#ffffff', 0]]);
    const body = `
        <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="#ffffff" stroke="#e7dcf3" stroke-width="3"/>
        <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="10" fill="url(#bg)"/>
        <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="10" fill="url(#motif)"/>
        <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="8" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round"/>
        <circle cx="100" cy="140" r="56" fill="url(#glow)"/>
        <circle cx="100" cy="140" r="36" fill="#ffffff" stroke="${C.pink}" stroke-width="4"/>
        ${place(HEART, 100, 142, 40, { fill: C.pinkDeep })}
        <path d="M58 132 Q46 118 40 126 Q44 136 58 140 Z" fill="#ffffff" opacity="0.95"/>
        <path d="M142 132 Q154 118 160 126 Q156 136 142 140 Z" fill="#ffffff" opacity="0.95"/>
        ${place(sparklePath(), 128, 108, 16, { fill: C.gold })}
        ${place(sparklePath(), 72, 176, 12, { fill: C.gold })}`;
    return svg(W, H, body, defs);
}

export function generateCards(textures) {
    const dir = path.join(textures, 'cards');
    const written = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            const file = path.join(dir, `card_${rank}${suit}.png`);
            writePng(file, cardSvg(rank, suit));
            written.push(file);
        }
    }
    const back = path.join(dir, 'card_back.png');
    writePng(back, backSvg());
    written.push(back);
    return written;
}
