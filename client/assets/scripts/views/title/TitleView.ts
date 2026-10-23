import { _decorator, Button, Component, director, EventKeyboard, input, Input, KeyCode, Node, Prefab } from 'cc';
import { audio } from '../../core/AudioManager';
import { backKey } from '../../core/BackKey';
import { popups } from '../../core/PopupManager';
import { nativeBridge } from '../../native/NativeBridge';
import { ConfirmPopup } from '../common/ConfirmPopup';

const { ccclass, property, menu } = _decorator;

/**
 * 標題畫面：點按畫面任一處（或桌機按任一鍵）進入房間列表。
 * 製作人員、語系、全螢幕按鈕位於點按區域之上，點按它們不會觸發開始。
 * Android 返回鍵：跳出「是否退出遊戲」確認。
 */
@ccclass('TitleView')
@menu('AnimePoker/TitleView')
export class TitleView extends Component {
    @property({ type: Node, tooltip: '全畫面的點按區域（位於按鈕之下）' })
    tapArea: Node | null = null;

    @property(Button)
    creditsButton: Button | null = null;

    @property(Prefab)
    creditsPopup: Prefab | null = null;

    @property(Prefab)
    confirmPopup: Prefab | null = null;

    @property({ tooltip: '下一個場景' })
    nextScene = 'Lobby';

    private started = false;
    private removeBackHandler: (() => void) | null = null;

    protected onLoad(): void {
        this.tapArea?.on(Node.EventType.TOUCH_END, this.start_, this);
        this.creditsButton?.node.on(Button.EventType.CLICK, this.openCredits, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.removeBackHandler = backKey.push(() => this.onBack());
        void audio.playBgm(null);
        director.preloadScene(this.nextScene);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.removeBackHandler?.();
    }

    private onKeyDown(event: EventKeyboard): void {
        // Esc 與 Android 返回鍵由 BackKey 處理
        if (event.keyCode === KeyCode.ESCAPE || event.keyCode === KeyCode.MOBILE_BACK) return;
        if (popups.count > 0) return;
        this.start_();
    }

    private start_(): void {
        if (this.started || popups.count > 0) return;
        this.started = true;
        void audio.playSfx('ui_click');
        setTimeout(() => director.loadScene(this.nextScene), 500);
    }

    private openCredits(): void {
        if (!this.creditsPopup) return;
        void popups.show(this.creditsPopup);
    }

    /** 只有能退出 App 的平台（Android）才詢問；Web 不處理 */
    private onBack(): boolean {
        if (nativeBridge.platform === 'web' || !this.confirmPopup) return false;
        void popups
            .show<boolean, ConfirmPopup>(this.confirmPopup, (popup) => popup.setup({ message: 'title.exitConfirm' }))
            .then((ok) => {
                if (ok) nativeBridge.exitApp();
            });
        return true;
    }
}
