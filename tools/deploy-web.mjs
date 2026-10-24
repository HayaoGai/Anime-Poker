// 建置 web-mobile 並上傳到 Cloudflare Pages。
//
//   pnpm deploy:web
//   pnpm deploy:web --skip-build    直接上傳現有的建置結果
//   pnpm deploy:web --allow-dirty   允許工作區有未提交的變更（測試用）
//
// 前置需求：
//   1. pnpm wrangler login（一次性）
//   2. Cocos Creator 3.8.8 安裝在預設路徑，或以環境變數 COCOS_CREATOR 指定 CocosCreator.exe
//   3. 執行時 Cocos 編輯器不能開著這個專案
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR, ROOT, ensureCleanTree, fail, firstExisting, getVersion, git, info, parseArgs, run, success } from './lib/common.mjs';
import { wrangler, wranglerCapture } from './lib/wrangler.mjs';

const PAGES_PROJECT = 'anime-poker';
const PRODUCTION_BRANCH = 'master';
const BUILD_CONFIG = path.join(CLIENT_DIR, 'build-config', 'web-mobile.json');
const OUTPUT_DIR = path.join(CLIENT_DIR, 'build', 'web-mobile');

// Cocos Creator CLI 建置的 exit code：36 = 成功，32 = 參數錯誤，34 = 建置過程出錯
const COCOS_BUILD_SUCCESS = 36;

const { flags } = parseArgs();

if (!flags.has('allow-dirty')) ensureCleanTree();

for (const script of ['sync-shared.mjs', 'sync-vendor.mjs']) {
    if (run(process.execPath, [path.join(ROOT, 'tools', script), '--check']) !== 0) process.exit(1);
}

const version = getVersion();
const commitHash = git('rev-parse', 'HEAD');
const commitMessage = git('log', '-1', '--format=%s');
const dirty = git('status', '--porcelain') !== '';
info(`版號 v${version}（${commitHash.slice(0, 7)}${dirty ? '，含未提交變更' : ''}）`);

// ---- 1. 建置 ----
if (flags.has('skip-build')) {
    info('略過建置，使用現有的 build/web-mobile');
} else {
    const cocos = firstExisting([
        process.env.COCOS_CREATOR,
        'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe',
    ]);
    if (!cocos) fail('找不到 CocosCreator.exe，請以環境變數 COCOS_CREATOR 指定路徑');

    // VS Code 的終端機會帶 ELECTRON_RUN_AS_NODE=1，CocosCreator.exe（Electron）會因此被當成 node 執行而無法建置
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    info('Cocos Creator 建置 web-mobile 中…');
    const code = run(cocos, ['--project', CLIENT_DIR, '--build', `configPath=${BUILD_CONFIG}`], { env });
    if (code !== COCOS_BUILD_SUCCESS) {
        fail(`Cocos 建置失敗（exit code ${code}）。若 Cocos 編輯器正開著此專案，請先關閉後再試`);
    }
    success('建置完成');
}

if (!existsSync(path.join(OUTPUT_DIR, 'index.html'))) fail(`找不到建置結果：${OUTPUT_DIR}`);

// 遊戲執行時讀取 version.json 顯示版號（製作人員彈窗）
writeFileSync(
    path.join(OUTPUT_DIR, 'version.json'),
    JSON.stringify({ version, commit: commitHash, builtAt: new Date().toISOString() }, null, 2),
);

// Cloudflare Pages 的快取標頭。md5Cache 讓檔名帶有內容雜湊（例如 cc.3a6f8.js），內容一變檔名就變，
// 因此這些檔案可以讓瀏覽器永久快取，再次進入遊戲時不必逐一回伺服器確認（Pages 預設 max-age=0）。
// 沒有雜湊的檔案（index.html、version.json、src/effect.bin 等）維持預設，每次重新驗證。
const headers = immutableRules(OUTPUT_DIR, '')
    .map((rule) => `${rule}\n  Cache-Control: public, max-age=31536000, immutable\n`)
    .join('');
// Pages 的 _headers 最多 100 條規則
if (headers.split('\n').filter((line) => line.startsWith('/')).length > 100) fail('_headers 超過 100 條規則');
writeFileSync(path.join(OUTPUT_DIR, '_headers'), headers);

// ---- 2. 上傳 ----
const projects = wranglerCapture('pages', 'project', 'list');
if (projects === null) fail('無法取得 Cloudflare Pages 專案列表，請先執行 pnpm wrangler login');

if (!projects.split(/\s+/).includes(PAGES_PROJECT)) {
    info(`建立 Cloudflare Pages 專案 ${PAGES_PROJECT}`);
    if (wrangler('pages', 'project', 'create', PAGES_PROJECT, '--production-branch', PRODUCTION_BRANCH) !== 0) {
        fail('建立 Pages 專案失敗');
    }
}

info(`上傳到 Cloudflare Pages（${PAGES_PROJECT}）…`);
const code = wrangler(
    'pages', 'deploy', OUTPUT_DIR,
    '--project-name', PAGES_PROJECT,
    '--branch', PRODUCTION_BRANCH,
    '--commit-hash', commitHash,
    '--commit-message', commitMessage,
    `--commit-dirty=${dirty}`,
);
if (code !== 0) fail('上傳失敗');

success(`v${version} 已部署到 https://${PAGES_PROJECT}.pages.dev`);

/**
 * 名稱帶有 md5Cache 雜湊：檔案如 index.e888b.js、0b0f7a282.c7c7d.json；
 * 字型等保留原檔名的資源則是目錄帶雜湊，如 d904dd37-….031ff/rounded_tw.ttf
 */
function isHashed(name) {
    return /\.[0-9a-f]{5}(\.[a-z0-9]+)?$/i.test(name);
}

function allHashed(dir) {
    return readdirSync(dir, { withFileTypes: true }).every(
        (entry) => isHashed(entry.name) || (entry.isDirectory() && allHashed(path.join(dir, entry.name))),
    );
}

/** 可永久快取的路徑規則：整個目錄都帶雜湊時用 /dir/*，否則逐一列出帶雜湊的檔案 */
function immutableRules(dir, url) {
    if (url && allHashed(dir)) return [`${url}/*`];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const child = `${url}/${entry.name}`;
        if (entry.isDirectory()) return isHashed(entry.name) ? [`${child}/*`] : immutableRules(path.join(dir, entry.name), child);
        return isHashed(entry.name) ? [child] : [];
    });
}
