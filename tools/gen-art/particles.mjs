// 粒子貼圖（64×64）：以白色或淺色為主，在 ParticleSystem2D 中以 startColor / endColor 著色。
import path from 'node:path';
import { C } from './lib/palette.mjs';
import { writePng } from './lib/render.mjs';
import { HEART, place, radial, sparklePath, starPath, svg } from './lib/shapes.mjs';

const ITEMS = {
    sparkle: () => svg(64, 64, `<circle cx="32" cy="32" r="14" fill="url(#g)"/>${place(sparklePath(50, 50, 48, 8), 32, 32, 62, { fill: '#ffffff' })}`, radial('g', [[0, '#ffffff', 0.9], [1, '#ffffff', 0]])),
    star: () => svg(64, 64, place(starPath(5, 46, 22), 32, 33, 58, { fill: '#ffffff' })),
    heart: () => svg(64, 64, place(HEART, 32, 33, 56, { fill: '#ffffff' })),
    petal: () =>
        svg(
            64,
            64,
            // 櫻花花瓣：頂端有凹口、底部收尖，淡粉漸層
            `<path d="M32 60 C14 50 6 30 18 10 C24 6 28 10 32 18 C36 10 40 6 46 10 C58 30 50 50 32 60 Z" fill="url(#g)"/>`,
            radial('g', [[0, '#ffffff'], [1, C.pinkLight]], { cx: 0.5, cy: 0.8, r: 0.75 }),
        ),
    soft_circle: () => svg(64, 64, `<circle cx="32" cy="32" r="32" fill="url(#g)"/>`, radial('g', [[0, '#ffffff', 1], [0.4, '#ffffff', 0.6], [1, '#ffffff', 0]])),
    coin: () =>
        svg(
            64,
            64,
            `<circle cx="32" cy="34" r="27" fill="${C.goldDeep}"/><circle cx="32" cy="31" r="27" fill="${C.gold}" stroke="${C.goldDeep}" stroke-width="3"/>
             ${place(starPath(5, 46, 22), 32, 31, 28, { fill: '#ffffff', opacity: 0.9 })}
             <ellipse cx="24" cy="18" rx="10" ry="5" fill="#ffffff" opacity="0.5"/>`,
        ),
    confetti: () => svg(64, 64, `<rect x="20" y="10" width="24" height="44" rx="6" fill="#ffffff"/>`),
};

export function generateParticles(textures) {
    return Object.entries(ITEMS).map(([name, make]) => {
        const file = path.join(textures, 'particles', `particle_${name}.png`);
        writePng(file, make());
        return file;
    });
}
