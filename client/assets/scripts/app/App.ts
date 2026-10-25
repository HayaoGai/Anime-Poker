import { game, Game } from 'cc';
import { audio } from '../core/AudioManager';
import { backKey } from '../core/BackKey';
// 載入時即安裝全域按鈕回饋（變暗、Web 游標），必須早於任何場景的按鈕啟用
import '../core/ButtonFeedback';
import '../core/DynamicAtlas';
import { eventBus } from '../core/EventBus';
import { i18n } from '../i18n/I18n';
import { labelFont } from '../i18n/LabelFont';
import { profile } from '../models/ProfileModel';
import { nativeBridge } from '../native/NativeBridge';

let initialized = false;

/**
 * App 啟動：初始化各項全域服務，只會執行一次（由每個場景的 AppRoot 呼叫，
 * 因此從任何場景開始預覽都能正常運作）。
 */
export function initApp(): void {
    if (initialized) return;
    initialized = true;

    profile.load();
    i18n.init();
    labelFont.init();
    backKey.init();
    nativeBridge.init();

    // 原生平台的前景／背景切換；Web 由 WebBridge 以 visibilitychange 處理
    game.on(Game.EVENT_HIDE, () => eventBus.emit('appPaused'));
    game.on(Game.EVENT_SHOW, () => eventBus.emit('appResumed'));
    eventBus.on('appPaused', () => audio.pauseAll());
    eventBus.on('appResumed', () => audio.resumeAll());
}
