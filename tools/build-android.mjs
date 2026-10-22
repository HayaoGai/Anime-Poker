// 建置 Android APK：Cocos CLI 產生 Gradle 專案後，以 Gradle 編譯。
//
//   pnpm build:android
//
// SDK、NDK、JDK 路徑只存在本機，不寫進 repo：從環境變數讀取（或使用預設安裝位置），臨時注入建置設定。
//   ANDROID_HOME（或 ANDROID_SDK_ROOT）  Android SDK，預設 %LOCALAPPDATA%\Android\Sdk
//   ANDROID_NDK_HOME                    NDK，預設為 SDK 底下最新版的 ndk/
//   JAVA_HOME                           JDK 17
// 正式簽章（選用，未設定時使用 debug keystore）：
//   ANIMEPOKER_KEYSTORE、ANIMEPOKER_KEYSTORE_PASSWORD、ANIMEPOKER_KEY_ALIAS、ANIMEPOKER_KEY_PASSWORD
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLIENT_DIR, ROOT, fail, firstExisting, info, run, success } from './lib/common.mjs';

const COCOS_BUILD_SUCCESS = 36;

function newestChild(dir) {
    try {
        const names = readdirSync(dir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        return names.length ? path.join(dir, names[0]) : null;
    } catch {
        return null;
    }
}

const sdk = firstExisting([process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')]);
if (!sdk) fail('找不到 Android SDK，請設定 ANDROID_HOME');
const ndk = firstExisting([process.env.ANDROID_NDK_HOME, newestChild(path.join(sdk, 'ndk'))]);
if (!ndk) fail('找不到 Android NDK，請安裝 NDK 或設定 ANDROID_NDK_HOME');
const javaHome = firstExisting([process.env.JAVA_HOME, process.env.LOCALAPPDATA && newestChild(path.join(process.env.LOCALAPPDATA, 'Programs', 'Java'))]);
if (!javaHome) fail('找不到 JDK 17，請設定 JAVA_HOME');
const cocos = firstExisting([process.env.COCOS_CREATOR, 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe']);
if (!cocos) fail('找不到 CocosCreator.exe，請以環境變數 COCOS_CREATOR 指定路徑');

const config = JSON.parse(readFileSync(path.join(CLIENT_DIR, 'build-config', 'android.json'), 'utf8'));
Object.assign(config.packages.android, { sdkPath: sdk, ndkPath: ndk, javaHome });

const keystore = process.env.ANIMEPOKER_KEYSTORE;
if (keystore) {
    Object.assign(config.packages.android, {
        useDebugKeystore: false,
        keystorePath: keystore,
        keystorePassword: process.env.ANIMEPOKER_KEYSTORE_PASSWORD ?? '',
        keystoreAlias: process.env.ANIMEPOKER_KEY_ALIAS ?? '',
        keystoreAliasPassword: process.env.ANIMEPOKER_KEY_PASSWORD ?? '',
    });
    info(`使用正式簽章：${keystore}`);
} else {
    info('未設定 ANIMEPOKER_KEYSTORE，使用 debug keystore 簽章');
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'anime-poker-android-'));
const configFile = path.join(tmp, 'android.json');
writeFileSync(configFile, JSON.stringify(config, null, 2));

info(`SDK ${sdk}`);
info(`NDK ${ndk}`);
info(`JDK ${javaHome}`);
info('Cocos Creator 建置 Android 中（第一次會編譯引擎，需要較長時間）…');

// VS Code 終端機帶的 ELECTRON_RUN_AS_NODE 會讓 CocosCreator.exe 無法建置
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
delete env.ELECTRON_RUN_AS_NODE;
const code = run(cocos, ['--project', CLIENT_DIR, '--build', `configPath=${configFile}`], { env });
rmSync(tmp, { recursive: true, force: true });
if (code !== COCOS_BUILD_SUCCESS) fail(`Cocos 建置失敗（exit code ${code}）。若 Cocos 編輯器正開著此專案，請先關閉後再試`);

// Cocos CLI 只產生 Gradle 專案（資源、設定），APK 由 Gradle 編譯（含 C++ 引擎，第一次約需數十分鐘）
const proj = path.join(CLIENT_DIR, 'build', 'android', 'proj');
const gradlew = path.join(proj, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
info('Gradle 編譯 APK 中…');
const gradleCode = run(gradlew, ['assembleRelease', '--console=plain'], { cwd: proj, env, shell: process.platform === 'win32' });
if (gradleCode !== 0) fail(`Gradle 編譯失敗（exit code ${gradleCode}）`);

// 找出最新的 APK
function findApks(dir) {
    try {
        return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
            const full = path.join(dir, e.name);
            return e.isDirectory() ? findApks(full) : e.name.endsWith('.apk') ? [full] : [];
        });
    } catch {
        return [];
    }
}
const apk = findApks(path.join(proj, 'build')).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!apk) fail('建置完成但找不到 APK');
success(`APK：${path.relative(ROOT, apk)}`);
