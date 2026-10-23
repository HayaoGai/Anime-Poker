import { _decorator, Button, instantiate, Node, Prefab } from 'cc';
import { ViewBase } from '../../core/ViewBase';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import type { LobbyViewModel, RoomInfo } from '../../viewmodels/LobbyViewModel';
import { RoomItem } from './RoomItem';

const { ccclass, property, menu } = _decorator;

/**
 * 房間列表：以 RoomItem Prefab 填入 ScrollView，並顯示連線狀態與空列表提示。
 * 「建立房間」與「離線對戰」常駐顯示：建立房間只在連上伺服器時能點，離線對戰不論連線狀態都能點；處理中兩者都不能點。
 */
@ccclass('RoomListPanel')
@menu('AnimePoker/RoomListPanel')
export class RoomListPanel extends ViewBase {
    @property({ type: Node, tooltip: 'ScrollView 的 content（Layout 垂直排列）' })
    content: Node | null = null;

    @property(Prefab)
    itemPrefab: Prefab | null = null;

    @property(Button)
    createButton: Button | null = null;

    @property(Button)
    offlineButton: Button | null = null;

    @property({ type: LocalizedLabel, tooltip: '連線中、連線失敗、沒有房間的提示' })
    hint: LocalizedLabel | null = null;

    @property(Button)
    retryButton: Button | null = null;

    onCreate: (() => void) | null = null;
    onOffline: (() => void) | null = null;
    onJoin: ((roomId: string, asSpectator: boolean) => void) | null = null;
    onRetry: (() => void) | null = null;

    private readonly items = new Map<string, RoomItem>();

    protected onLoad(): void {
        this.createButton?.node.on(Button.EventType.CLICK, () => this.onCreate?.());
        this.offlineButton?.node.on(Button.EventType.CLICK, () => this.onOffline?.());
        this.retryButton?.node.on(Button.EventType.CLICK, () => this.onRetry?.());
    }

    bindViewModel(vm: LobbyViewModel): void {
        const refresh = () => this.renderStatus(vm);
        this.bind(vm.rooms, (rooms) => {
            this.renderRooms(rooms);
            refresh();
        });
        this.bind(vm.status, refresh);
        this.bind(vm.busy, refresh);
    }

    private renderRooms(rooms: RoomInfo[]): void {
        if (!this.content || !this.itemPrefab) return;
        const keep = new Set(rooms.map((r) => r.roomId));
        this.items.forEach((item, id) => {
            if (!keep.has(id)) {
                item.node.destroy();
                this.items.delete(id);
            }
        });
        rooms.forEach((room, index) => {
            let item = this.items.get(room.roomId);
            if (!item) {
                const node = instantiate(this.itemPrefab!);
                this.content!.addChild(node);
                item = node.getComponent(RoomItem)!;
                item.onJoin = (asSpectator) => this.onJoin?.(room.roomId, asSpectator);
                this.items.set(room.roomId, item);
            }
            item.node.setSiblingIndex(index);
            item.show(room);
        });
    }

    /** 連線狀態：提示文字、重試按鈕，以及建立房間與離線對戰能不能點 */
    private renderStatus(vm: LobbyViewModel): void {
        const status = vm.status.value;
        const empty = vm.rooms.value.length === 0;
        if (this.hint) {
            this.hint.node.active = status !== 'online' || empty;
            this.hint.setKey(status === 'connecting' ? 'common.loading' : status === 'error' ? 'common.connectFailed' : 'lobby.empty');
        }
        if (this.retryButton) this.retryButton.node.active = status === 'error';
        if (this.createButton) this.createButton.interactable = status === 'online' && !vm.busy.value;
        if (this.offlineButton) this.offlineButton.interactable = !vm.busy.value;
    }
}
