// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/constants.ts，執行 pnpm sync:shared 更新。
/**
 * 前後端共用常數。
 * 此資料夾不得使用 Node.js 專屬 API，因為會被同步到 Cocos 客戶端。
 */

/** Colyseus 房間名稱 */
export const RoomName = {
    Lobby: 'lobby',
    Poker: 'poker',
} as const;

/** 伺服器預設埠號（本機開發用；Render 會以 PORT 環境變數覆寫） */
export const DEFAULT_SERVER_PORT = 2567;

/** 健康檢查路徑，供 Render 與自我 ping 使用 */
export const HEALTH_PATH = '/health';
