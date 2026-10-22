import { _decorator, Button, Color, Component, Label, Sprite } from 'cc';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import { RoomPhase } from '../../shared/protocol';
import type { RoomInfo } from '../../viewmodels/LobbyViewModel';

const { ccclass, property, menu } = _decorator;

/** 房間列表的一列：房名、狀態、人數，以及「參賽」（滿人時變暗不能點）、「觀戰」按鈕 */
@ccclass('RoomItem')
@menu('AnimePoker/RoomItem')
export class RoomItem extends Component {
    @property(LocalizedLabel)
    roomName: LocalizedLabel | null = null;

    @property(LocalizedLabel)
    status: LocalizedLabel | null = null;

    @property(Sprite)
    statusBadge: Sprite | null = null;

    @property(Label)
    players: Label | null = null;

    @property(LocalizedLabel)
    spectators: LocalizedLabel | null = null;

    @property(Button)
    joinButton: Button | null = null;

    @property(Button)
    spectateButton: Button | null = null;

    onJoin: ((asSpectator: boolean) => void) | null = null;

    protected onLoad(): void {
        this.joinButton?.node.on(Button.EventType.CLICK, () => this.onJoin?.(false));
        this.spectateButton?.node.on(Button.EventType.CLICK, () => this.onJoin?.(true));
    }

    show(room: RoomInfo): void {
        this.roomName?.setKey('lobby.roomName', { host: room.hostNickname });
        const playing = room.phase === RoomPhase.Playing;
        this.status?.setKey(playing ? 'lobby.statusPlaying' : 'lobby.statusLobby');
        if (this.statusBadge) this.statusBadge.color = new Color().fromHEX(playing ? '#e8436f' : '#2fae8c');
        if (this.players) this.players.string = `${room.players} / ${room.maxPlayers}`;
        this.spectators?.setKey('lobby.spectators', { count: room.spectators });

        const full = room.players >= room.maxPlayers;
        if (this.joinButton) {
            this.joinButton.interactable = !full;
            const sprite = this.joinButton.getComponent(Sprite);
            if (sprite) sprite.grayscale = full;
        }
    }
}
