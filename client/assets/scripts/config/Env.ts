import { DEBUG, NATIVE } from 'cc/env';
import { storage } from '../core/Storage';
import { DEFAULT_SERVER_PORT } from '../shared/constants';

/** Render 上的正式伺服器（render.yaml 的服務名稱 anime-poker-server）；若 Render 指派了不同網址，修改此處 */
export const PRODUCTION_SERVER = 'wss://anime-poker-server.onrender.com';
export const DEVELOPMENT_SERVER = `ws://localhost:${DEFAULT_SERVER_PORT}`;

/**
 * 伺服器位址，優先順序：
 *   1. 網址參數 ?server=ws://...（Web 版測試用）
 *   2. localStorage 的 serverUrl（開發時手動覆寫）
 *   3. Web 的 debug 建置連本機，其餘（正式建置、Android）連 Render
 *      （Android 裝置上的 localhost 是手機本身，連不到開發機）
 */
export function serverUrl(): string {
    if (!NATIVE && typeof location !== 'undefined') {
        const fromQuery = new URLSearchParams(location.search).get('server');
        if (fromQuery) return fromQuery;
    }
    const override = storage.get<string | null>('serverUrl', null);
    if (override) return override;
    return DEBUG && !NATIVE ? DEVELOPMENT_SERVER : PRODUCTION_SERVER;
}
