// 替代圖：使用者之後會提供正式素材的圖片。只在檔案不存在時產生，直接以同名檔案覆蓋即可替換（Cocos 的 uuid 不變）。
import path from 'node:path';
import { CLIENT_DIR } from '../lib/common.mjs';
import { C } from './lib/palette.mjs';
import { writePng } from './lib/render.mjs';
import { HEART, SUIT_PATH, linear, place, radial, shadowFilter, sparklePath, svg, text } from './lib/shapes.mjs';

const TAG = (x, y, anchor = 'end') => text('PLACEHOLDER', x, y, { size: 22, fill: '#ffffff', anchor, extra: 'opacity="0.7" letter-spacing="3"' });

function titleLogo() {
    const defs = linear('fill', [[0, '#ffffff'], [1, C.pinkLight]]) + shadowFilter('sh', { dy: 8, blur: 6, opacity: 0.35 });
    const body = `
        <g filter="url(#sh)">
            ${text('Anime', 600, 170, { size: 150, fill: 'url(#fill)', stroke: C.pinkDeep, strokeWidth: 22 })}
            ${text('Poker', 600, 330, { size: 150, fill: 'url(#fill)', stroke: C.purpleDeep, strokeWidth: 22 })}
        </g>
        ${place(HEART, 960, 90, 80, { fill: C.pinkDeep, stroke: '#ffffff', strokeWidth: 6, rotate: 15 })}
        ${place(sparklePath(), 250, 70, 70, { fill: C.gold })}
        ${place(sparklePath(), 1000, 300, 50, { fill: C.gold })}
        ${place(SUIT_PATH.s, 210, 300, 60, { fill: C.purpleDeep, stroke: '#ffffff', strokeWidth: 6, rotate: -15 })}
        ${TAG(1180, 390)}`;
    return svg(1200, 400, body, defs);
}

function titleBackground() {
    const defs = linear('sky', [[0, '#cbb8ff'], [0.55, '#ffc6dc'], [1, '#ffe9d6']]) + radial('bokeh', [[0, '#ffffff', 0.55], [1, '#ffffff', 0]]);
    const bokeh = [
        [260, 220, 180], [1640, 180, 220], [980, 120, 140], [420, 820, 240], [1500, 860, 200], [1180, 560, 120], [720, 500, 90],
    ]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#bokeh)"/>`)
        .join('');
    const sparkles = [
        [180, 520, 40], [600, 200, 30], [1320, 300, 46], [1780, 620, 34], [880, 900, 28], [1120, 760, 22], [300, 980, 24],
    ]
        .map(([x, y, s]) => place(sparklePath(), x, y, s, { fill: '#ffffff', opacity: 0.85 }))
        .join('');
    const cards = [
        [240, 640, -18], [1700, 420, 14], [1460, 980, -8],
    ]
        .map(([x, y, r]) => `<rect x="${x - 70}" y="${y - 98}" width="140" height="196" rx="16" fill="#ffffff" opacity="0.35" transform="rotate(${r} ${x} ${y})"/>`)
        .join('');
    return svg(1920, 1080, `<rect width="1920" height="1080" fill="url(#sky)"/>${bokeh}${cards}${sparkles}${TAG(1890, 1050)}`, defs);
}

