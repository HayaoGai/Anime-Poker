import { sys } from 'cc';
import { NATIVE } from 'cc/env';
import { AndroidBridge } from './AndroidBridge';
import { FallbackBridge } from './FallbackBridge';
import type { INativeBridge } from './INativeBridge';
import { WebBridge } from './WebBridge';

export type { BatteryStatus, HapticPattern, INativeBridge } from './INativeBridge';

/**
 * 依執行平台選擇實作：Web 用瀏覽器 API、Android 走原生橋接，其他原生平台使用無作用的預設實作。
 */
function createBridge(): INativeBridge {
    if (!NATIVE) return new WebBridge();
    if (sys.os === sys.OS.ANDROID) return new AndroidBridge();
    return new FallbackBridge();
}

export const nativeBridge: INativeBridge = createBridge();
