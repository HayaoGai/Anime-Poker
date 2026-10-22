import { _decorator, Button } from 'cc';
import { PopupBase } from '../../core/PopupBase';
import type { I18nKey } from '../../i18n/I18n';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';

const { ccclass, property, menu } = _decorator;

export interface ConfirmOptions {
    message: I18nKey;
    params?: Record<string, string | number>;
    ok?: I18nKey;
    cancel?: I18nKey;
    /** false 時只顯示確定按鈕（訊息提示） */
    showCancel?: boolean;
}

/** 確認框：確定回傳 true，取消、點遮罩或返回鍵回傳 false / undefined */
@ccclass('ConfirmPopup')
@menu('AnimePoker/ConfirmPopup')
export class ConfirmPopup extends PopupBase<boolean> {
    @property(LocalizedLabel)
    message: LocalizedLabel | null = null;

    @property(Button)
    okButton: Button | null = null;

    @property(Button)
    cancelButton: Button | null = null;

    setup(options: ConfirmOptions): void {
        this.message?.setKey(options.message, options.params);
        if (options.ok) this.okButton?.getComponentInChildren(LocalizedLabel)?.setKey(options.ok);
        if (options.cancel) this.cancelButton?.getComponentInChildren(LocalizedLabel)?.setKey(options.cancel);
        if (this.cancelButton) this.cancelButton.node.active = options.showCancel !== false;
        if (options.showCancel === false && this.okButton) this.okButton.node.setPosition(0, this.okButton.node.position.y);
    }

    protected onLoad(): void {
        this.okButton?.node.on(Button.EventType.CLICK, () => this.close(true));
        this.cancelButton?.node.on(Button.EventType.CLICK, () => this.close(false));
    }
}
