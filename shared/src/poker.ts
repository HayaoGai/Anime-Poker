/**
 * 牌局相關的共用定義：街、動作、牌型、錯誤碼。
 * 伺服器只回傳代碼，文字由客戶端依語系翻譯。
 */

export const Street = {
    Preflop: 'preflop',
    Flop: 'flop',
    Turn: 'turn',
    River: 'river',
} as const;
export type Street = (typeof Street)[keyof typeof Street];

/** 客戶端可送出的行動意圖 */
export const ActionType = {
    Fold: 'fold',
    Check: 'check',
    Call: 'call',
    /** 下注或加注，amount 為「加注後本輪的總下注額」（raise to） */
    Raise: 'raise',
    AllIn: 'allIn',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export type PlayerAction =
    | { type: typeof ActionType.Fold }
    | { type: typeof ActionType.Check }
    | { type: typeof ActionType.Call }
    | { type: typeof ActionType.Raise; amount: number }
    | { type: typeof ActionType.AllIn };

/** 實際發生的行動種類（用於動畫與人聲）；bet 與 raise 依本輪是否已有人下注區分 */
export const ActionKind = {
    Fold: 'fold',
    Check: 'check',
    Call: 'call',
    Bet: 'bet',
    Raise: 'raise',
} as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

/** 牌型，數值越大越強；皇家同花順屬於同花順（最大牌為 A） */
export const HandCategory = {
    HighCard: 0,
    OnePair: 1,
    TwoPair: 2,
    ThreeOfAKind: 3,
    Straight: 4,
    Flush: 5,
    FullHouse: 6,
    FourOfAKind: 7,
    StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export const ErrorCode = {
    /** 不在這手牌中（觀戰者、已棄牌、中途加入者） */
    NotInHand: 'NOT_IN_HAND',
    NotYourTurn: 'NOT_YOUR_TURN',
    /** 目前局面不允許此動作，例如有人下注時過牌 */
    IllegalAction: 'ILLEGAL_ACTION',
    /** 加注金額不合法：非整數、低於最小加注、超過籌碼 */
    InvalidAmount: 'INVALID_AMOUNT',
    HandOver: 'HAND_OVER',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
