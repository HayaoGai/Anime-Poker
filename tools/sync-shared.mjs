// 把 /shared/src 同步到 Cocos 客戶端。Cocos 只能 import assets/ 底下的檔案，因此採複製方式。
// 複製結果會 commit 進 repo，讓 Cocos 產生的 .meta 保持穩定。
//
//   pnpm sync:shared          同步
//   pnpm sync:shared --check  只檢查是否一致，不一致時 exit 1（部署前使用）
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR, ROOT, fail, info, parseArgs, success } from './lib/common.mjs';

const SRC = path.join(ROOT, 'shared', 'src');
const DEST = path.join(CLIENT_DIR, 'assets', 'scripts', 'shared');
const HEADER = '// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/{file}，執行 pnpm sync:shared 更新。\n';

/** 遞迴列出資料夾下所有 .ts 檔的相對路徑（使用 / 分隔） */
function listTs(dir, base = dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listTs(full, base);
        return entry.name.endsWith('.ts') ? [path.relative(base, full).split(path.sep).join('/')] : [];
    });
}

/** git autocrlf 會在 checkout 時改變換行字元，比對與寫入一律統一成 LF */
const toLf = (text) => text.replace(/\r\n/g, '\n');

function expectedContent(rel) {
    return toLf(HEADER.replace('{file}', rel) + readFileSync(path.join(SRC, rel), 'utf8'));
}

const { flags } = parseArgs();
const checkOnly = flags.has('check');

const srcFiles = listTs(SRC);
const destFiles = listTs(DEST);

const changed = srcFiles.filter((rel) => {
    const dest = path.join(DEST, rel);
    return !existsSync(dest) || toLf(readFileSync(dest, 'utf8')) !== expectedContent(rel);
});
const stale = destFiles.filter((rel) => !srcFiles.includes(rel));

if (checkOnly) {
    if (changed.length || stale.length) {
        fail(`client 的 shared 複本與 /shared 不一致（${[...changed, ...stale].join(', ')}），請執行 pnpm sync:shared 並 commit`);
    }
    success('shared 已同步');
    process.exit(0);
}

for (const rel of changed) {
    const dest = path.join(DEST, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, expectedContent(rel));
    info(`更新 ${rel}`);
}

// 來源已刪除的檔案：連同 Cocos 的 .meta 一起移除
for (const rel of stale) {
    const dest = path.join(DEST, rel);
    rmSync(dest);
    rmSync(`${dest}.meta`, { force: true });
    info(`移除 ${rel}`);
}

success(changed.length || stale.length ? `同步完成（${changed.length} 更新、${stale.length} 移除）` : 'shared 已是最新');
