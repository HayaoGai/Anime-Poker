import { director, Label, TTFFont } from 'cc';
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

    init(): void {
        if (this.installed) return;
        this.installed = true;

        const service = this;
        const onEnable = Label.prototype.onEnable;
        Label.prototype.onEnable = function (this: Label): void {
            service.apply(this);
            onEnable.call(this);
        };
        i18n.language.subscribe((language) => void this.load(language));
    }

    private async load(language: Language): Promise<void> {
        const font = await loadResource(FONT_PATHS[language], TTFFont);
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

export const labelFont = new LabelFontService();
