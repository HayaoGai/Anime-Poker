import { screen } from 'cc';
import { eventBus } from '../core/EventBus';
import { HAPTIC_PATTERNS, type BatteryStatus, type HapticPattern, type INativeBridge } from './INativeBridge';

interface WakeLockSentinel {
    release(): Promise<void>;
}

interface BatteryManager extends EventTarget {
    level: number;
    charging: boolean;
}

type ModernNavigator = Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> };
    getBattery?: () => Promise<BatteryManager>;
};

/**
 * Web 平台實作：以瀏覽器 API 提供與 Android 相同的能力，不支援的功能優雅降級。
 */
export class WebBridge implements INativeBridge {
    readonly platform = 'web' as const;

    private wakeLock: WakeLockSentinel | null = null;
    private wantKeepScreenOn = false;
    private versionPromise: Promise<string> | null = null;

    private get nav(): ModernNavigator {
        return navigator as ModernNavigator;
    }

    init(): void {
        screen.on('fullscreen-change', () => eventBus.emit('fullscreenChanged', this.isFullscreen()));
        window.addEventListener('online', () => eventBus.emit('networkChanged', true));
        window.addEventListener('offline', () => eventBus.emit('networkChanged', false));
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                eventBus.emit('appPaused');
            } else {
                eventBus.emit('appResumed');
                // 分頁切回前景時，瀏覽器已自動釋放 wake lock，需重新取得
                if (this.wantKeepScreenOn) this.setKeepScreenOn(true);
            }
        });
    }

    get supportsFullscreen(): boolean {
        return screen.supportsFullScreen;
    }

    isFullscreen(): boolean {
        return screen.fullScreen();
    }

    async setFullscreen(on: boolean): Promise<void> {
        try {
            if (on) await screen.requestFullScreen();
            else await screen.exitFullScreen();
        } catch (err) {
            console.warn('[WebBridge] 切換全螢幕失敗', err);
        }
    }

    vibrate(pattern: HapticPattern): void {
        this.nav.vibrate?.(HAPTIC_PATTERNS[pattern]);
    }

    /** deploy:web 會在建置產物寫入 version.json；本機預覽沒有此檔案時顯示 dev */
    getAppVersion(): Promise<string> {
        this.versionPromise ??= fetch('version.json', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((json: { version?: string } | null) => json?.version ?? 'dev')
            .catch(() => 'dev');
        return this.versionPromise;
    }

    setKeepScreenOn(on: boolean): void {
        this.wantKeepScreenOn = on;
        if (!on) {
            void this.wakeLock?.release();
            this.wakeLock = null;
            return;
        }
        this.nav.wakeLock
            ?.request('screen')
            .then((lock) => (this.wakeLock = lock))
            .catch(() => undefined);
    }

    exitApp(): boolean {
        return false;
    }

    async shareImage(png: Uint8Array, text: string): Promise<boolean> {
        // 複製一份以確保底層是 ArrayBuffer（Blob 不接受 SharedArrayBuffer）
        const file = new File([new Uint8Array(png)], 'anime-poker.png', { type: 'image/png' });
        try {
            if (this.nav.canShare?.({ files: [file] })) {
                await this.nav.share({ files: [file], text });
                return true;
            }
        } catch (err) {
            // 使用者取消分享也會進到這裡
            if ((err as Error).name === 'AbortError') return false;
        }
        // 不支援 Web Share 的瀏覽器：直接下載圖片
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    }

    isOnline(): boolean {
        return navigator.onLine;
    }

    async getBattery(): Promise<BatteryStatus | null> {
        if (!this.nav.getBattery) return null;
        try {
            const battery = await this.nav.getBattery();
            const emit = () => eventBus.emit('batteryChanged', battery.level, battery.charging);
            battery.addEventListener('levelchange', emit);
            battery.addEventListener('chargingchange', emit);
            return { level: battery.level, charging: battery.charging };
        } catch {
            return null;
        }
    }
}
