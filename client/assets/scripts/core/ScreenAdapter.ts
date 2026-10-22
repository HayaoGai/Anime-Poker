import { _decorator, Component, ResolutionPolicy, screen, view } from 'cc';

const { ccclass, menu, executionOrder } = _decorator;

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

/**
 * 依螢幕比例切換適配策略，讓 1920×1080 的設計範圍永遠完整可見：
 *   - 比 16:9 寬（多數手機）：固定高度，左右多出的範圍由背景圖延伸填滿
 *   - 比 16:9 窄（平板、直立視窗）：固定寬度，上下延伸
 * 四個角落的按鈕以 Widget 貼齊實際螢幕邊緣（再經 SafeArea 避開瀏海）。
 */
@ccclass('ScreenAdapter')
@menu('AnimePoker/ScreenAdapter')
@executionOrder(-999)
export class ScreenAdapter extends Component {
    protected onLoad(): void {
        this.apply();
        screen.on('window-resize', this.apply, this);
        screen.on('orientation-change', this.apply, this);
    }

    protected onDestroy(): void {
        screen.off('window-resize', this.apply, this);
        screen.off('orientation-change', this.apply, this);
    }

    private apply(): void {
        const { width, height } = screen.windowSize;
        const wide = width / height >= DESIGN_WIDTH / DESIGN_HEIGHT;
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, wide ? ResolutionPolicy.FIXED_HEIGHT : ResolutionPolicy.FIXED_WIDTH);
    }
}
