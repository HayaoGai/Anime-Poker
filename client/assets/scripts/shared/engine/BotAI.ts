// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/engine/BotAI.ts，執行 pnpm sync:shared 更新。
import { FULL_DECK, type Card } from '../cards';
import type { LegalActions } from '../events';
import { ActionType, type PlayerAction } from '../poker';
import { scoreHand } from './HandEvaluator';
import type { Rng } from './rng';

export interface BotContext {
    hole: readonly Card[];
    board: readonly Card[];
    legal: LegalActions;
    /** 桌面上所有籌碼：已收進底池 + 本輪所有人的下注 */
    pot: number;
    /** 本輪的注額 */
    currentBet: number;
    /** 仍在牌局中的對手人數 */
    opponents: number;
    bigBlind: number;
}

/**
 * 以 Monte Carlo 模擬估算勝率：隨機補齊對手底牌與剩餘公共牌，統計自己贏（平手按人數分）的比例。
 */
export function estimateEquity(hole: readonly Card[], board: readonly Card[], opponents: number, iterations: number, rng: Rng): number {
    const known = new Set<Card>([...hole, ...board]);
    const remaining = FULL_DECK.filter((c) => !known.has(c));
    const needed = opponents * 2 + (5 - board.length);

    let equity = 0;
    for (let i = 0; i < iterations; i++) {
        // 部分 Fisher–Yates：只洗出需要的張數
        for (let k = 0; k < needed; k++) {
            const j = k + rng(remaining.length - k);
            [remaining[k], remaining[j]] = [remaining[j], remaining[k]];
        }
        const fullBoard = [...board, ...remaining.slice(opponents * 2, needed)];
        const mine = scoreHand([...hole, ...fullBoard]);

        let best = 0;
        let ties = 0;
        for (let o = 0; o < opponents; o++) {
            const score = scoreHand([remaining[o * 2], remaining[o * 2 + 1], ...fullBoard]);
            if (score > best) {
                best = score;
                ties = 0;
            }
            if (score === best) ties++;
        }

        if (mine > best) equity += 1;
        else if (mine === best) equity += 1 / (ties + 1);
    }
    return equity / iterations;
}

/**
 * 電腦玩家的決策：勝率對照底池賠率，加上少量隨機性（偶爾詐唬、加注大小浮動）。
 * 回傳的動作一定合法。
 */
export function decideBotAction(ctx: BotContext, rng: Rng): PlayerAction {
    const { legal } = ctx;
    // 對手越多單次模擬越貴，總計算量維持在相近範圍
    const iterations = Math.max(120, Math.round(480 / Math.max(1, ctx.opponents)));
    const equity = estimateEquity(ctx.hole, ctx.board, Math.max(1, ctx.opponents), iterations, rng);

    // 相對強度：1 代表與平均水準相當（勝率 = 1 / 在局人數）
    const strength = equity * (ctx.opponents + 1);
    const roll = rng(1000) / 1000;

    const wantsRaise = strength >= 1.8 || (strength >= 1.35 && roll < 0.45) || (legal.canCheck && roll < 0.06);
    if (legal.canRaise && wantsRaise) {
        return raiseAction(ctx, strength, roll);
    }

    if (legal.canCheck) return { type: ActionType.Check };

    const potOdds = legal.callAmount / (ctx.pot + legal.callAmount);
    const cheapCall = legal.callAmount <= ctx.bigBlind && equity > 0.2;
    if (equity >= potOdds * 1.1 + 0.02 || cheapCall) return { type: ActionType.Call };

    return { type: ActionType.Fold };
}

function raiseAction(ctx: BotContext, strength: number, roll: number): PlayerAction {
    const { legal } = ctx;
    // 依底池 50%～100% 加注，強牌偏大
    const fraction = Math.min(1, 0.5 + roll * 0.4 + (strength >= 2.5 ? 0.2 : 0));
    let target = ctx.currentBet + Math.round(Math.max(ctx.pot, ctx.bigBlind * 2) * fraction);
    target = Math.min(Math.max(target, legal.minRaiseTo), legal.maxRaiseTo);

    // 加注後剩下的籌碼不多時直接 all-in
    if (target >= legal.maxRaiseTo * 0.7) return { type: ActionType.AllIn };
    return { type: ActionType.Raise, amount: target };
}
