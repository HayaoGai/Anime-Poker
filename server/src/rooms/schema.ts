import { schema, t, type SchemaType } from '@colyseus/schema';
import { BIG_BLIND, MAX_SEATS, SMALL_BLIND } from '@shared/rules';

/**
 * 同步給所有人（含觀戰者）的狀態，只放公開資訊。
 * 未公開的底牌絕不放進這裡，只在攤牌公開時寫入 shownCards。
 */
export const SeatState = schema(
    {
        occupied: t.boolean().default(false),
        /** 真人玩家的 Colyseus sessionId；電腦為空字串 */
        sessionId: t.string().default(''),
        isBot: t.boolean().default(false),
        nickname: t.string().default(''),
        avatarId: t.string().default(''),
        stack: t.number().default(0),
        /** 本輪桌面上的下注 */
        bet: t.number().default(0),
        /** 本手有發牌（中途加入、籌碼為 0 者為 false） */
        inHand: t.boolean().default(false),
        folded: t.boolean().default(false),
        allIn: t.boolean().default(false),
        /** false：斷線寬限期中，或已離桌但這手牌尚未結束 */
        connected: t.boolean().default(true),
        /** 攤牌時公開的底牌 */
        shownCards: t.array('string'),
    },
    'SeatState',
);
export type SeatState = SchemaType<typeof SeatState>;

export const PokerState = schema(
    {
        phase: t.string().default('lobby'),
        hostSessionId: t.string().default(''),
        seats: t.array(SeatState),
        spectatorCount: t.number().default(0),

        handNumber: t.number().default(0),
        buttonSeat: t.number().default(-1),
        smallBlindSeat: t.number().default(-1),
        bigBlindSeat: t.number().default(-1),
        /** 目前這手（或下一手）的盲注，隨手數升級；畫面上的 BB 以 bigBlind 換算 */
        smallBlind: t.number().default(SMALL_BLIND),
        bigBlind: t.number().default(BIG_BLIND),
        /** 目前的街；不在牌局中時為空字串 */
        street: t.string().default(''),
        board: t.array('string'),
        /** 已收進底池的各池金額，主池在前 */
        pots: t.array('number'),
        currentBet: t.number().default(0),
        /** 輪到的座位；沒有人需要行動時為 -1 */
        turnSeat: t.number().default(-1),
        /** 行動截止時間（伺服器 epoch ms） */
        turnDeadline: t.number().default(0),
    },
    'PokerState',
);
export type PokerState = SchemaType<typeof PokerState>;

export function createPokerState(): PokerState {
    const state = new PokerState();
    for (let i = 0; i < MAX_SEATS; i++) state.seats.push(new SeatState());
    return state;
}
