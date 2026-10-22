// 按鈕圖示：白色線條、透明背景（128×128），在 Cocos 中放在按鈕底圖上，可用 Sprite 顏色著色。
import path from 'node:path';
import { writePng } from './lib/render.mjs';
import { HEART, place, svg } from './lib/shapes.mjs';

const S = (width = 10) => `stroke="#ffffff" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const F = 'fill="#ffffff"';

const ICONS = {
    // 製作人員：人像 + 小愛心
    credits: `<circle cx="64" cy="44" r="18" ${S()}/><path d="M28 104 C30 80 46 70 64 70 C82 70 98 80 100 104" ${S()}/>${place(HEART, 98, 36, 26, { fill: '#ffffff' })}`,
    fullscreen_enter: `<path d="M24 50 V24 H50 M78 24 H104 V50 M104 78 V104 H78 M50 104 H24 V78" ${S()}/>`,
    fullscreen_exit: `<path d="M50 24 V50 H24 M104 50 H78 V24 M78 104 V78 H104 M24 78 H50 V104" ${S()}/>`,
    language: `<circle cx="64" cy="64" r="40" ${S()}/><path d="M24 64 H104 M64 24 C46 44 46 84 64 104 M64 24 C82 44 82 84 64 104" ${S(8)}/>`,
    leave: `<path d="M56 24 H32 V104 H56" ${S()}/><path d="M52 64 H104 M86 44 L106 64 L86 84" ${S()}/>`,
    spectate: `<path d="M14 64 C30 36 98 36 114 64 C98 92 30 92 14 64 Z" ${S()}/><circle cx="64" cy="64" r="14" ${F}/>`,
    close: `<path d="M36 36 L92 92 M92 36 L36 92" ${S(12)}/>`,
    share: `<circle cx="92" cy="32" r="13" ${F}/><circle cx="36" cy="64" r="13" ${F}/><circle cx="92" cy="96" r="13" ${F}/><path d="M80 38 L48 58 M48 70 L80 90" ${S(8)}/>`,
    edit: `<path d="M84 24 L104 44 L52 96 L28 100 L32 76 Z" ${S()}/><path d="M74 34 L94 54" ${S(8)}/>`,
    add: `<path d="M64 28 V100 M28 64 H100" ${S(12)}/>`,
    remove: `<path d="M28 64 H100" ${S(12)}/>`,
    bot: `<rect x="26" y="40" width="76" height="60" rx="18" ${S()}/><path d="M64 40 V22" ${S()}/><circle cx="64" cy="18" r="7" ${F}/><circle cx="48" cy="68" r="8" ${F}/><circle cx="80" cy="68" r="8" ${F}/><path d="M50 86 H78" ${S(7)}/>`,
    back: `<path d="M78 26 L40 64 L78 102" ${S(12)}/>`,
    check: `<path d="M28 66 L54 92 L102 38" ${S(12)}/>`,
    sound_on: `<path d="M24 52 H44 L68 30 V98 L44 76 H24 Z" ${S(8)}/><path d="M84 46 C92 56 92 72 84 82 M96 36 C110 52 110 76 96 92" ${S(8)}/>`,
    sound_off: `<path d="M24 52 H44 L68 30 V98 L44 76 H24 Z" ${S(8)}/><path d="M84 50 L108 78 M108 50 L84 78" ${S(8)}/>`,
};

export function generateIcons(textures) {
    return Object.entries(ICONS).map(([name, body]) => {
        const file = path.join(textures, 'icons', `icon_${name}.png`);
        writePng(file, svg(128, 128, body));
        return file;
    });
}
