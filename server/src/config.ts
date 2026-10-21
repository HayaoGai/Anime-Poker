import { DEFAULT_SERVER_PORT } from '@shared/constants';

/** 伺服器設定，全部來自環境變數 */
export const config = {
    port: Number(process.env.PORT) || DEFAULT_SERVER_PORT,
    /** Render 自動注入的對外網址，例如 https://anime-poker-server.onrender.com；本機開發時為 undefined */
    externalUrl: process.env.RENDER_EXTERNAL_URL,
    /** 自我 ping 間隔：Render 免費方案閒置 15 分鐘會休眠，每 10 分鐘 ping 一次 */
    keepAliveIntervalMs: 10 * 60 * 1000,
};
