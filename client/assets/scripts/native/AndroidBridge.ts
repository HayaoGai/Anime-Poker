import { native } from 'cc';
import { backKey } from '../core/BackKey';
import { eventBus } from '../core/EventBus';
import { HAPTIC_PATTERNS, type BatteryStatus, type HapticPattern, type INativeBridge } from './INativeBridge';

/** Java 類別路徑以斜線分隔（JNI 格式） */
const ACTIVITY = 'com/cocos/game/AppActivity';
const BRIDGE = 'com/lance/animepoker/bridge/';

/** 原生 → JS 的事件名稱（與 Kotlin 的 NativeEvents 一致） */
const NativeEvent = {
    ImmersiveChanged: 'immersiveChanged',
    NetworkChanged: 'networkChanged',
    BatteryChanged: 'batteryChanged',
    BackPressed: 'backPressed',
} as const;

/**
 * Android 實作，使用 Cocos 的兩種橋接機制：
 *   - 同步呼叫（JS → Java／Kotlin）：native.reflection.callStaticMethod(類別, 方法, JNI 簽章, ...參數)
 *     例如 "(Ljava/lang/String;)V" 代表參數為一個 String、沒有回傳值；Kotlin 端必須是 @JvmStatic
 *   - 事件推送（原生 → JS）：native.jsbBridgeWrapper，原生端切到遊戲執行緒後派送
 */
export class AndroidBridge implements INativeBridge {
    readonly platform = 'android' as const;
    readonly supportsFullscreen = true;

    private immersive = true;
    private online = true;

    init(): void {
        const listen = (event: string, handler: (arg: string) => void) =>
            native.jsbBridgeWrapper.addNativeEventListener(event, (arg?: string | null) => handler(arg ?? ''));

        listen(NativeEvent.ImmersiveChanged, (arg) => {
            this.immersive = arg === '1';
            eventBus.emit('fullscreenChanged', this.immersive);
        });
        listen(NativeEvent.NetworkChanged, (arg) => {
            this.online = arg === '1';
            eventBus.emit('networkChanged', this.online);
        });
        listen(NativeEvent.BatteryChanged, (arg) => {
            const status = parseBattery(arg);
            if (status) eventBus.emit('batteryChanged', status.level, status.charging);
        });
        listen(NativeEvent.BackPressed, () => backKey.trigger());

        this.immersive = call<boolean>(`${BRIDGE}ImmersiveBridge`, 'isImmersive', '()Z') ?? true;
        this.online = call<boolean>(`${BRIDGE}NetworkMonitor`, 'isOnline', '()Z') ?? true;
    }

    isFullscreen(): boolean {
        return this.immersive;
    }

    async setFullscreen(on: boolean): Promise<void> {
        call(`${BRIDGE}ImmersiveBridge`, 'setImmersive', '(Z)V', on);
    }

    vibrate(pattern: HapticPattern): void {
        call(`${BRIDGE}HapticsBridge`, 'vibrate', '(Ljava/lang/String;)V', HAPTIC_PATTERNS[pattern].join(','));
    }

    async getAppVersion(): Promise<string> {
        return call<string>(ACTIVITY, 'getAppVersion', '()Ljava/lang/String;') || 'dev';
    }

    setKeepScreenOn(on: boolean): void {
        call(ACTIVITY, 'setKeepScreenOn', '(Z)V', on);
    }

    exitApp(): boolean {
        call(ACTIVITY, 'exitApp', '()V');
        return true;
    }

    /** 先把 PNG 寫到 App 私有目錄（FileProvider 設定的 files/share/），再交給原生分享 */
    async shareImage(png: Uint8Array, text: string): Promise<boolean> {
        const dir = `${native.fileUtils.getWritablePath()}share/`;
        native.fileUtils.createDirectory(dir);
        const path = `${dir}anime-poker.png`;
        const buffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
        if (!native.fileUtils.writeDataToFile(buffer, path)) return false;
        return call<boolean>(`${BRIDGE}ShareBridge`, 'shareImage', '(Ljava/lang/String;Ljava/lang/String;)Z', path, text) ?? false;
    }

    isOnline(): boolean {
        return this.online;
    }

    async getBattery(): Promise<BatteryStatus | null> {
        return parseBattery(call<string>(`${BRIDGE}BatteryMonitor`, 'getStatus', '()Ljava/lang/String;') ?? '');
    }
}

/** 呼叫失敗（例如類別或簽章錯誤）時記錄並回傳 undefined，不讓遊戲中斷 */
function call<T = void>(className: string, method: string, signature: string, ...args: unknown[]): T | undefined {
    try {
        return native.reflection.callStaticMethod(className, method, signature, ...args) as T;
    } catch (err) {
        console.warn(`[AndroidBridge] ${className}.${method} 呼叫失敗`, err);
        return undefined;
    }
}

function parseBattery(json: string): BatteryStatus | null {
    try {
        const { level, charging } = JSON.parse(json) as { level: number; charging: boolean };
        return typeof level === 'number' ? { level, charging: !!charging } : null;
    } catch {
        return null;
    }
}
