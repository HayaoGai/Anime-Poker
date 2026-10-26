import { _decorator, Button, Color, Component, EventKeyboard, input, Input, KeyCode, Node, Prefab } from 'cc';
import { preloadForLobby } from '../../app/Preload';
import { audio } from '../../core/AudioManager';
import { backKey } from '../../core/BackKey';
import { loadScene, type SceneName } from '../../core/Bundles';
import { popups } from '../../core/PopupManager';
import { ScreenFade } from '../../core/ScreenFade';
import { nativeBridge } from '../../native/NativeBridge';
import { ConfirmPopup } from '../common/ConfirmPopup';

const { ccclass, property, menu } = _decorator;

/** 只有遊戲啟動時第一次進入標題畫面才淡入；從大廳返回時不淡入 */
let launched = false;

/**
 * 標題畫面：點按畫面任一處（或桌機按任一鍵）進入房間列表。
 * 製作人員、語系、全螢幕按鈕位於點按區域之上，點按它們不會觸發開始。
 * Android 返回鍵：跳出「是否退出遊戲」確認。
 * 遊戲啟動時畫面由黑淡入，淡入期間不接受點按與按鍵。
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
    nextScene: SceneName = 'Lobby';

    @property({ tooltip: '遊戲啟動時由黑淡入的秒數' })
    fadeInDuration = 0.8;

    private started = false;
    private fading = false;
    private removeBackHandler: (() => void) | null = null;

    protected onLoad(): void {
        this.tapArea?.on(Node.EventType.TOUCH_END, this.start_, this);
        this.creditsButton?.node.on(Button.EventType.CLICK, this.openCredits, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.removeBackHandler = backKey.push(() => this.onBack());
        void audio.playBgm('title');
        preloadForLobby();
        if (!launched) {
            launched = true;
            // 淡入期間黑幕擋住點按，按鍵由 fading 擋住
            this.fading = true;
            void ScreenFade.show(Color.BLACK, this.fadeInDuration, { blockInput: true }).then(() => (this.fading = false));
        }
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
        if (this.started || this.fading || popups.count > 0) return;
        this.started = true;
        void audio.playSfx('ui_click');
        setTimeout(() => void loadScene(this.nextScene), 500);
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
