import { serverUrl } from '../config/Env';
import { profile } from '../models/ProfileModel';
import { RoomName } from '../shared/constants';
import { ErrorCode } from '../shared/errors';
import type { JoinOptions } from '../shared/protocol';
import { RoomSession } from './RoomSession';
import { installWebPolyfills } from './webPolyfills';

/** 客戶端自己產生的錯誤碼（伺服器的 ErrorCode 以外） */
export type ClientErrorCode = ErrorCode | 'ROOM_NOT_FOUND' | 'NETWORK';

// Colyseus 在 Cocos 原生環境需要的 Web API；瀏覽器上不會覆蓋原生實作
installWebPolyfills();

/** Colyseus matchmaking 的錯誤碼（@colyseus/shared-types）：房間不存在、座位保留逾時 */
const MATCHMAKE_INVALID_ROOM_ID = 522;
const MATCHMAKE_EXPIRED = 524;
/** 伺服器 onJoin 拒絕時使用的錯誤碼（見 server PokerRoom），message 為 ErrorCode；server/test/clientBundle.test.ts 驗證 */
const JOIN_REJECTED = 4000;

/**
 * 與伺服器的連線入口：房間列表（LobbyRoom）與牌桌房間（PokerRoom）。
 */
class GameClientService {
    private client: Colyseus.Client | null = null;

    private get sdk(): Colyseus.Client {
        return (this.client ??= new Colyseus.Client(serverUrl()));
    }

    /** 房間列表：伺服器會即時推送 rooms / + / - 訊息 */
    async joinLobby(): Promise<Colyseus.Room> {
        return this.sdk.joinOrCreate(RoomName.Lobby);
    }

    async createTable(): Promise<RoomSession> {
        return new RoomSession(await this.sdk.create(RoomName.Poker, this.joinOptions(false)), { timeSync: true });
    }

    async joinTable(roomId: string, asSpectator: boolean): Promise<RoomSession> {
        return new RoomSession(await this.sdk.joinById(roomId, this.joinOptions(asSpectator)), { timeSync: true });
    }

    /** 把 SDK 拋出的錯誤轉成可翻譯的錯誤碼 */
    errorCode(err: unknown): ClientErrorCode {
        const { code, message } = (err ?? {}) as { code?: number; message?: string };
        if (code === JOIN_REJECTED && message && (Object.values(ErrorCode) as string[]).includes(message)) return message as ErrorCode;
        if (code === MATCHMAKE_INVALID_ROOM_ID || code === MATCHMAKE_EXPIRED) return 'ROOM_NOT_FOUND';
        return 'NETWORK';
    }

    private joinOptions(asSpectator: boolean): JoinOptions {
        return { playerId: profile.playerId, nickname: profile.nickname.value, avatarId: profile.avatarId.value, asSpectator };
    }
}

export const gameClient = new GameClientService();
