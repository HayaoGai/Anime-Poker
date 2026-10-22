// 把第三方的瀏覽器打包檔複製到 Cocos 客戶端，以外掛腳本（plugin）形式載入。
// 客戶端因此不需要 node_modules，也避開 Cocos 解析 pnpm 符號連結的問題。
//
//   pnpm sync:vendor           同步
//   pnpm sync:vendor --check   只檢查是否一致（部署前使用）
//
// 版本以伺服器的 @colyseus/sdk devDependency 為準（整合測試使用同一版），確保前後端協定一致。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CLIENT_DIR, ROOT, fail, info, parseArgs, success } from './lib/common.mjs';

const requireFromServer = createRequire(path.join(ROOT, 'server', 'package.json'));

const VENDORS = [
    {
        name: 'Colyseus SDK',
        // 套件的 exports 未開放 dist/，由 package.json 位置推得
        source: () => path.join(path.dirname(requireFromServer.resolve('@colyseus/sdk/package.json')), 'dist', 'colyseus.js'),
        target: path.join(CLIENT_DIR, 'assets', 'plugins', 'colyseus.js'),
    },
];

const { flags } = parseArgs();
const toLf = (text) => text.replace(/\r\n/g, '\n');

let stale = 0;
for (const vendor of VENDORS) {
    let source;
    try {
        source = vendor.source();
    } catch {
        fail(`找不到 ${vendor.name}，請先執行 pnpm install`);
    }
    // 去掉 sourceMappingURL：客戶端不附 .map，避免瀏覽器開發者工具報 404
    const content = toLf(readFileSync(source, 'utf8')).replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n');
    const current = existsSync(vendor.target) ? toLf(readFileSync(vendor.target, 'utf8')) : null;
    if (current === content) continue;

    stale++;
    if (flags.has('check')) {
        console.error(`${vendor.name} 與伺服器使用的版本不一致：${path.relative(ROOT, vendor.target)}`);
        continue;
    }
    mkdirSync(path.dirname(vendor.target), { recursive: true });
    writeFileSync(vendor.target, content);
    info(`更新 ${vendor.name} → ${path.relative(ROOT, vendor.target)}`);
}

// Cocos 匯入後產生 .meta：設為外掛腳本，在 Web 與原生平台載入（UMD 會建立全域 Colyseus），編輯器內不需要
const PLUGIN_SETTINGS = { isPlugin: true, loadPluginInEditor: false, loadPluginInWeb: true, loadPluginInNative: true, loadPluginInMiniGame: true };
for (const vendor of VENDORS) {
    const metaFile = `${vendor.target}.meta`;
    if (!existsSync(metaFile)) {
        info(`${path.relative(ROOT, vendor.target)} 尚未由 Cocos 匯入，匯入後請再執行一次 pnpm sync:vendor`);
        continue;
    }
    const raw = readFileSync(metaFile, 'utf8');
    const meta = JSON.parse(raw);
    const needsPatch = Object.entries(PLUGIN_SETTINGS).some(([k, v]) => meta.userData?.[k] !== v);
    if (!needsPatch) continue;
    if (flags.has('check')) {
        console.error(`${path.relative(ROOT, metaFile)} 尚未設定為外掛腳本`);
        stale++;
        continue;
    }
    meta.userData = { ...meta.userData, ...PLUGIN_SETTINGS };
    writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
    info(`設定外掛腳本：${path.relative(ROOT, metaFile)}`);
}

if (flags.has('check') && stale) fail('請執行 pnpm sync:vendor 並 commit');
success(stale ? `同步完成（${stale} 個）` : '第三方套件已是最新');
