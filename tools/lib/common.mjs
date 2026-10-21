// 建置／部署腳本共用的工具函式
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const CLIENT_DIR = path.join(ROOT, 'client');

export function info(msg) {
    console.log(`\x1b[36m›\x1b[0m ${msg}`);
}

export function success(msg) {
    console.log(`\x1b[32m✔\x1b[0m ${msg}`);
}

/** 印出錯誤並結束程序 */
export function fail(msg) {
    console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
    process.exit(1);
}

/** 執行指令並把輸出直接接到終端機，回傳 exit code */
export function run(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...options });
    if (result.error) fail(`無法執行 ${cmd}：${result.error.message}`);
    return result.status;
}

/** 執行指令並回傳 stdout（去除頭尾空白）；失敗時回傳 null */
export function capture(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, ...options });
    if (result.error || result.status !== 0) return null;
    return result.stdout.trim();
}

export function git(...args) {
    return capture('git', args);
}

/** 工作區有未提交的變更時中止 */
export function ensureCleanTree() {
    const status = git('status', '--porcelain');
    if (status === null) fail('無法讀取 git 狀態');
    if (status !== '') fail(`工作區有未提交的變更，請先 commit：\n${status}`);
}

/**
 * 版號的單一來源：最新一個 subject 帶有 vX.Y.Z 的 commit。
 * 回傳不含 v 前綴的版號，例如 "0.0.5"。
 */
export function getVersion() {
    const subjects = git('log', '--format=%s', '-n', '200');
    const match = subjects?.match(/v(\d+\.\d+\.\d+)/);
    if (!match) fail('在最近的 commit subject 中找不到 vX.Y.Z 版號');
    return match[1];
}

export function parseArgs(argv = process.argv.slice(2)) {
    const flags = new Set();
    const values = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) continue;
        const [key, inline] = arg.slice(2).split('=', 2);
        if (inline !== undefined) values[key] = inline;
        else if (argv[i + 1] && !argv[i + 1].startsWith('--')) values[key] = argv[++i];
        else flags.add(key);
    }
    return { flags, values };
}

/** 依序嘗試候選路徑，回傳第一個存在的 */
export function firstExisting(candidates) {
    return candidates.filter(Boolean).find((p) => existsSync(p)) ?? null;
}
