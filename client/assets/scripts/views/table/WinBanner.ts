import { _decorator, Animation, Button, Component, Node, ParticleSystem2D } from 'cc';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';

const { ccclass, property, menu } = _decorator;

/**
 * 比賽結束的結算橫幅：AnimationClip（win_banner）+ 彩帶與愛心粒子。
 * 房間已解散，橫幅會一直停留：贏家可以慢慢分享戰績，所有人自行按「返回大廳」離開。
 */
@ccclass('WinBanner')
@menu('AnimePoker/WinBanner')
export class WinBanner extends Component {
    @property(LocalizedLabel)
    title: LocalizedLabel | null = null;

    @property(Animation)
    animation: Animation | null = null;

    @property([ParticleSystem2D])
    particles: ParticleSystem2D[] = [];

    @property({ type: Node, tooltip: '按鈕列（Layout），分享截圖時整列隱藏' })
    buttons: Node | null = null;

    @property(Button)
    shareButton: Button | null = null;

    @property(Button)
    leaveButton: Button | null = null;

    @property(Node)
    glow: Node | null = null;

    onShare: (() => void) | null = null;
    onLeave: (() => void) | null = null;

    // 節點在場景中預設為停用，show() 時才啟用
    protected onLoad(): void {
        this.shareButton?.node.on(Button.EventType.CLICK, () => this.onShare?.());
        this.leaveButton?.node.on(Button.EventType.CLICK, () => this.onLeave?.());
    }

    /** winnerName 為空字串代表沒有唯一贏家（真人參賽者都輸光或離座） */
    show(winnerName: string, isMe: boolean, canShare: boolean): void {
        this.node.active = true;
        if (isMe) this.title?.setKey('table.youWin');
        else if (winnerName) this.title?.setKey('table.gameOver', { name: winnerName });
        else this.title?.setKey('table.gameEnded');
        if (this.shareButton) this.shareButton.node.active = isMe && canShare;
        this.animation?.play('win_banner');
        for (const p of this.particles) p.resetSystem();
    }

    hide(): void {
        this.node.active = false;
        for (const p of this.particles) p.stopSystem();
    }
}
