import { _decorator, Button } from 'cc';
import { audio } from '../../core/AudioManager';
import type { Observable } from '../../core/Observable';
import { PopupBase } from '../../core/PopupBase';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import { SwitchToggle } from '../common/SwitchToggle';

const { ccclass, property, menu } = _decorator;

export type PauseMenuChoice = 'spectate' | 'leave';

export interface PauseMenuOptions {
    /** 離線模式：選單開啟期間牌局暫停，標題改為「遊戲暫停」 */
    paused: boolean;
    /** 不能觀戰時（離線模式、已在觀戰、比賽結束）按鈕仍顯示但不能點按 */
    canSpectate: boolean;
}

/**
 * 牌桌的暫停選單：音樂、音效、人聲開關（立即套用並存進 localStorage），以及改為觀戰、退出牌桌。
 * 選擇改為觀戰或退出時以結果關閉，由 TableView 接著詢問確認；關閉按鈕、點遮罩或返回鍵回傳 undefined。
 */
@ccclass('PauseMenuPopup')
@menu('AnimePoker/PauseMenuPopup')
export class PauseMenuPopup extends PopupBase<PauseMenuChoice> {
    @property(LocalizedLabel)
    title: LocalizedLabel | null = null;

    @property(SwitchToggle)
    musicSwitch: SwitchToggle | null = null;

    @property(SwitchToggle)
    sfxSwitch: SwitchToggle | null = null;

    @property(SwitchToggle)
    voiceSwitch: SwitchToggle | null = null;

    @property(Button)
    spectateButton: Button | null = null;

    @property(Button)
    leaveButton: Button | null = null;

    @property(Button)
    closeButton: Button | null = null;

    setup(options: PauseMenuOptions): void {
        this.title?.setKey(options.paused ? 'menu.paused' : 'menu.title');
        if (this.spectateButton) this.spectateButton.interactable = options.canSpectate;
    }

    protected onLoad(): void {
        bindSwitch(this.musicSwitch, audio.musicEnabled);
        bindSwitch(this.sfxSwitch, audio.sfxEnabled);
        bindSwitch(this.voiceSwitch, audio.voiceEnabled);
        this.spectateButton?.node.on(Button.EventType.CLICK, () => this.close('spectate'));
        this.leaveButton?.node.on(Button.EventType.CLICK, () => this.close('leave'));
        this.closeButton?.node.on(Button.EventType.CLICK, () => this.close());
    }
}

function bindSwitch(toggle: SwitchToggle | null, setting: Observable<boolean>): void {
    if (!toggle) return;
    toggle.setValue(setting.value);
    toggle.onChange = (on) => (setting.value = on);
}
