import { _decorator, Animation, Component, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { audio } from './AudioManager';
import { backKey } from './BackKey';

const { ccclass, property, menu } = _decorator;

/**
 * 彈窗基底，掛在彈窗 Prefab 的根節點。Prefab 內自帶遮罩與面板節點（所見即所得）。
 *
 * 開關動畫：若有 Animation 元件且含 popup_open / popup_close 片段就播放 AnimationClip，
 * 否則以 Tween 做縮放淡入淡出。
 */
@ccclass('PopupBase')
@menu('AnimePoker/PopupBase')
export class PopupBase<TResult = void> extends Component {
    @property({ type: Node, tooltip: '半透明遮罩，點擊可關閉（依 closeOnMask）' })
    mask: Node | null = null;

    @property({ type: Node, tooltip: '彈窗主體，開關動畫作用在此節點' })
    panel: Node | null = null;

    @property({ type: Animation, tooltip: '可選：含 popup_open / popup_close 片段' })
    animation: Animation | null = null;

    @property({ tooltip: '點遮罩關閉' })
    closeOnMask = true;

    @property({ tooltip: '返回鍵關閉；必填的彈窗（例如首次設定暱稱）應關閉此選項' })
    closeOnBack = true;

    private resolveClose: ((result: TResult | undefined) => void) | null = null;
    private removeBackHandler: (() => void) | null = null;
    private closing = false;

    /** 由 PopupManager 呼叫 */
    open(): Promise<TResult | undefined> {
        this.mask?.on(Node.EventType.TOUCH_END, this.onMaskTouched, this);
        // 彈窗開啟時，返回鍵一律由彈窗攔截，不會傳到底下的場景
        this.removeBackHandler = backKey.push(() => {
            if (this.closeOnBack) this.close();
            return true;
        });
        void audio.playSfx('ui_open');
        this.playOpen();
        return new Promise((resolve) => (this.resolveClose = resolve));
    }

    close(result?: TResult): void {
        if (this.closing) return;
        this.closing = true;
        this.removeBackHandler?.();
        this.removeBackHandler = null;
        void audio.playSfx('ui_close');
        this.playClose(() => {
            this.resolveClose?.(result);
            this.resolveClose = null;
            this.node.destroy();
        });
    }

    protected onDestroy(): void {
        // 場景切換等原因被直接銷毀時也要釋放返回鍵與等待中的 Promise
        this.removeBackHandler?.();
        this.resolveClose?.(undefined);
        if (this.panel) Tween.stopAllByTarget(this.panel);
    }

    private onMaskTouched(): void {
        if (this.closeOnMask) this.close();
    }

    private playOpen(): void {
        if (this.animation?.getState('popup_open')) {
            this.animation.play('popup_open');
            return;
        }
        if (!this.panel) return;
        const opacity = this.mask?.getComponent(UIOpacity) ?? this.mask?.addComponent(UIOpacity);
        if (opacity) {
            opacity.opacity = 0;
            tween(opacity).to(0.18, { opacity: 255 }).start();
        }
        this.panel.setScale(0.6, 0.6, 1);
        tween(this.panel).to(0.28, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    }

    private playClose(done: () => void): void {
        if (this.animation?.getState('popup_close')) {
            this.animation.once(Animation.EventType.FINISHED, done);
            this.animation.play('popup_close');
            return;
        }
        if (!this.panel) {
            done();
            return;
        }
        const opacity = this.mask?.getComponent(UIOpacity);
        if (opacity) tween(opacity).to(0.15, { opacity: 0 }).start();
        tween(this.panel)
            .to(0.15, { scale: new Vec3(0.7, 0.7, 1) }, { easing: 'quadIn' })
            .call(done)
            .start();
    }
}
