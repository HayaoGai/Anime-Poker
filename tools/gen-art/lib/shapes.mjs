// SVG 片段產生器。所有形狀以 100×100 為設計框，透過 place() 縮放到指定位置與大小。

export const SUIT_PATH = {
    h: 'M50 90 C22 68 4 50 4 31 C4 15 16 5 30 5 C40 5 47 11 50 19 C53 11 60 5 70 5 C84 5 96 15 96 31 C96 50 78 68 50 90 Z',
    d: 'M50 3 C61 22 75 37 94 50 C75 63 61 78 50 97 C39 78 25 63 6 50 C25 37 39 22 50 3 Z',
    s: 'M50 5 C62 25 96 39 96 62 C96 76 86 84 74 84 C65 84 58 80 54 73 C55 83 59 90 67 96 L33 96 C41 90 45 83 46 73 C42 80 35 84 26 84 C14 84 4 76 4 62 C4 39 38 25 50 5 Z',
    // 梅花由三個圓、中心與梗組成，各自繪製後自然聯集
    c: [circle(50, 27, 21), circle(27, 55, 21), circle(73, 55, 21), circle(50, 50, 12), 'M45 56 C45 76 40 88 31 96 L69 96 C60 88 55 76 55 56 Z'],
};

function circle(cx, cy, r) {
    return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

export const HEART = SUIT_PATH.h;

/** 五角星（中心 50,50） */
export function starPath(points = 5, outer = 46, inner = 20, cx = 50, cy = 50, rotation = -90) {
    const parts = [];
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = ((rotation + (i * 180) / points) * Math.PI) / 180;
        parts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return `M${parts.join(' L')} Z`;
}

/** 四角閃光（凹邊的十字星） */
export function sparklePath(cx = 50, cy = 50, r = 46, waist = 9) {
    const p = (dx, dy) => `${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}`;
    return `M${p(0, -r)} Q${p(waist * 0.35, -waist * 0.35)} ${p(r, 0)} Q${p(waist * 0.35, waist * 0.35)} ${p(0, r)} Q${p(-waist * 0.35, waist * 0.35)} ${p(-r, 0)} Q${p(-waist * 0.35, -waist * 0.35)} ${p(0, -r)} Z`;
}

/** 把 100×100 設計框的路徑（或多條路徑）放到 (cx, cy)、寬度 size，可旋轉 */
export function place(d, cx, cy, size, { fill = 'none', stroke, strokeWidth, rotate = 0, opacity, extra = '' } = {}) {
    const s = size / 100;
    const attrs = [
        `fill="${fill}"`,
        stroke ? `stroke="${stroke}" stroke-width="${strokeWidth / s}" stroke-linejoin="round" stroke-linecap="round"` : '',
        opacity !== undefined ? `opacity="${opacity}"` : '',
        extra,
    ].filter(Boolean);
    const paths = (Array.isArray(d) ? d : [d]).map((p) => `<path d="${p}"/>`).join('');
    return `<g transform="translate(${cx} ${cy}) rotate(${rotate}) scale(${s}) translate(-50 -50)" ${attrs.join(' ')}>${paths}</g>`;
}

export function svg(width, height, body, defs = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

export function linear(id, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
    const s = stops.map(([offset, color, opacity = 1]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join('');
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
}

export function radial(id, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy } = {}) {
    const s = stops.map(([offset, color, opacity = 1]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join('');
    const focus = fx !== undefined ? ` fx="${fx}" fy="${fy}"` : '';
    return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${focus}>${s}</radialGradient>`;
}

/** 柔和的陰影濾鏡 */
export function shadowFilter(id, { dy = 4, blur = 4, opacity = 0.25, color = '#3a2f5b' } = {}) {
    return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="${color}" flood-opacity="${opacity}"/></filter>`;
}

export function text(content, x, y, { size, fill, weight = 700, anchor = 'middle', stroke, strokeWidth, extra = '' } = {}) {
    const strokeAttrs = stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke"` : '';
    return `<text x="${x}" y="${y}" font-family="Fredoka" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${strokeAttrs} ${extra}>${content}</text>`;
}
