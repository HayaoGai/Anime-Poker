// 以 esbuild 打包伺服器：/shared 透過 tsconfig paths 一併打包進來，
// 第三方依賴維持 external，由 node_modules 載入。
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: true,
    external: Object.keys(pkg.dependencies ?? {}),
    logLevel: 'info',
});
