/**
 * 伺服器時間校正（不依賴 cc，可在 Node 測試）。
 *
 * 客戶端送出本機時間，伺服器回覆其時間；假設往返延遲對稱，
 * offset = serverTime + rtt / 2 - 收到時的本機時間。
 * 取最近幾次中往返延遲最短的樣本，誤差最小。倒數計時以 serverNow() 對照伺服器給的 deadline。
 */
export class TimeSync {
    private readonly samples: { offset: number; rtt: number }[] = [];

    constructor(private readonly maxSamples = 8) {}

    addSample(clientSent: number, serverTime: number, clientReceived: number): void {
        const rtt = Math.max(0, clientReceived - clientSent);
        this.samples.push({ offset: serverTime + rtt / 2 - clientReceived, rtt });
        if (this.samples.length > this.maxSamples) this.samples.shift();
    }

    get hasSamples(): boolean {
        return this.samples.length > 0;
    }

    /** 伺服器時間 - 本機時間（毫秒） */
    get offset(): number {
        if (!this.samples.length) return 0;
        return this.samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
    }

    /** 最近的往返延遲（毫秒），沒有樣本時為 null */
    get latency(): number | null {
        return this.samples.length ? this.samples[this.samples.length - 1].rtt : null;
    }

    serverNow(localNow = Date.now()): number {
        return localNow + this.offset;
    }

    /** 距離伺服器時間 deadline 還有多少毫秒（不小於 0） */
    remaining(deadline: number, localNow = Date.now()): number {
        return Math.max(0, deadline - this.serverNow(localNow));
    }
}
