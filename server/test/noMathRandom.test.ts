import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(ts|mts|js|mjs)$/.test(entry.name) ? [full] : [];
    });
}

describe('隨機來源', () => {
    it('伺服器與 shared 的程式碼不得呼叫 Math.random', () => {
        const offenders = [path.join(ROOT, 'server', 'src'), path.join(ROOT, 'shared', 'src')]
            .flatMap(sourceFiles)
            .filter((file) => /Math\.random\s*\(/.test(readFileSync(file, 'utf8')))
            .map((file) => path.relative(ROOT, file));
        expect(offenders).toEqual([]);
    });
});
