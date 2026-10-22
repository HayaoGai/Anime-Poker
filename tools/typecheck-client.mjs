// 在 Cocos 編輯器外對客戶端腳本做型別檢查。
// 依賴 Cocos 產生的引擎型別（client/temp/declarations），需先以 Cocos 開啟過專案。
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CLIENT_DIR, ROOT, fail, run, success } from './lib/common.mjs';

if (!existsSync(path.join(CLIENT_DIR, 'temp', 'tsconfig.cocos.json'))) {
    fail('找不到 client/temp/tsconfig.cocos.json，請先用 Cocos Creator 開啟一次 client 專案');
}

// 使用伺服器的 TypeScript；套件的 exports 未開放 bin/，由 package.json 的 bin 欄位取得
const pkgPath = createRequire(path.join(ROOT, 'server', 'package.json')).resolve('typescript/package.json');
const { bin } = JSON.parse(readFileSync(pkgPath, 'utf8'));
const tsc = path.join(path.dirname(pkgPath), typeof bin === 'string' ? bin : bin.tsc);
if (run(process.execPath, [tsc, '-p', path.join(CLIENT_DIR, 'tsconfig.json')]) !== 0) process.exit(1);
success('客戶端型別檢查通過');
