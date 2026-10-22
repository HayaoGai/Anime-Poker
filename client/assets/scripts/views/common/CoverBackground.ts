import { _decorator, Component, screen, UITransform, view } from 'cc';

const { ccclass, menu, requireComponent } = _decorator;

/**
 * 背景圖以「覆蓋」方式填滿可視範圍（等比放大到沒有空白，超出部分裁切），
 * 搭配 ScreenAdapter 讓寬螢幕的兩側由背景延伸填滿。
 */
@ccclass('CoverBackground')
@menu('AnimePoker/CoverBackground')
@requireComponent(UITransform)
export class CoverBackground extends Component {
    protected onEnable(): void {
        this.fit();
        screen.on('window-resize', this.fit, this);
        view.on('design-resolution-changed', this.fit, this);
    }

    protected onDisable(): void {
        screen.off('window-resize', this.fit, this);
        view.off('design-resolution-changed', this.fit, this);
    }

    private fit(): void {
        const visible = view.getVisibleSize();
        const transform = this.getComponent(UITransform)!;
        const scale = Math.max(visible.width / transform.width, visible.height / transform.height);
        this.node.setScale(scale, scale, 1);
    }
}
