import { NATIVE } from 'cc/env';
import { FallbackBridge } from './FallbackBridge';
import type { INativeBridge } from './INativeBridge';
import { WebBridge } from './WebBridge';

export type { BatteryStatus, HapticPattern, INativeBridge } from './INativeBridge';

/**
 * 依執行平台選擇實作：Web 用瀏覽器 API；原生平台在 AndroidBridge 完成前使用無作用的預設實作。
 */
function createBridge(): INativeBridge {
    if (!NATIVE) return new WebBridge();
    return new FallbackBridge();
}

export const nativeBridge: INativeBridge = createBridge();
