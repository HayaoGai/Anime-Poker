// 撲克牌：牌面由「底紙 + 點數 + 小花色 + 大花色 + 裝飾」在客戶端組合（CardFace.prefab），這裡輸出各層元件與牌背。
// 設計框為 200×280，各層元件裁成「以錨點為中心」的最小範圍：同一層的圖不論大小都以同一點為中心，
// prefab 裡每層節點的位置固定為錨點（換算為 Cocos 座標：x - 100, 140 - y），不需另外記錄偏移。
import path from 'node:path';
import { C, SUIT_COLOR } from './lib/palette.mjs';
import { renderPixels, writePng } from './lib/render.mjs';
import { HEART, SUIT_PATH, linear, place, radial, sparklePath, starPath, svg, text } from './lib/shapes.mjs';

const W = 200;
const H = 280;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
const LABEL = { T: '10' };
/** 花色只有兩種顏色，點數與人頭牌徽章依顏色各輸出一份 */
const COLORS = { red: SUIT_COLOR.h, black: SUIT_COLOR.s };

/** 各層的錨點（設計框座標），與 CardFace.prefab 的節點位置對應 */
export const ANCHORS = {
    rank: [54, 72],
    smallSuit: [52, 146],
    bigSuit: [130, 204],
    /** 人頭牌徽章與 A 的閃光共用同一層 */
    deco: [150, 60],
};

function faceSvg() {
    const defs = linear('paper', [[0, '#ffffff'], [1, '#fff4f8']]);
    const body = `
        <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="url(#paper)" stroke="#e7dcf3" stroke-width="3"/>
        <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="10" fill="none" stroke="#f6e3ee" stroke-width="2"/>`;
    return svg(W, H, body, defs);
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
function rankLayer(rank, color) {
    const label = LABEL[rank] ?? rank;
    const [x, y] = ANCHORS.rank;
    // 用 SemiBold 讓筆畫細一點，「10」的兩個字才不會黏在一起
    return text(label, x, y, { size: label.length > 1 ? 88 : 108, fill: color, weight: 600, extra: 'dominant-baseline="middle"' });
}

function smallSuitLayer(suit) {
    const [x, y] = ANCHORS.smallSuit;
    return place(SUIT_PATH[suit], x, y, 50, { fill: SUIT_COLOR[suit] });
}

function bigSuitLayer(suit) {
    const [x, y] = ANCHORS.bigSuit;
    return place(SUIT_PATH[suit], x, y, 112, { fill: SUIT_COLOR[suit] });
}

function emblemLayer(rank, color) {
    const [x, y] = ANCHORS.deco;
    return `<g transform="translate(${x} ${y}) scale(1.05) translate(-100 -76)">${emblem(rank, color)}</g>`;
}

function sparkleLayer() {
    return place(sparklePath(), 152, 58, 34, { fill: C.gold }) + place(sparklePath(), 176, 92, 16, { fill: C.pink });
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

/** 不透明像素的範圍 [minX, minY, maxX, maxY]（含） */
function opaqueBounds(svgText) {
    const { width, height, pixels } = renderPixels(svgText);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (pixels[(y * width + x) * 4 + 3] === 0) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    return [minX, minY, maxX, maxY];
}

/** 把一層元件裁成以錨點為中心的圖片（四周各留 1px 透明，避免圖集取樣時邊緣被切到） */
function writeLayer(file, body, [ax, ay]) {
    // 先在較大的畫布上算圖找出範圍，元件超出設計框（例如點數「10」）也不會被裁掉
    const pad = 40;
    const [minX, minY, maxX, maxY] = opaqueBounds(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W + pad * 2}" height="${H + pad * 2}" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}">${body}</svg>`,
    );
    const halfW = Math.max(ax - (minX - pad), maxX - pad + 1 - ax) + 1;
    const halfH = Math.max(ay - (minY - pad), maxY - pad + 1 - ay) + 1;
    writePng(
        file,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${halfW * 2}" height="${halfH * 2}" viewBox="${ax - halfW} ${ay - halfH} ${halfW * 2} ${halfH * 2}">${body}</svg>`,
    );
}

/**
 * 輸出檔名（SpriteFrame 名稱與檔名相同，客戶端 CardFrames 依此取用）：
 *   card_face / card_back            底紙、牌背
 *   rank_<red|black>_<點數>           點數（T 顯示為 10）
 *   suit_small_<花色> / suit_<花色>    小花色、大花色
 *   emblem_<red|black>_<J|Q|K>        人頭牌徽章
 *   sparkle                          A 的閃光
 */
export function generateCards(textures) {
    const dir = path.join(textures, 'cards');
    const written = [];
    const out = (name) => {
        const file = path.join(dir, `${name}.png`);
        written.push(file);
        return file;
    };

    writePng(out('card_face'), faceSvg());
    writePng(out('card_back'), backSvg());
    for (const [colorName, color] of Object.entries(COLORS)) {
        for (const rank of RANKS) writeLayer(out(`rank_${colorName}_${rank}`), rankLayer(rank, color), ANCHORS.rank);
        for (const rank of ['J', 'Q', 'K']) writeLayer(out(`emblem_${colorName}_${rank}`), emblemLayer(rank, color), ANCHORS.deco);
    }
    for (const suit of SUITS) {
        writeLayer(out(`suit_small_${suit}`), smallSuitLayer(suit), ANCHORS.smallSuit);
        writeLayer(out(`suit_${suit}`), bigSuitLayer(suit), ANCHORS.bigSuit);
    }
    writeLayer(out('sparkle'), sparkleLayer(), ANCHORS.deco);
    return written;
}
