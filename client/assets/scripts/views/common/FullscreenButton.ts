import { _decorator, Button, Component, Sprite, SpriteFrame } from 'cc';
import { audio } from '../../core/AudioManager';
import { eventBus } from '../../core/EventBus';
import { nativeBridge } from '../../native/NativeBridge';

const { ccclass, property, menu, requireComponent } = _decorator;

/**
 * 進入／退出全螢幕，圖示隨狀態切換。Web 使用 Fullscreen API，Android 使用沉浸式模式；
 * 平台不支援時隱藏按鈕。狀態變化（例如使用者按 Esc 或從邊緣滑出系統列）由平台推送。
 */
@ccclass('FullscreenButton')
@menu('AnimePoker/FullscreenButton')
@requireComponent(Button)
export class FullscreenButton extends Component {
    @property(Sprite)
    icon: Sprite | null = null;

    @property(SpriteFrame)
    enterFrame: SpriteFrame | null = null;

    @property(SpriteFrame)
    exitFrame: SpriteFrame | null = null;

    private off: (() => void) | null = null;

    protected onLoad(): void {
        if (!nativeBridge.supportsFullscreen) {
            this.node.active = false;
            return;
        }
        this.node.on(Button.EventType.CLICK, this.toggle, this);
        this.off = eventBus.on('fullscreenChanged', (on) => this.refresh(on));
        this.refresh(nativeBridge.isFullscreen());
    }

    protected onDestroy(): void {
        this.off?.();
    }

    private toggle(): void {
        void audio.playSfx('ui_click');
        nativeBridge.vibrate('light');
        void nativeBridge.setFullscreen(!nativeBridge.isFullscreen());
    }

    private refresh(fullscreen: boolean): void {
        if (this.icon) this.icon.spriteFrame = fullscreen ? this.exitFrame : this.enterFrame;
    }
}