function tableBackground() {
    const defs =
        radial('room', [[0, '#5b4a8a'], [1, '#231c3a']], { r: 0.8 }) +
        radial('felt', [[0, '#8a6cd1'], [0.7, '#5d48a0'], [1, '#463780']], { r: 0.6 }) +
        linear('rim', [[0, '#ffd3e1'], [1, '#d98bb0']]) +
        shadowFilter('sh', { dy: 18, blur: 20, opacity: 0.55, color: '#000000' });
    const body = `
        <rect width="1920" height="1080" fill="url(#room)"/>
        <g filter="url(#sh)"><rect x="150" y="170" width="1620" height="760" rx="380" fill="url(#rim)"/></g>
        <rect x="186" y="204" width="1548" height="692" rx="346" fill="url(#felt)"/>
        <rect x="216" y="232" width="1488" height="636" rx="318" fill="none" stroke="${C.gold}" stroke-width="4" stroke-opacity="0.75"/>
        <rect x="236" y="250" width="1448" height="600" rx="300" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.25" stroke-dasharray="4 14" stroke-linecap="round"/>
        ${place(HEART, 960, 680, 90, { fill: '#ffffff', opacity: 0.12 })}
        ${text('Anime Poker', 960, 760, { size: 56, fill: '#ffffff', extra: 'opacity="0.14" letter-spacing="8"' })}
        ${TAG(1890, 1050)}`;
    return svg(1920, 1080, body, defs);
}

/** 簡單的 Q 版臉：每個頭像換髮色、瞳色與髮飾 */
const AVATARS = [
    { bg: '#ffd3e1', hair: '#ff8fb1', hairDeep: '#e8436f', eye: '#7b5fe0', accessory: 'bow' },
    { bg: '#e6dcff', hair: '#9b7bff', hairDeep: '#6a4fd0', eye: '#e8436f', accessory: 'star' },
    { bg: '#ffe9c7', hair: '#8b5a3c', hairDeep: '#5e3b26', eye: '#2fae8c', accessory: 'flower' },
    { bg: '#fff3b8', hair: '#ffd36e', hairDeep: '#e3a531', eye: '#3d9be0', accessory: 'ribbon' },
    { bg: '#d4f0ff', hair: '#6fbff5', hairDeep: '#3d8fd0', eye: '#4b3f72', accessory: 'ears' },
    { bg: '#d2f7ea', hair: '#5a4a7a', hairDeep: '#3a2f5b', eye: '#ff6b9a', accessory: 'heart' },
];

function accessorySvg(kind, a) {
    switch (kind) {
        case 'bow':
            return `<path d="M168 52 L196 36 L196 76 Z M168 52 L140 36 L140 76 Z" fill="${C.pinkDeep}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/><circle cx="168" cy="56" r="9" fill="#ffffff"/>`;
        case 'star':
            return place(sparklePath(), 180, 58, 52, { fill: C.gold, stroke: '#ffffff', strokeWidth: 4 });
        case 'flower':
            return [0, 72, 144, 216, 288].map((r) => `<circle cx="178" cy="44" r="12" fill="#ffffff" transform="rotate(${r} 178 60)"/>`).join('') + `<circle cx="178" cy="60" r="9" fill="${C.gold}"/>`;
        case 'ribbon':
            return `<path d="M60 78 Q128 40 196 78" fill="none" stroke="${C.pinkDeep}" stroke-width="14" stroke-linecap="round"/>`;
        case 'ears':
            return `<path d="M58 88 L66 26 L108 64 Z M198 88 L190 26 L148 64 Z" fill="${a.hair}" stroke="${a.hairDeep}" stroke-width="5" stroke-linejoin="round"/><path d="M70 70 L74 42 L94 60 Z M186 70 L182 42 L162 60 Z" fill="${C.pinkLight}"/>`;
        default:
            return place(HEART, 182, 60, 40, { fill: C.pinkDeep, stroke: '#ffffff', strokeWidth: 4, rotate: 15 });
    }
}

