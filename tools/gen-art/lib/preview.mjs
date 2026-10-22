import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderPng } from './render.mjs';

/** 把多張 PNG 排成一張預覽圖（棋盤格背景，方便檢查透明區域） */
export function writeContactSheet(files, outFile, { cell = 140, columns = 10, background = 'checker' } = {}) {
    const rows = Math.ceil(files.length / columns);
    const width = columns * cell;
    const height = rows * (cell + 18);
    const images = files
        .map((file, i) => {
            const x = (i % columns) * cell;
            const y = Math.floor(i / columns) * (cell + 18);
            const data = readFileSync(file).toString('base64');
            const name = path.basename(file, '.png');
            return `<image x="${x + 6}" y="${y + 6}" width="${cell - 12}" height="${cell - 12}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data}"/>
                <text x="${x + cell / 2}" y="${y + cell + 12}" font-size="11" text-anchor="middle" fill="#3a2f5b">${name}</text>`;
        })
        .join('');
    const bg =
        background === 'checker'
            ? `<defs><pattern id="ck" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#d9d4e3"/><rect width="8" height="8" fill="#ece8f2"/><rect x="8" y="8" width="8" height="8" fill="#ece8f2"/></pattern></defs><rect width="100%" height="100%" fill="url(#ck)"/>`
            : `<rect width="100%" height="100%" fill="${background}"/>`;
    writeFileSync(outFile, renderPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}${images}</svg>`));
}
