import { _decorator, director, Node, Prefab } from 'cc';
import { audio } from '../../core/AudioManager';
import { backKey } from '../../core/BackKey';
import { popups } from '../../core/PopupManager';
import { toast } from '../../core/Toast';
import { ViewBase } from '../../core/ViewBase';
import { i18n } from '../../i18n/I18n';
import { profile } from '../../models/ProfileModel';
import { tableStore } from '../../models/TableStore';
import { ServerMessage, RoomPhase } from '../../shared/protocol';
import { LobbyViewModel } from '../../viewmodels/LobbyViewModel';
import { RoomViewModel } from '../../viewmodels/RoomViewModel';
import { ProfileBadge } from '../common/ProfileBadge';
import { ProfilePopup } from './ProfilePopup';
import { RoomListPanel } from './RoomListPanel';
import { WaitingRoomPanel } from './WaitingRoomPanel';

const { ccclass, property, menu } = _decorator;

/**
 * Lobby 場景：首次設定暱稱與頭像 → 房間列表 → 房間大廳；房主開始遊戲後進入 Table 場景。
 * 離線對戰同樣進入房間大廳（自己是房主），之後的流程與連線房間相同。
 * 返回鍵：房間大廳 → 離開房間回到列表；列表 → 回到 Title。
 */
@ccclass('LobbyView')
@menu('AnimePoker/LobbyView')
export class LobbyView extends ViewBase {
    @property(RoomListPanel)
    listPanel: RoomListPanel | null = null;

    @property(WaitingRoomPanel)
    roomPanel: WaitingRoomPanel | null = null;

    @property(ProfileBadge)
    profileBadge: ProfileBadge | null = null;

    @property({ type: Node, tooltip: '建立／加入房間時的載入遮罩' })
    loading: Node | null = null;

    @property(Prefab)
    profilePopup: Prefab | null = null;

    @property(Prefab)
    toastPrefab: Prefab | null = null;

    private lobby: LobbyViewModel | null = null;
    private room: RoomViewModel | null = null;
    private roomBindings: (() => void)[] = [];
    private leavingScene = false;

    protected onLoad(): void {
        toast.register(this.toastPrefab);
        if (this.profileBadge) this.profileBadge.onClick = () => this.editProfile(false);
        this.bindings.add(backKey.push(() => this.onBack()));

        const list = this.listPanel;
        if (list) {
            list.onCreate = () => void this.enter(() => this.lobby!.createRoom());
            list.onOffline = () => void this.enter(async () => this.lobby!.playOffline());
            list.onJoin = (roomId, asSpectator) => void this.enter(() => this.lobby!.joinRoom(roomId, asSpectator));
            list.onRetry = () => {
                void audio.playSfx('ui_click');
                void this.lobby?.connect();
            };
        }
        if (this.roomPanel) this.roomPanel.onLeave = () => void this.leaveRoom();

        this.lobby = new LobbyViewModel();
        this.bindings.add(this.lobby);
        list?.bindViewModel(this.lobby);
        this.bind(this.lobby.busy, (busy) => this.loading && (this.loading.active = busy));
    }

    protected start(): void {
        // 首次進入：必須先設定暱稱與頭像
        if (!profile.isComplete.value) {
            void this.editProfile(true).then(() => this.afterProfileReady());
        } else {
            this.afterProfileReady();
        }
    }

    protected onDestroy(): void {
        this.unbindRoom();
        super.onDestroy();
    }

    private afterProfileReady(): void {
        // 從 Table 場景回來（比賽結束回到房間大廳）時仍在房間中
        if (tableStore.session) this.showRoom();
        else this.showList();
        void this.lobby?.connect();
    }

    private editProfile(forced: boolean): Promise<boolean | undefined> {
        if (!this.profilePopup) return Promise.resolve(undefined);
        return popups.show<boolean, ProfilePopup>(this.profilePopup, (popup) => popup.setup({ forced }));
    }

    private async enter(join: () => Promise<string | null>): Promise<void> {
        void audio.playSfx('ui_click');
        const error = await join();
        if (error) {
            toast.show(i18n.tCode('error', error));
            return;
        }
        this.showRoom();
    }

    private showList(): void {
        this.unbindRoom();
        if (this.listPanel) this.listPanel.node.active = true;
        if (this.roomPanel) this.roomPanel.node.active = false;
        if (this.profileBadge) this.profileBadge.node.active = true;
        void audio.playBgm('room_list');
    }

    private showRoom(): void {
        const session = tableStore.session;
        if (!session) return this.showList();
        this.unbindRoom();

        this.room = new RoomViewModel();
        if (this.listPanel) this.listPanel.node.active = false;
        if (this.roomPanel) {
            this.roomPanel.node.active = true;
            this.roomPanel.bindViewModel(this.room);
        }
        // 在房間中不能修改暱稱與頭像（加入房間時已送出）
        if (this.profileBadge) this.profileBadge.node.active = false;
        void audio.playBgm('room');

        this.roomBindings.push(
            session.on(ServerMessage.Notice, ({ code, nickname }) => toast.show(i18n.tCode('notice', code, { name: nickname ?? '' }))),
            session.on(ServerMessage.Error, ({ code }) => toast.show(i18n.tCode('error', code))),
            // 房主開始遊戲（或加入時遊戲已在進行中）→ 進入牌桌
            tableStore.snapshot.subscribe((snapshot) => snapshot?.phase === RoomPhase.Playing && this.gotoTable()),
            // 房間解散或連線中斷
            session.connection.subscribe((state) => state === 'closed' && !this.leavingScene && this.showList(), false),
        );
    }

    private unbindRoom(): void {
        for (const unbind of this.roomBindings) unbind();
        this.roomBindings = [];
        this.room?.dispose();
        this.room = null;
    }

    private async leaveRoom(): Promise<void> {
        void audio.playSfx('ui_click');
        await this.room?.leave();
        this.showList();
    }

    private gotoTable(): void {
        if (this.leavingScene) return;
        this.leavingScene = true;
        director.loadScene('Table');
    }

    private onBack(): boolean {
        if (tableStore.session) {
            void this.leaveRoom();
        } else {
            this.leavingScene = true;
            director.loadScene('Title');
        }
        return true;
    }
}
