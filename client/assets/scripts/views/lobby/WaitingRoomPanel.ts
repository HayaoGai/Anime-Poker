import { _decorator, Button, Node, Sprite } from 'cc';
import { audio } from '../../core/AudioManager';
import type { ReadonlyObservable } from '../../core/Observable';
import { ViewBase } from '../../core/ViewBase';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import { tableStore } from '../../models/TableStore';
import type { RoomViewModel } from '../../viewmodels/RoomViewModel';
import { SeatSlot } from './SeatSlot';

const { ccclass, property, menu } = _decorator;

/** 房間大廳：6 個座位、觀戰人數、開始遊戲（房主）、離開房間 */
@ccclass('WaitingRoomPanel')
@menu('AnimePoker/WaitingRoomPanel')
export class WaitingRoomPanel extends ViewBase {
    @property(LocalizedLabel)
    title: LocalizedLabel | null = null;

    @property([SeatSlot])
    seats: SeatSlot[] = [];

    @property(LocalizedLabel)
    spectators: LocalizedLabel | null = null;

    @property(Button)
    startButton: Button | null = null;

    @property({ type: Node, tooltip: '非房主看到的「等待房主開始」' })
    waitingHint: Node | null = null;

    @property({ type: Node, tooltip: '房主人數不足時的提示' })
    needPlayersHint: Node | null = null;

    @property(Button)
    leaveButton: Button | null = null;

    onLeave: (() => void) | null = null;

    private vm: RoomViewModel | null = null;

    protected onLoad(): void {
        this.leaveButton?.node.on(Button.EventType.CLICK, () => this.onLeave?.());
        this.startButton?.node.on(Button.EventType.CLICK, () => {
            void audio.playSfx('ui_click');
            this.vm?.start();
        });
        this.seats.forEach((slot, index) => {
            slot.onAddBot = () => {
                void audio.playSfx('ui_click');
                this.vm?.addBot(index);
            };
            slot.onRemoveBot = () => this.vm?.removeBot(index);
            slot.onSit = () => this.vm?.sit(index);
        });
    }

    bindViewModel(vm: RoomViewModel): void {
        // 離開房間再加入另一個房間時，先解除對上一個 ViewModel 的綁定
        this.bindings.dispose();
        this.vm = vm;
        this.bind(vm.hostName, (host) => this.title?.setKey('lobby.roomName', { host }));
        this.bind(vm.spectatorCount, (count) => this.spectators?.setKey('lobby.spectators', { count }));
        const render = () => this.render(vm);
        for (const source of [vm.seats, vm.isHost, vm.isSpectator, vm.canStart] as ReadonlyObservable<unknown>[]) this.bind(source, render);
    }

    private render(vm: RoomViewModel): void {
        const snapshot = tableStore.snapshot.value;
        const hostId = snapshot?.hostSessionId ?? '';
        const isHost = vm.isHost.value;
        this.seats.forEach((slot, index) => {
            const seat = vm.seats.value[index];
            slot.show(seat, {
                isHost: !!seat?.occupied && seat.sessionId === hostId,
                isMe: !!seat?.occupied && seat.sessionId === tableStore.sessionId,
                canManageBots: isHost,
                canSit: vm.isSpectator.value,
            });
        });

        if (this.startButton) {
            this.startButton.node.active = isHost;
            this.startButton.interactable = vm.canStart.value;
            const sprite = this.startButton.getComponent(Sprite);
            if (sprite) sprite.grayscale = !vm.canStart.value;
        }
        if (this.needPlayersHint) this.needPlayersHint.active = isHost && !vm.canStart.value;
        if (this.waitingHint) this.waitingHint.active = !isHost;
    }
}
