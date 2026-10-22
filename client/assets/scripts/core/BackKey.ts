import { EventKeyboard, input, Input, KeyCode } from 'cc';

/** 回傳 true 代表已處理，不再往下傳 */
export type BackHandler = () => boolean;

/**
 * Android 返回鍵（桌機以 Esc 代替）的處理堆疊：後註冊者優先。
 * 場景在進入時註冊自己的行為（例如 Title 跳出退出確認），彈窗開啟時註冊在最上層。
 */
class BackKeyService {
    private readonly handlers: BackHandler[] = [];
    private initialized = false;

    init(): void {
        if (this.initialized) return;
        this.initialized = true;
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    /** 註冊處理函式，回傳取消註冊的函式 */
    push(handler: BackHandler): () => void {
        this.handlers.push(handler);
        return () => {
            const index = this.handlers.lastIndexOf(handler);
            if (index !== -1) this.handlers.splice(index, 1);
        };
    }

    /** 主動觸發（測試或 UI 上的返回按鈕） */
    trigger(): void {
        for (let i = this.handlers.length - 1; i >= 0; i--) {
            if (this.handlers[i]()) return;
        }
    }

    private onKeyDown(event: EventKeyboard): void {
        if (event.keyCode === KeyCode.MOBILE_BACK || event.keyCode === KeyCode.ESCAPE) this.trigger();
    }
}

export const backKey = new BackKeyService();
