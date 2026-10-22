import { _decorator, Button, Sprite, SpriteFrame } from 'cc';
import { audio } from '../../core/AudioManager';
import { PopupBase } from '../../core/PopupBase';
import { i18n, type Language } from '../../i18n/I18n';

const { ccclass, property, menu } = _decorator;

/** 語系選單：選擇後立即切換並存進 localStorage */
@ccclass('LanguageMenu')
@menu('AnimePoker/LanguageMenu')
export class LanguageMenu extends PopupBase {
    @property(Button)
    zhHantButton: Button | null = null;

    @property(Button)
    zhHansButton: Button | null = null;

    @property(Button)
    enButton: Button | null = null;

    @property({ type: SpriteFrame, tooltip: '目前語系的按鈕底圖' })
    selectedFrame: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '其他語系的按鈕底圖' })
    normalFrame: SpriteFrame | null = null;

    protected onLoad(): void {
        const options: [Button | null, Language][] = [
            [this.zhHantButton, 'zh-Hant'],
            [this.zhHansButton, 'zh-Hans'],
            [this.enButton, 'en'],
        ];
        for (const [button, language] of options) {
            if (!button) continue;
            const sprite = button.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = language === i18n.language.value ? this.selectedFrame : this.normalFrame;
            button.node.on(Button.EventType.CLICK, () => this.select(language));
        }
    }

    private select(language: Language): void {
        void audio.playSfx('ui_click');
        i18n.setLanguage(language);
        this.close();
    }
}
