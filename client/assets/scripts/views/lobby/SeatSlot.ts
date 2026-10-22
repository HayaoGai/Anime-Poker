import { _decorator, Button, Component, Label, Node } from 'cc';
import type { SeatSnapshot } from '../../models/TableSnapshot';
import { AvatarImage } from '../common/AvatarImage';

const { ccclass, property, menu } = _decorator;

export interface SeatSlotOptions {
    isHost: boolean;
    isMe: boolean;
    /** 房主可在空位加入電腦、移除電腦 */
    canManageBots: boolean;
    /** 觀戰者可坐到空位 */
    canSit: boolean;
}

/** 房間大廳的一個座位 */
@ccclass('SeatSlot')
@menu('AnimePoker/SeatSlot')
export class SeatSlot extends Component {
    @property(Node)
    occupiedRoot: Node | null = null;

    @property(Node)
    emptyRoot: Node | null = null;

    @property(AvatarImage)
    avatar: AvatarImage | null = null;

    @property(Label)
    nickname: Label | null = null;

    @property(Node)
    hostBadge: Node | null = null;

    @property(Node)
    botBadge: Node | null = null;

    @property(Node)
    meMarker: Node | null = null;

    @property(Button)
    addBotButton: Button | null = null;

    @property(Button)
    removeBotButton: Button | null = null;

    @property(Button)
    sitButton: Button | null = null;

    onAddBot: (() => void) | null = null;
    onRemoveBot: (() => void) | null = null;
    onSit: (() => void) | null = null;

    protected onLoad(): void {
        this.addBotButton?.node.on(Button.EventType.CLICK, () => this.onAddBot?.());
        this.removeBotButton?.node.on(Button.EventType.CLICK, () => this.onRemoveBot?.());
        this.sitButton?.node.on(Button.EventType.CLICK, () => this.onSit?.());
    }

    show(seat: SeatSnapshot | undefined, options: SeatSlotOptions): void {
        const occupied = !!seat?.occupied;
        if (this.occupiedRoot) this.occupiedRoot.active = occupied;
        if (this.emptyRoot) this.emptyRoot.active = !occupied;

        if (occupied && seat) {
            this.avatar?.setAvatar(seat.avatarId);
            if (this.nickname) this.nickname.string = seat.nickname;
            if (this.hostBadge) this.hostBadge.active = options.isHost;
            if (this.botBadge) this.botBadge.active = seat.isBot;
            if (this.meMarker) this.meMarker.active = options.isMe;
            if (this.removeBotButton) this.removeBotButton.node.active = seat.isBot && options.canManageBots;
        } else {
            if (this.addBotButton) this.addBotButton.node.active = options.canManageBots;
            if (this.sitButton) this.sitButton.node.active = options.canSit;
        }
    }
}
