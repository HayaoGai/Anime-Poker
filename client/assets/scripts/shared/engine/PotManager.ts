// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/engine/PotManager.ts，執行 pnpm sync:shared 更新。
export interface Contribution {
    seat: number;
    /** 這手牌累計投入的籌碼 */
    amount: number;
    folded: boolean;
}

export interface Pot {
    amount: number;
    /** 有資格贏得此池的座位（未棄牌且投入達到此池的上限） */
    eligible: number[];
}

/**
 * 依投入金額分層建立主池與邊池。
 *
 * 以未棄牌玩家的投入金額作為各層上限：每一層收取所有人（含已棄牌者）在該區間內的投入，
 * 只有投入達到上限的未棄牌玩家能贏這一層。eligible 相同的相鄰層會合併。
 * 呼叫前應先用 returnUncalled 退回無人跟注的部分，否則最上層可能只有一位 eligible。
 */
export function buildPots(contributions: readonly Contribution[]): Pot[] {
    const live = contributions.filter((c) => !c.folded && c.amount > 0);
    const caps = [...new Set(live.map((c) => c.amount))].sort((a, b) => a - b);

    const pots: Pot[] = [];
    let floor = 0;
    for (const cap of caps) {
        const amount = contributions.reduce((sum, c) => sum + Math.max(0, Math.min(c.amount, cap) - floor), 0);
        const eligible = live.filter((c) => c.amount >= cap).map((c) => c.seat);
        floor = cap;

        const last = pots[pots.length - 1];
        if (last && sameSeats(last.eligible, eligible)) last.amount += amount;
        else pots.push({ amount, eligible });
    }

    // 已棄牌者的投入可能高於所有未棄牌者（例如下注後遭 all-in 反加再棄牌），超出部分併入最上層
    const overflow = contributions.reduce((sum, c) => sum + Math.max(0, c.amount - floor), 0);
    if (overflow > 0 && pots.length) pots[pots.length - 1].amount += overflow;

    return pots;
}

/**
 * 找出無人跟注的部分：投入最多者超出第二多者的差額要退回。
 * 回傳 null 代表沒有需要退回的籌碼。
 */
export function findUncalled(contributions: readonly Contribution[]): { seat: number; amount: number } | null {
    if (contributions.length === 0) return null;
    const sorted = [...contributions].sort((a, b) => b.amount - a.amount);
    const top = sorted[0];
    const second = sorted[1]?.amount ?? 0;
    return top.amount > second ? { seat: top.seat, amount: top.amount - second } : null;
}

/**
 * 依座位順序分配一個池給贏家們；除不盡的零頭從按鈕左手邊第一位贏家開始，每人多分 1。
 * winnersInOrder 必須已依「按鈕左手邊開始」的順序排列。
 */
export function splitPot(amount: number, winnersInOrder: readonly number[]): Map<number, number> {
    const share = Math.floor(amount / winnersInOrder.length);
    let remainder = amount - share * winnersInOrder.length;
    const result = new Map<number, number>();
    for (const seat of winnersInOrder) {
        result.set(seat, share + (remainder > 0 ? 1 : 0));
        remainder--;
    }
    return result;
}

function sameSeats(a: readonly number[], b: readonly number[]): boolean {
    return a.length === b.length && a.every((seat, i) => seat === b[i]);
}
