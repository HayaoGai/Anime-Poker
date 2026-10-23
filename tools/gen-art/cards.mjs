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

function cardBase(id) {
    const defs = linear(`${id}-paper`, [[0, '#ffffff'], [1, '#fff4f8']]);
    const body = `
        <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="url(#${id}-paper)" stroke="#e7dcf3" stroke-width="3"/>
        <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="10" fill="none" stroke="#f6e3ee" stroke-width="2"/>`;
    return { defs, body };
}

/** 人頭牌右上角的小徽章：K 王冠、Q 后冠、J 星星緞帶（設計框中心約在 100,76） */
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

/** 手機上也要一眼看出牌：左上大點數 + 小花色，右下大花色；人頭牌右上加徽章、A 加閃光點綴 */
function cardSvg(rank, suit) {
    const id = `c${rank}${suit}`;
    const color = SUIT_COLOR[suit];
    const label = LABEL[rank] ?? rank;
    // 用 SemiBold 讓筆畫細一點，「10」的兩個字才不會黏在一起
    const rankText = text(label, 54, 72, { size: label.length > 1 ? 88 : 108, fill: color, weight: 600, extra: 'dominant-baseline="middle"' });
    let deco = '';
    if ('JQK'.includes(rank)) deco = `<g transform="translate(150 60) scale(1.05) translate(-100 -76)">${emblem(rank, color)}</g>`;
    else if (rank === 'A') deco = place(sparklePath(), 152, 58, 34, { fill: C.gold }) + place(sparklePath(), 176, 92, 16, { fill: C.pink });

    const base = cardBase(id);
    const body = `
        ${rankText}
        ${place(SUIT_PATH[suit], 52, 146, 50, { fill: color })}
        ${place(SUIT_PATH[suit], 130, 204, 112, { fill: color })}
        ${deco}`;
    return svg(W, H, base.body + body, base.defs);
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
