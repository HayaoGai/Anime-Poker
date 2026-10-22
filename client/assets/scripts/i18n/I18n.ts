import { sys } from 'cc';
import { eventBus } from '../core/EventBus';
import { Observable } from '../core/Observable';
import { storage } from '../core/Storage';
import { isLanguage, resolveLanguage, type Language } from './language';
import { en } from './locales/en';
import { zhHans } from './locales/zhHans';
import { zhHant, type I18nKey } from './locales/zhHant';

export type { Language } from './language';
export type { I18nKey } from './locales/zhHant';

const TABLES: Record<Language, Record<I18nKey, string>> = { 'zh-Hant': zhHant, 'zh-Hans': zhHans, en };
const STORAGE_KEY = 'language';

type Params = Record<string, string | number>;

/**
 * 多語系服務。預設依裝置語系決定，使用者手動選擇後存進 localStorage 並以此為準。
 */
class I18nService {
    readonly language = new Observable<Language>('zh-Hant');
    private initialized = false;

    init(): void {
        if (this.initialized) return;
        this.initialized = true;
        const saved = storage.get<unknown>(STORAGE_KEY, null);
        this.language.value = isLanguage(saved) ? saved : this.detect();
    }

    setLanguage(language: Language): void {
        storage.set(STORAGE_KEY, language);
        if (language === this.language.value) return;
        this.language.value = language;
        eventBus.emit('languageChanged', language);
    }

    t(key: I18nKey, params?: Params): string {
        const template = TABLES[this.language.value][key] ?? zhHant[key] ?? key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
    }

    /** 伺服器回傳的代碼（錯誤碼、通知碼）不一定在表中，找不到時回傳通用訊息 */
    tCode(prefix: 'error' | 'notice', code: string, params?: Params): string {
        const key = `${prefix}.${code}` as I18nKey;
        return key in zhHant ? this.t(key, params) : this.t(prefix === 'error' ? 'error.NETWORK' : 'common.ok');
    }

    private detect(): Language {
        const navigatorLanguages = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
        return resolveLanguage([...navigatorLanguages, sys.languageCode]);
    }
}

export const i18n = new I18nService();
export const t = (key: I18nKey, params?: Params) => i18n.t(key, params);
