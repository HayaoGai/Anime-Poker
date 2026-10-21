// 透過 node 直接執行 wrangler 的 bin，避免 Windows 上 .cmd shim 的 shell 差異
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { capture, fail, run } from './common.mjs';

const require = createRequire(import.meta.url);

function resolveBin() {
    let pkgPath;
    try {
        pkgPath = require.resolve('wrangler/package.json');
    } catch {
        fail('找不到 wrangler，請先在 repo 根目錄執行 pnpm install');
    }
    const { bin } = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return path.join(path.dirname(pkgPath), typeof bin === 'string' ? bin : bin.wrangler);
}

const BIN = resolveBin();

export function wrangler(...args) {
    return run(process.execPath, [BIN, ...args]);
}

export function wranglerCapture(...args) {
    return capture(process.execPath, [BIN, ...args]);
}
