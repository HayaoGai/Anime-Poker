import type { BatteryStatus, HapticPattern, INativeBridge } from './INativeBridge';

/**
 * 原生平台尚未實作橋接時的預設行為：所有功能皆為無作用或回傳保守值，遊戲仍可正常運作。
 * Android 的實作見 AndroidBridge（第 9 項）。
 */
export class FallbackBridge implements INativeBridge {
    readonly platform = 'unknown' as const;
    readonly supportsFullscreen = false;

    init(): void {}

    isFullscreen(): boolean {
        return false;
    }

    async setFullscreen(_on: boolean): Promise<void> {}

    vibrate(_pattern: HapticPattern): void {}

    async getAppVersion(): Promise<string> {
        return 'dev';
    }

    setKeepScreenOn(_on: boolean): void {}

    exitApp(): boolean {
        return false;
    }

    async shareImage(_png: Uint8Array, _text: string): Promise<boolean> {
        return false;
    }

    isOnline(): boolean {
        return true;
    }

    async getBattery(): Promise<BatteryStatus | null> {
        return null;
    }
}
