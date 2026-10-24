import { _decorator, Button, Color, Component, Node, Sprite, Tween, tween, Vec3 } from 'cc';
import { audio } from '../../core/AudioManager';

const { ccclass, property, menu } = _decorator;

/**
 * 開關：點按切換開／關，底色與圓鈕位置隨之改變。
 * 掛在含 Button 的節點上（沿用全域的按鈕回饋與游標）；底圖與圓鈕都是白色圖片，以 Sprite 顏色著色。
 */
@ccclass('SwitchToggle')
@menu('AnimePoker/SwitchToggle')
export class SwitchToggle extends Component {
    @property(Sprite)
    track: Sprite | null = null;

    @property(Node)
    knob: Node | null = null;

    @property(Color)
    onColor = new Color(111, 220, 191, 255);

    @property(Color)
    offColor = new Color(201, 195, 214, 255);

    @property({ tooltip: '圓鈕離中心的水平距離（開在右、關在左）' })
    knobOffset = 30;

    /** 玩家切換時呼叫（setValue 不會觸發） */
    onChange: ((value: boolean) => void) | null = null;

    private _value = true;

    get value(): boolean {
        return this._value;
    }

    setValue(value: boolean, animate = false): void {
        this._value = value;
        if (this.track) this.track.color = value ? this.onColor : this.offColor;
        if (!this.knob) return;
        const target = new Vec3(value ? this.knobOffset : -this.knobOffset, this.knob.position.y, 0);
        Tween.stopAllByTarget(this.knob);
        if (animate) tween(this.knob).to(0.12, { position: target }, { easing: 'quadOut' }).start();
        else this.knob.setPosition(target);
    }

    protected onLoad(): void {
        this.setValue(this._value);
        this.node.on(Button.EventType.CLICK, this.toggle, this);
    }

    protected onDestroy(): void {
        if (this.knob) Tween.stopAllByTarget(this.knob);
    }

    private toggle(): void {
        this.setValue(!this._value, true);
        this.onChange?.(this._value);
        // 先套用設定再播放：關閉音效時不出聲，開啟音效時立即聽到
        void audio.playSfx('ui_click');
    }
}
