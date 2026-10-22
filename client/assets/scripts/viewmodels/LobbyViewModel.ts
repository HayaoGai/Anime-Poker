import { Observable } from '../core/Observable';
import { ViewModel } from '../core/ViewModel';
import { tableStore } from '../models/TableStore';
import { gameClient, type ClientErrorCode } from '../net/GameClient';
import { leaveRoom } from '../net/RoomSession';
import { RoomName } from '../shared/constants';
import { RoomPhase, type RoomMetadata } from '../shared/protocol';

export interface RoomInfo extends RoomMetadata {
    roomId: string;
}

export type LobbyStatus = 'connecting' | 'online' | 'error';

interface ListedRoom {
    roomId: string;
    name: string;
    metadata?: RoomMetadata;
}

/**
 * 房間列表：加入伺服器的 LobbyRoom，即時接收房間的新增（+）、更新與移除（-）。
 */
export class LobbyViewModel extends ViewModel {
    readonly rooms = new Observable<RoomInfo[]>([]);
    readonly status = new Observable<LobbyStatus>('connecting');
    /** 建立或加入房間進行中（顯示載入遮罩、避免重複點擊） */
    readonly busy = new Observable(false);

    private lobby: Colyseus.Room | null = null;
    private readonly byId = new Map<string, RoomInfo>();
    private disposed = false;

    async connect(): Promise<void> {
        this.status.value = 'connecting';
        try {
            const lobby = await gameClient.joinLobby();
            if (this.disposed) {
                void leaveRoom(lobby);
                return;
            }
            this.lobby = lobby;
            lobby.onMessage('rooms', (rooms: ListedRoom[]) => {
                this.byId.clear();
                for (const room of rooms) this.upsert(room);
                this.publish();
            });
            lobby.onMessage('+', ([roomId, room]: [string, ListedRoom]) => {
                this.upsert({ ...room, roomId });
                this.publish();
            });
            lobby.onMessage('-', (roomId: string) => {
                this.byId.delete(roomId);
                this.publish();
            });
            lobby.onLeave(() => {
                if (!this.disposed) this.status.value = 'error';
            });
            this.status.value = 'online';
        } catch (err) {
            console.warn('[Lobby] 無法連線', err);
            if (!this.disposed) this.status.value = 'error';
        }
    }

    /** 建立房間並成為房主；失敗時回傳錯誤碼 */
    createRoom(): Promise<ClientErrorCode | null> {
        return this.enter(() => gameClient.createTable());
    }

    joinRoom(roomId: string, asSpectator: boolean): Promise<ClientErrorCode | null> {
        return this.enter(() => gameClient.joinTable(roomId, asSpectator));
    }

    dispose(): void {
        this.disposed = true;
        if (this.lobby) void leaveRoom(this.lobby);
        this.lobby = null;
        super.dispose();
    }

    private async enter(join: () => ReturnType<typeof gameClient.createTable>): Promise<ClientErrorCode | null> {
        if (this.busy.value) return null;
        this.busy.value = true;
        try {
            tableStore.attach(await join());
            return null;
        } catch (err) {
            return gameClient.errorCode(err);
        } finally {
            this.busy.value = false;
        }
    }

    private upsert(room: ListedRoom): void {
        if (room.name !== RoomName.Poker || !room.metadata?.hostNickname) return;
        this.byId.set(room.roomId, { roomId: room.roomId, ...room.metadata });
    }

    /** 大廳中的房間排前面，同狀態依參賽人數多寡排序 */
    private publish(): void {
        this.rooms.value = [...this.byId.values()].sort(
            (a, b) => Number(a.phase !== RoomPhase.Lobby) - Number(b.phase !== RoomPhase.Lobby) || b.players - a.players,
        );
    }
}
