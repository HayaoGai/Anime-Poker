import { logger } from '@colyseus/core';
import { HEALTH_PATH } from '@shared/constants';

/**
 * 定時 ping 自己的對外網址，讓 Render 視為有流量而不進入休眠。
 * 請求必須走公開網址（經過 Render 的 proxy）才會被計入，打 localhost 無效。
 */
export function startKeepAlive(externalUrl: string | undefined, intervalMs: number): void {
    if (!externalUrl) {
        logger.info('[keepAlive] 未設定 RENDER_EXTERNAL_URL，略過自我 ping');
        return;
    }

    const target = new URL(HEALTH_PATH, externalUrl).toString();

    const timer = setInterval(async () => {
        try {
            const res = await fetch(target, { signal: AbortSignal.timeout(10_000) });
            if (!res.ok) logger.warn(`[keepAlive] ${target} 回應 ${res.status}`);
        } catch (err) {
            logger.warn(`[keepAlive] ping 失敗：${(err as Error).message}`);
        }
    }, intervalMs);

    // 不讓計時器阻止程序在關機流程中結束
    timer.unref();
    logger.info(`[keepAlive] 每 ${intervalMs / 60_000} 分鐘 ping ${target}`);
}
