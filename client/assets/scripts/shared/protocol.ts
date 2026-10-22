// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/protocol.ts，執行 pnpm sync:shared 更新。
/**
 * 客戶端與伺服器之間的訊息協定。
 * 原則：客戶端只送「意圖」，伺服器驗證後廣播結果；所有狀態以伺服器為準。
 */
import type { Card } from './cards';
import type { ErrorCode } from './errors';
import type { HandEvent, LegalActions } from './events';
import type { PlayerAction } from './poker';

export const RoomPhase = {
    /** 房間大廳：等待房主開始，可增減電腦 */
    Lobby: 'lobby',
    Playing: 'playing',
} as const;
export type RoomPhase = (typeof RoomPhase)[keyof typeof RoomPhase];

/** 建立或加入牌桌房間時帶的參數 */
export interface JoinOptions {
    /** 首次啟動時產生並存在 localStorage 的 UUID，用於辨識同一位玩家 */
    playerId: string;
    nickname: string;
    avatarId: string;
    /** true 為觀戰，否則參賽；建立房間者一律參賽 */
    asSpectator?: boolean;
}

/** 房間列表（LobbyRoom）上每個房間的資訊 */
export interface RoomMetadata {
    hostNickname: string;
    phase: RoomPhase;
    /** 參賽人數（含電腦） */
    players: number;
    maxPlayers: number;
    spectators: number;
}

// ---------------------------------------------------------------- 客戶端 → 伺服器

export const ClientMessage = {
    Action: 'action',
    AddBot: 'addBot',
    RemoveBot: 'removeBot',
    StartGame: 'startGame',
    /** 觀戰者坐下參賽 */
    Sit: 'sit',
    /** 參賽者改為觀戰 */
    StandUp: 'standUp',
    TimeSync: 'timeSync',
} as const;
export type ClientMessage = (typeof ClientMessage)[keyof typeof ClientMessage];

export interface ClientPayloads {
    [ClientMessage.Action]: PlayerAction;
    /** seat 省略時自動挑選空位 */
    [ClientMessage.AddBot]: { seat?: number };
    [ClientMessage.RemoveBot]: { seat: number };
    [ClientMessage.StartGame]: Record<string, never>;
    /** seat 省略時自動挑選空位 */
    [ClientMessage.Sit]: { seat?: number };
    [ClientMessage.StandUp]: Record<string, never>;
    [ClientMessage.TimeSync]: { clientTime: number };
}

// ---------------------------------------------------------------- 伺服器 → 客戶端

export const ServerMessage = {
    /** 廣播：牌局事件，客戶端依序播放動畫 */
    HandEvent: 'handEvent',
    /** 私訊：自己的底牌 */
    HoleCards: 'holeCards',
    /** 私訊：輪到自己，附上合法動作 */
    YourTurn: 'yourTurn',
    /** 私訊：操作被拒絕 */
    Error: 'error',
    /** 廣播或私訊：房間通知 */
    Notice: 'notice',
    /** 私訊：回應時間校正 */
    TimeSync: 'timeSync',
    /** 廣播：比賽結束，只剩一位參賽者有籌碼 */
    GameOver: 'gameOver',
} as const;
export type ServerMessage = (typeof ServerMessage)[keyof typeof ServerMessage];

export const NoticeCode = {
    PlayerJoined: 'PLAYER_JOINED',
    PlayerLeft: 'PLAYER_LEFT',
    HostChanged: 'HOST_CHANGED',
    /** 電腦籌碼輸光，被迫離桌 */
    BotBusted: 'BOT_BUSTED',
    /** 私訊：自己籌碼輸光，轉為觀戰 */
    Eliminated: 'ELIMINATED',
    /** 私訊：參賽時牌桌已滿，改以觀戰加入 */
    SeatedAsSpectator: 'SEATED_AS_SPECTATOR',
    /** 私訊：遊戲進行中坐下，下一手開始參賽 */
    WaitingNextHand: 'WAITING_NEXT_HAND',
    /** 牌桌上已沒有真人參賽者，房間解散 */
    RoomDissolved: 'ROOM_DISSOLVED',
} as const;
export type NoticeCode = (typeof NoticeCode)[keyof typeof NoticeCode];

export interface ServerPayloads {
    /** timedOut 為 true 代表此動作是逾時後由伺服器代為執行 */
    [ServerMessage.HandEvent]: HandEvent & { handNumber: number; timedOut?: boolean };
    [ServerMessage.HoleCards]: { handNumber: number; cards: Card[] };
    /** deadline 為伺服器時間（epoch ms） */
    [ServerMessage.YourTurn]: { legal: LegalActions; deadline: number };
    [ServerMessage.Error]: { code: ErrorCode };
    [ServerMessage.Notice]: { code: NoticeCode; nickname?: string };
    [ServerMessage.TimeSync]: { clientTime: number; serverTime: number };
    [ServerMessage.GameOver]: { winnerSeat: number; nickname: string };
}

// ---------------------------------------------------------------- 驗證

export const NICKNAME_MAX_LENGTH = 12;
export const PLAYER_ID_PATTERN = /^[0-9a-zA-Z-]{8,64}$/;
export const AVATAR_ID_PATTERN = /^[a-z0-9_-]{1,32}$/;

/** 預設頭像（客戶端 avatars.json 的 id 須與此一致）；電腦玩家從中挑選 */
export const DEFAULT_AVATAR_IDS = ['avatar_01', 'avatar_02', 'avatar_03', 'avatar_04', 'avatar_05', 'avatar_06'] as const;

/** 暱稱去除前後空白後須為 1～NICKNAME_MAX_LENGTH 個字元（以 Unicode code point 計） */
export function normalizeNickname(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    const length = [...trimmed].length;
    return length >= 1 && length <= NICKNAME_MAX_LENGTH ? trimmed : null;
}
