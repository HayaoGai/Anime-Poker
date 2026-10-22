// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/errors.ts，執行 pnpm sync:shared 更新。
/**
 * 伺服器回傳的錯誤碼。伺服器只送代碼，文字由客戶端依語系翻譯。
 */
export const ErrorCode = {
    // ---- 牌局 ----
    /** 不在這手牌中（觀戰者、已棄牌、中途加入者） */
    NotInHand: 'NOT_IN_HAND',
    NotYourTurn: 'NOT_YOUR_TURN',
    /** 目前局面不允許此動作，例如有人下注時過牌 */
    IllegalAction: 'ILLEGAL_ACTION',
    /** 加注金額不合法：非整數、低於最小加注、超過籌碼 */
    InvalidAmount: 'INVALID_AMOUNT',
    HandOver: 'HAND_OVER',

    // ---- 房間 ----
    /** 加入房間時的暱稱、頭像或玩家 ID 格式不正確 */
    InvalidOptions: 'INVALID_OPTIONS',
    /** 同一個玩家 ID 已經在房間中（例如開了兩個分頁） */
    AlreadyInRoom: 'ALREADY_IN_ROOM',
    InvalidMessage: 'INVALID_MESSAGE',
    NotHost: 'NOT_HOST',
    /** 目前的房間階段不允許此操作，例如遊戲中新增電腦 */
    InvalidPhase: 'INVALID_PHASE',
    SeatTaken: 'SEAT_TAKEN',
    TableFull: 'TABLE_FULL',
    NotEnoughPlayers: 'NOT_ENOUGH_PLAYERS',
    NotSpectator: 'NOT_SPECTATOR',
    NotParticipant: 'NOT_PARTICIPANT',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
