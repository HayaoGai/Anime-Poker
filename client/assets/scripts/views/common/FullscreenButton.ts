import { _decorator, Button, Component, Sprite, SpriteFrame } from 'cc';
import { audio } from '../../core/AudioManager';
import { eventBus } from '../../core/EventBus';
import { nativeBridge } from '../../native/NativeBridge';

const { ccclass, property, menu, requireComponent } = _decorator;

/**
 * 進入／退出全螢幕，圖示隨狀態切換（Web 的 Fullscreen API；狀態變化例如使用者按 Esc 由平台推送）。
 * 平台不支援時隱藏按鈕，並讓左邊的按鈕補上位置；Android 固定為沉浸式全螢幕，也不顯示。
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
            this.hideAndCollapse();
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

    /** 隱藏後，左邊的按鈕（語系）往右移一格，右上角不留空位 */
    private hideAndCollapse(): void {
        this.node.active = false;
        const x = this.node.position.x;
        const left = (this.node.parent?.children ?? []).filter((n) => n !== this.node && n.position.x < x);
        if (!left.length) return;
        const shift = x - Math.max(...left.map((n) => n.position.x));
        for (const n of left) n.setPosition(n.position.x + shift, n.position.y, n.position.z);
    }

    private refresh(fullscreen: boolean): void {
        if (this.icon) this.icon.spriteFrame = fullscreen ? this.exitFrame : this.enterFrame;
    }
}
