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
import { existsSync, writeFileSync } from 'node:fs';
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

if (run(process.execPath, [path.join(ROOT, 'tools', 'sync-shared.mjs'), '--check']) !== 0) process.exit(1);

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
