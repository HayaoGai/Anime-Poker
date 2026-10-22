// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/events.ts，執行 pnpm sync:shared 更新。
/**
 * 牌局事件：伺服器引擎產生，依序廣播給房間內所有人，客戶端據此播放動畫。
 * 事件中不含任何未公開的底牌；底牌另以 ServerMessage.HoleCards 私訊給本人。
 */
import type { Card } from './cards';
import type { ActionKind, HandCategory, Street } from './poker';

export interface LegalActions {
    canFold: boolean;
    canCheck: boolean;
    /** 跟注要補的金額；0 代表不需要跟注。籌碼不足時為 all-in 的金額 */
    callAmount: number;
    canRaise: boolean;
    /** 最小加注到（raise to）；籌碼不足最小加注時等於 maxRaiseTo（只能 all-in） */
    minRaiseTo: number;
    /** 最大加注到 = all-in */
    maxRaiseTo: number;
}

export interface ActionRecord {
    seat: number;
    kind: ActionKind;
    /** 這次動作實際投入的籌碼 */
    paid: number;
    /** 動作後本輪的總投入 */
    committed: number;
    stack: number;
    allIn: boolean;
}

export interface RevealedHand {
    seat: number;
    cards: Card[];
}

export interface ShowdownResult {
    seat: number;
    category: HandCategory;
    bestFive: Card[];
}

export type HandEvent =
    | { type: 'handStarted'; button: number; smallBlindSeat: number; bigBlindSeat: number }
    | { type: 'blindPosted'; seat: number; blind: 'small' | 'big'; amount: number; allIn: boolean }
    /** 發底牌，order 為發牌順序（每人兩張，繞兩圈） */
    | { type: 'holeCardsDealt'; order: number[] }
    | { type: 'actionRequired'; seat: number; street: Street }
    | ({ type: 'playerActed'; street: Street } & ActionRecord)
    | { type: 'uncalledReturned'; seat: number; amount: number }
    /** 本輪下注收進底池；pots 為收完後各池金額（主池在前） */
    | { type: 'betsCollected'; street: Street; pots: number[] }
    | { type: 'boardDealt'; street: Street; cards: Card[] }
    /** 攤牌或 all-in 後再無下注時，公開仍在牌局中的玩家底牌 */
    | { type: 'handsRevealed'; hands: RevealedHand[] }
    | { type: 'potAwarded'; potIndex: number; amount: number; winners: { seat: number; amount: number }[]; category: HandCategory | null }
    | { type: 'handEnded'; showdown: ShowdownResult[] };

export type HandEventType = HandEvent['type'];
