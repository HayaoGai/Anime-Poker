import { EventTarget } from 'cc';
import type { Language } from '../i18n/language';

/** 全域事件與參數型別 */
export interface AppEvents {
    languageChanged: [language: Language];
    fullscreenChanged: [fullscreen: boolean];
    networkChanged: [online: boolean];
    batteryChanged: [level: number, charging: boolean];
    /** App 進入背景／回到前景（Android 生命週期、瀏覽器分頁切換） */
    appPaused: [];
    appResumed: [];
}

/**
 * 以 Cocos 的 EventTarget 為基礎、帶型別的事件匯流排。
 * 用於跨模組、無直接相依的通知（例如原生層推送的網路狀態、語系切換）。
 */
class TypedEventBus {
    private readonly target = new EventTarget();

    on<K extends keyof AppEvents>(type: K, callback: (...args: AppEvents[K]) => void, thisArg?: unknown): () => void {
        this.target.on(type, callback, thisArg);
        return () => this.target.off(type, callback, thisArg);
    }

    off<K extends keyof AppEvents>(type: K, callback: (...args: AppEvents[K]) => void, thisArg?: unknown): void {
        this.target.off(type, callback, thisArg);
    }

    emit<K extends keyof AppEvents>(type: K, ...args: AppEvents[K]): void {
        this.target.emit(type, ...args);
    }
}

export const eventBus = new TypedEventBus();
