/**
 * 平台能力的統一介面。遊戲邏輯只依賴這個介面，不需要知道自己跑在 Web 還是 Android。
 * 平台主動推送的狀態變化（全螢幕、網路、電量、前景／背景）透過 eventBus 發出。
 */

/** 震動強度：依遊戲情境命名，各平台自行對應實際的震動長度與模式 */
export type HapticPattern =
    /** 一般按鈕 */
    | 'light'
    /** 輪到自己 */
    | 'turn'
    /** 倒數剩 3 秒 */
    | 'warning'
    /** All-in */
    | 'heavy'
    /** 贏得底池 */
    | 'success';

export interface BatteryStatus {
    /** 0～1 */
    level: number;
    charging: boolean;
}

export interface INativeBridge {
    readonly platform: 'web' | 'android' | 'unknown';

    init(): void;

    // ---- 全螢幕（Web：Fullscreen API；Android：沉浸式模式） ----
    readonly supportsFullscreen: boolean;
    isFullscreen(): boolean;
    setFullscreen(on: boolean): Promise<void>;

    // ---- 震動 ----
    vibrate(pattern: HapticPattern): void;

    // ---- App 資訊（製作人員彈窗的版號） ----
    getAppVersion(): Promise<string>;

    // ---- 螢幕常亮（牌桌場景） ----
    setKeepScreenOn(on: boolean): void;

    // ---- 退出 App（Web 不支援，回傳 false） ----
    exitApp(): boolean;

    // ---- 分享戰績截圖 ----
    /** @param png PNG 檔案內容 */
    shareImage(png: Uint8Array, text: string): Promise<boolean>;

    // ---- 網路與電量 ----
    isOnline(): boolean;
    /** 不支援的平台回傳 null（HUD 只顯示時間） */
    getBattery(): Promise<BatteryStatus | null>;
}

/** 依遊戲情境的震動長度（毫秒），Web 與 Android 共用 */
export const HAPTIC_PATTERNS: Record<HapticPattern, number[]> = {
    light: [12],
    turn: [30, 60, 30],
    warning: [40],
    heavy: [80, 40, 120],
    success: [20, 50, 20, 50, 60],
};