function avatarSvg(a, { label } = {}) {
    const eye = (x) => `
        <ellipse cx="${x}" cy="150" rx="15" ry="20" fill="${a.eye}"/>
        <ellipse cx="${x}" cy="156" rx="10" ry="12" fill="#2a2342" opacity="0.55"/>
        <circle cx="${x - 5}" cy="142" r="6" fill="#ffffff"/>
        <circle cx="${x + 6}" cy="160" r="3" fill="#ffffff"/>`;
    const body = `
        <circle cx="128" cy="128" r="128" fill="${a.bg}"/>
        <path d="M40 150 C34 70 80 36 128 36 C176 36 222 70 216 150 L222 236 C190 250 66 250 34 236 Z" fill="${a.hair}"/>
        <ellipse cx="128" cy="150" rx="74" ry="72" fill="#ffe8dc"/>
        <path d="M54 136 C56 84 92 56 128 56 C164 56 200 84 202 136 C186 112 170 100 158 94 C150 110 138 118 120 120 C126 108 128 98 126 90 C112 106 88 120 54 136 Z" fill="${a.hair}" stroke="${a.hairDeep}" stroke-width="3" stroke-linejoin="round"/>
        ${eye(98)}${eye(158)}
        <ellipse cx="84" cy="182" rx="14" ry="8" fill="${C.pink}" opacity="0.55"/>
        <ellipse cx="172" cy="182" rx="14" ry="8" fill="${C.pink}" opacity="0.55"/>
        <path d="M116 186 Q122 194 128 186 Q134 194 140 186" fill="none" stroke="#c0566f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${accessorySvg(a.accessory, a)}
        ${label ? text(label, 128, 244, { size: 18, fill: C.purpleDeep, extra: 'opacity="0.6" letter-spacing="2"' }) : ''}`;
    return svg(256, 256, `<clipPath id="clip"><circle cx="128" cy="128" r="128"/></clipPath><g clip-path="url(#clip)">${body}</g>`);
}

function appIcon(size) {
    const defs = linear('bg', [[0, C.pink], [1, C.lavender]], { x1: 0, y1: 0, x2: 1, y2: 1 }) + shadowFilter('sh', { dy: 10, blur: 10, opacity: 0.3 });
    const card = (x, rotate, suit, color) => `
        <g transform="rotate(${rotate} 256 400)" filter="url(#sh)">
            <rect x="${x}" y="130" width="190" height="266" rx="24" fill="#ffffff" stroke="#f3e6f6" stroke-width="6"/>
            ${place(SUIT_PATH[suit], x + 95, 263, 110, { fill: color })}
        </g>`;
    const body = `
        <rect width="512" height="512" rx="112" fill="url(#bg)"/>
        ${card(90, -14, 's', C.purpleDeep)}
        ${card(232, 12, 'h', C.pinkDeep)}
        ${place(sparklePath(), 410, 108, 80, { fill: C.gold, stroke: '#ffffff', strokeWidth: 6 })}
        ${place(sparklePath(), 104, 420, 46, { fill: '#ffffff' })}`;
    return svg(512, 512, body, defs).replace('width="512" height="512" viewBox', `width="${size}" height="${size}" viewBox`);
}

export function generatePlaceholders(textures) {
    const items = [
        [path.join(textures, 'title', 'title_logo.png'), titleLogo()],
        [path.join(textures, 'title', 'title_bg.png'), titleBackground()],
        [path.join(textures, 'table', 'table_bg.png'), tableBackground()],
        [path.join(textures, 'credits', 'author.png'), avatarSvg({ ...AVATARS[1], accessory: 'heart' }, { label: 'PLACEHOLDER' })],
        ...AVATARS.map((a, i) => [path.join(textures, 'avatars', `avatar_${String(i + 1).padStart(2, '0')}.png`), avatarSvg(a)]),
    ];
    return items.map(([file, svgText]) => {
        writePng(file, svgText, { placeholder: true });
        return file;
    });
}

/** Android 啟動圖示（各密度）與商店用 512px；之後由第 9 項複製到 native/engine/android/res */
export function generateAppIcon() {
    const out = path.join(CLIENT_DIR, 'native-res');
    const sizes = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
    const files = Object.entries(sizes).map(([dir, size]) => {
        const file = path.join(out, dir, 'ic_launcher.png');
        writePng(file, appIcon(size), { placeholder: true });
        return file;
    });
    const store = path.join(out, 'ic_launcher_512.png');
    writePng(store, appIcon(512), { placeholder: true });
    return [store, ...files];
}
