/** 支援的語系（不依賴 cc，可在 Node 測試） */
export type Language = 'zh-Hant' | 'zh-Hans' | 'en';

export const LANGUAGES: readonly { id: Language; label: string }[] = [
    { id: 'zh-Hant', label: '繁體中文' },
    { id: 'zh-Hans', label: '简体中文' },
    { id: 'en', label: 'English' },
];

export function isLanguage(value: unknown): value is Language {
    return LANGUAGES.some((l) => l.id === value);
}

/**
 * 依裝置語系代碼決定預設語系，依序嘗試每個代碼：
 *   zh-TW / zh-HK / zh-MO / zh-Hant* → 繁中；其他 zh* → 简中；第一個非中文代碼 → English。
 */
export function resolveLanguage(codes: readonly (string | undefined | null)[]): Language {
    for (const raw of codes) {
        if (!raw) continue;
        const code = raw.toLowerCase().replace(/_/g, '-');
        if (!code.startsWith('zh')) return 'en';
        if (/hant|-(tw|hk|mo)\b/.test(code)) return 'zh-Hant';
        return 'zh-Hans';
    }
    return 'en';
}
