// 籌碼（俯視，128×128）。依面額使用不同顏色與中心圖案；動畫時依金額組合堆疊。
import path from 'node:path';
import { C } from './lib/palette.mjs';
import { writePng } from './lib/render.mjs';
import { HEART, SUIT_PATH, linear, place, sparklePath, starPath, svg } from './lib/shapes.mjs';

/** 面額以籌碼數計（BB = 2） */
export const CHIP_DENOMINATIONS = [
    { value: 1, color: '#fff3f7', edge: C.pink, deep: '#d9a3b8', motif: HEART, motifColor: C.pink },
    { value: 5, color: C.pink, edge: '#ffffff', deep: C.pinkDeep, motif: starPath(), motifColor: '#ffffff' },
    { value: 25, color: C.mint, edge: '#ffffff', deep: C.mintDeep, motif: SUIT_PATH.c, motifColor: '#ffffff' },
    { value: 100, color: C.lavender, edge: '#ffffff', deep: '#7b5fe0', motif: SUIT_PATH.d, motifColor: '#ffffff' },
    { value: 500, color: C.gold, edge: '#ffffff', deep: C.goldDeep, motif: sparklePath(), motifColor: '#ffffff' },
];

function chipSvg({ value, color, edge, deep, motif, motifColor }) {
    const id = `chip${value}`;
    const stripes = Array.from({ length: 8 }, (_, i) =>
        `<rect x="58" y="4" width="12" height="20" rx="4" fill="${edge}" transform="rotate(${i * 45} 64 64)"/>`,
    ).join('');
    const defs = linear(`${id}-face`, [[0, '#ffffff', 0.35], [0.5, '#ffffff', 0], [1, '#000000', 0.08]]);
    const body = `
        <circle cx="64" cy="66" r="60" fill="${deep}"/>
        <circle cx="64" cy="62" r="60" fill="${color}" stroke="${deep}" stroke-width="3"/>
        ${stripes}
        <circle cx="64" cy="62" r="40" fill="${color}" stroke="${edge}" stroke-width="4" stroke-dasharray="6 5"/>
        <circle cx="64" cy="62" r="33" fill="${deep}" opacity="0.18"/>
        ${place(motif, 64, 62, 38, { fill: motifColor })}
        <circle cx="64" cy="62" r="60" fill="url(#${id}-face)"/>`;
    return svg(128, 128, body, defs);
}

export function generateChips(textures) {
    return CHIP_DENOMINATIONS.map((d) => {
        const file = path.join(textures, 'chips', `chip_${d.value}.png`);
        writePng(file, chipSvg(d));
        return file;
    });
}
