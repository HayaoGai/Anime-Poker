import { director, Label, TTFFont } from 'cc';
import type { BundleName } from '../core/Bundles';
import { loadResource } from '../core/ResourceCache';
import { i18n, type Language } from './I18n';

/**
 * 依語系套用內建字型（tools/gen-fonts 產生的 Resource Han Rounded 子集）。
 * 系統字型沒有中文字，瀏覽器逐字改用其他字型，部分字沒有粗體而粗細不一，因此所有 Label 統一改用內建字型：
 * 簡體使用 CN 字形，繁體與英文使用 TW 字形。粗體沿用 Label 的 isBold（Medium 字重加粗）。
 *
 * 場景與 Prefab 中的 Label 都是系統字型（Arial），在 Label 啟用時換成目前的字型；
 * 切換語系時更新場景中所有使用內建字型的 Label。
 */
const FONT_BUNDLE: BundleName = 'common';
const FONT_PATHS: Record<Language, string> = {
    'zh-Hant': 'fonts/rounded_tw',
    'zh-Hans': 'fonts/rounded_cn',
    en: 'fonts/rounded_tw',
};
/** 場景產生器設定的系統字型；其他字型（例如之後在編輯器指定的字型）不會被替換 */
const DEFAULT_SYSTEM_FONT = 'Arial';

class LabelFontService {
    private current: TTFFont | null = null;
    private readonly managed = new Set<TTFFont>();
    private installed = false;
    /** 目前語系字型的載入（切換語系時換成新的） */
    private loading: Promise<void> = Promise.resolve();

    init(): void {
        if (this.installed) return;
        this.installed = true;

        const service = this;
        const onEnable = Label.prototype.onEnable;
        Label.prototype.onEnable = function (this: Label): void {
            service.apply(this);
            onEnable.call(this);
        };
        i18n.language.subscribe((language) => (this.loading = this.load(language)));
    }

    /** 目前語系的字型載入完成（Loading 等它載完才進入標題畫面，文字不會先以系統字型出現） */
    ready(): Promise<void> {
        return this.loading;
    }

    private async load(language: Language): Promise<void> {
        const font = await loadResource(FONT_BUNDLE, FONT_PATHS[language], TTFFont);
        if (font) await waitForWebFont(font);
        // 載入期間又切換了語系，就不套用這個字型
        if (!font || i18n.language.value !== language) return;
        this.managed.add(font);
        this.current = font;
        for (const label of director.getScene()?.getComponentsInChildren(Label) ?? []) this.apply(label);
    }

    private apply(label: Label): void {
        if (!this.current || label.font === this.current) return;
        const replaceable = label.useSystemFont
            ? label.fontFamily === DEFAULT_SYSTEM_FONT
            : !!label.font && this.managed.has(label.font as TTFFont);
        if (replaceable) label.font = this.current;
    }
}

/**
 * Web：引擎的 TTF 載入器最多只等 3 秒就回報完成，字型（約 3MB）在慢速網路上常還沒下載完，
 * 此時套用的話 Label 會以備用字型畫出且之後不會重畫，因此等瀏覽器真正載入字型（@font-face）再套用。
 * 原生平台的字型直接從本機讀取，沒有 document.fonts，不必等待。
 */
async function waitForWebFont(font: TTFFont): Promise<void> {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts?.load || !font._fontFamily) return;
    try {
        await fonts.load(`40px ${font._fontFamily}`);
    } catch (err) {
        console.warn(`[LabelFont] 字型載入失敗：${font._fontFamily}`, err);
    }
}

export const labelFont = new LabelFontService();
