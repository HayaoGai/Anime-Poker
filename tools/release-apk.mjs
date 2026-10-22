// 把本地建置好的 APK 發佈到 GitHub Releases。
//
//   pnpm release:apk
//   pnpm release:apk --apk <路徑>     指定 APK（預設自動搜尋 client/build 下最新的 release APK）
//   pnpm release:apk --skip-verify    略過 versionName 核對（找不到 aapt2 時使用）
//
// 流程：檢查工作區與遠端 → 核對 APK 的 versionName 與版號一致 → 建立並 push tag → gh release create
// 前置需求：安裝 GitHub CLI 並執行 gh auth login（一次性）
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLIENT_DIR, capture, ensureCleanTree, fail, firstExisting, getVersion, git, info, parseArgs, run, success } from './lib/common.mjs';

const RELEASE_BRANCH = 'master';
const { flags, values } = parseArgs();

// ---- 1. 檢查 git 狀態 ----
ensureCleanTree();

const branch = git('branch', '--show-current');
if (branch !== RELEASE_BRANCH) fail(`目前在 ${branch} 分支，只能從 ${RELEASE_BRANCH} 發佈`);

info('取得遠端狀態…');
if (run('git', ['fetch', 'origin', RELEASE_BRANCH, '--tags', '--quiet']) !== 0) fail('git fetch 失敗');
const unpushed = Number(git('rev-list', '--count', `origin/${RELEASE_BRANCH}..HEAD`));
if (unpushed > 0) fail(`有 ${unpushed} 個 commit 尚未 push，請先 push 再發佈`);

const version = getVersion();
const tag = `v${version}`;
if (git('tag', '--list', tag)) fail(`tag ${tag} 已存在。每個版號只能發佈一次，請先 commit 新版號`);

if (capture('gh', ['auth', 'status']) === null) fail('GitHub CLI 未安裝或未登入，請安裝後執行 gh auth login');

// ---- 2. 找到 APK ----
function findApks(dir) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    return entries.flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return findApks(full);
        return entry.name.endsWith('.apk') ? [full] : [];
    });
}

let apk = values.apk ? path.resolve(values.apk) : null;
if (!apk) {
    const candidates = findApks(path.join(CLIENT_DIR, 'build'))
        .filter((p) => /release/i.test(p) && !/unsigned/i.test(p))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    apk = candidates[0];
    if (!apk) fail('在 client/build 下找不到 release APK，請先執行 pnpm build:android，或以 --apk 指定');
}
info(`APK：${apk}`);

// ---- 3. 核對 versionName ----
function findAapt2() {
    const sdk = firstExisting([
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    ]);
    if (!sdk) return null;
    const buildTools = path.join(sdk, 'build-tools');
    let versions;
    try {
        versions = readdirSync(buildTools).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch {
        return null;
    }
    return firstExisting(versions.flatMap((v) => [path.join(buildTools, v, 'aapt2.exe'), path.join(buildTools, v, 'aapt2')]));
}

if (flags.has('skip-verify')) {
    info('略過 versionName 核對');
} else {
    const aapt2 = findAapt2();
    if (!aapt2) fail('找不到 aapt2，請設定 ANDROID_HOME 指向 Android SDK，或加上 --skip-verify');
    const badging = capture(aapt2, ['dump', 'badging', apk]);
    const apkVersion = badging?.match(/versionName='([^']*)'/)?.[1];
    if (!apkVersion) fail('無法從 APK 讀取 versionName');
    if (apkVersion !== version) fail(`APK 的 versionName 是 ${apkVersion}，但目前版號是 ${version}，請用最新的 commit 重新建置`);
    success(`versionName ${apkVersion} 與版號一致`);
}

// ---- 4. 建 tag 並發佈 ----
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'anime-poker-release-'));
const asset = path.join(tmpDir, `AnimePoker-${tag}.apk`);
copyFileSync(apk, asset);

const subject = git('log', '-1', '--format=%s');
const notes = git('log', '-1', '--format=%b') || subject;

let tagPushed = false;
try {
    if (run('git', ['tag', '-a', tag, '-m', subject]) !== 0) throw new Error('建立 tag 失敗');
    if (run('git', ['push', 'origin', tag]) !== 0) throw new Error('push tag 失敗');
    tagPushed = true;

    info(`建立 GitHub Release ${tag}…`);
    const code = run('gh', ['release', 'create', tag, asset, '--verify-tag', '--title', `Anime Poker ${tag}`, '--notes', notes]);
    if (code !== 0) throw new Error('gh release create 失敗');
} catch (err) {
    // 回復 tag，讓同一個版號可以重試
    if (tagPushed) run('git', ['push', 'origin', '--delete', tag]);
    run('git', ['tag', '-d', tag]);
    fail(`${err.message}，已回復 tag ${tag}`);
} finally {
    rmSync(tmpDir, { recursive: true, force: true });
}

success(`已發佈 ${tag}`);
