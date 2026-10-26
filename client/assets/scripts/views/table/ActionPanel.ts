import { _decorator, Button, Label, Node, Slider } from 'cc';
import { audio } from '../../core/AudioManager';
import { ViewBase } from '../../core/ViewBase';
import { t } from '../../i18n/I18n';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import { nativeBridge } from '../../native/NativeBridge';
import type { LegalActions } from '../../shared/events';
import type { RaiseShortcuts, TableViewModel } from '../../viewmodels/TableViewModel';

const { ccclass, property, menu } = _decorator;

/**
 * 右下角的行動按鈕：棄牌、過牌／跟注、加注／ALL IN。
 * 加注：第一次點開啟加注面板（滑桿 + 最小／½ 池／1 池／ALL IN 快捷），按鈕顯示「加注到 X」，再點一次送出。
 * 節點在場景中預設為停用，輪到自己時才啟用（onLoad 也在第一次啟用時才執行）。
 */
@ccclass('ActionPanel')
@menu('AnimePoker/ActionPanel')
export class ActionPanel extends ViewBase {
    @property(Button)
    foldButton: Button | null = null;

    @property(Button)
    callButton: Button | null = null;

    @property(LocalizedLabel)
    callLabel: LocalizedLabel | null = null;

    @property(Button)
    raiseButton: Button | null = null;

    @property(LocalizedLabel)
    raiseLabel: LocalizedLabel | null = null;

    @property(Node)
    raisePanel: Node | null = null;

    @property(Slider)
    slider: Slider | null = null;

    @property(Label)
    amountLabel: Label | null = null;

    @property(Button)
    minButton: Button | null = null;

    @property(Button)
    halfPotButton: Button | null = null;

    @property(Button)
    potButton: Button | null = null;

    @property(Button)
    allInButton: Button | null = null;

    private vm: TableViewModel | null = null;
    private legal: LegalActions | null = null;
    private shortcuts: RaiseShortcuts | null = null;
    private raiseTo = 0;

    protected onLoad(): void {
        this.foldButton?.node.on(Button.EventType.CLICK, () => this.vm?.fold());
        this.callButton?.node.on(Button.EventType.CLICK, () => this.vm?.checkOrCall());
        this.raiseButton?.node.on(Button.EventType.CLICK, this.onRaise, this);
        this.slider?.node.on('slide', this.onSlide, this);
        const quick: [Button | null, (s: RaiseShortcuts) => number][] = [
            [this.minButton, (s) => s.min],
            [this.halfPotButton, (s) => s.halfPot],
            [this.potButton, (s) => s.pot],
            [this.allInButton, (s) => s.max],
        ];
        for (const [button, pick] of quick) {
            button?.node.on(Button.EventType.CLICK, () => {
                if (!this.shortcuts) return;
                void audio.playSfx('ui_click');
                this.setRaise(pick(this.shortcuts));
            });
        }
    }

    bindViewModel(vm: TableViewModel): void {
        this.vm = vm;
        this.bind(vm.legal, (legal) => this.show(legal));
    }

    private show(legal: LegalActions | null): void {
        this.legal = legal;
        this.node.active = !!legal;
        if (this.raisePanel) this.raisePanel.active = false;
        if (!legal || !this.vm) return;

        this.callLabel?.setKey(legal.canCheck ? 'table.check' : 'table.call', { amount: t('common.bb', { value: this.vm.bb(legal.callAmount) }) });
        if (this.raiseButton) this.raiseButton.node.active = legal.canRaise;
        if (legal.canRaise) {
            this.shortcuts = this.vm.raiseShortcuts(legal);
            this.raiseTo = legal.minRaiseTo;
            this.updateRaiseLabel(false);
        }
        nativeBridge.vibrate('turn');
    }

    private onRaise(): void {
        const legal = this.legal;
        if (!legal?.canRaise || !this.vm) return;
        // 只能 all-in（籌碼不足最小加注）時直接送出
        const panelOpen = this.raisePanel?.active ?? false;
        if (!panelOpen && legal.minRaiseTo < legal.maxRaiseTo) {
            if (this.raisePanel) this.raisePanel.active = true;
            this.setRaise(this.raiseTo);
            return;
        }
        this.vm.raiseTo(this.raiseTo);
    }

    private onSlide(slider: Slider): void {
        const legal = this.legal;
        if (!legal || !this.vm) return;
        const raw = legal.minRaiseTo + (legal.maxRaiseTo - legal.minRaiseTo) * slider.progress;
        // 以小盲為單位，畫面上的 BB 數值才會是 0.5 的倍數
        const step = this.vm.smallBlind;
        this.setRaise(Math.round(raw / step) * step, false);
    }

    private setRaise(amount: number, moveSlider = true): void {
        const legal = this.legal;
        if (!legal || !this.vm) return;
        this.raiseTo = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, amount));
        if (moveSlider && this.slider) {
            const span = legal.maxRaiseTo - legal.minRaiseTo;
            this.slider.progress = span > 0 ? (this.raiseTo - legal.minRaiseTo) / span : 1;
        }
        if (this.amountLabel) this.amountLabel.string = t('common.bb', { value: this.vm.bb(this.raiseTo) });
        this.updateRaiseLabel(this.raisePanel?.active ?? false);
    }

    private updateRaiseLabel(confirming: boolean): void {
        const legal = this.legal;
        if (!legal || !this.raiseLabel || !this.vm) return;
        const allIn = this.raiseTo >= legal.maxRaiseTo || legal.minRaiseTo >= legal.maxRaiseTo;
        if (allIn && (confirming || legal.minRaiseTo >= legal.maxRaiseTo)) this.raiseLabel.setKey('table.allIn');
        else if (confirming) this.raiseLabel.setKey('table.raiseTo', { amount: t('common.bb', { value: this.vm.bb(this.raiseTo) }) });
        else this.raiseLabel.setKey('table.raise');
    }
}
