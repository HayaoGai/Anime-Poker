import { _decorator, Button } from 'cc';
import { PopupBase } from '../../core/PopupBase';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import { nativeBridge } from '../../native/NativeBridge';

const { ccclass, property, menu } = _decorator;

/**
 * 製作人員：頭像、名字、E-mail、背景音樂出處，版號顯示在右下角。
 * 版號由平台提供：Web 讀建置時寫入的 version.json，Android 讀 App 的 versionName。
 */
@ccclass('CreditsPopup')
@menu('AnimePoker/CreditsPopup')
export class CreditsPopup extends PopupBase {
    @property(LocalizedLabel)
    version: LocalizedLabel | null = null;

    @property(Button)
    closeButton: Button | null = null;

    protected onLoad(): void {
        this.closeButton?.node.on(Button.EventType.CLICK, () => this.close());
        void nativeBridge.getAppVersion().then((version) => {
            if (this.isValid) this.version?.setKey('credits.version', { version });
        });
    }
}
