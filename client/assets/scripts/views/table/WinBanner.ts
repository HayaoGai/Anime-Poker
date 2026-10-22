import { _decorator, Animation, Button, Component, Node, ParticleSystem2D } from 'cc';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';

const { ccclass, property, menu } = _decorator;

/** 比賽結束的勝利橫幅：AnimationClip（win_banner）+ 彩帶與愛心粒子，可分享戰績 */
@ccclass('WinBanner')
@menu('AnimePoker/WinBanner')
export class WinBanner extends Component {
    @property(LocalizedLabel)
    title: LocalizedLabel | null = null;

    @property(Animation)
    animation: Animation | null = null;

    @property([ParticleSystem2D])
    particles: ParticleSystem2D[] = [];

    @property(Button)
    shareButton: Button | null = null;

    @property(Node)
    glow: Node | null = null;

    onShare: (() => void) | null = null;

    // 節點在場景中預設為停用，show() 時才啟用
    protected onLoad(): void {
        this.shareButton?.node.on(Button.EventType.CLICK, () => this.onShare?.());
    }

    show(winnerName: string, isMe: boolean, canShare: boolean): void {
        this.node.active = true;
        if (isMe) this.title?.setKey('table.youWin');
        else this.title?.setKey('table.gameOver', { name: winnerName });
        if (this.shareButton) this.shareButton.node.active = isMe && canShare;
        this.animation?.play('win_banner');
        for (const p of this.particles) p.resetSystem();
    }

    hide(): void {
        this.node.active = false;
        for (const p of this.particles) p.stopSystem();
    }
}
