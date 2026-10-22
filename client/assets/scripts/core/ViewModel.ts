import type { Unsubscribe } from './Observable';

/** 收集需要在結束時釋放的資源（訂閱、計時器、網路監聽…） */
export class DisposeBag {
    private readonly disposers: (() => void)[] = [];

    add(dispose: Unsubscribe | (() => void) | { dispose(): void }): void {
        this.disposers.push(typeof dispose === 'function' ? dispose : () => dispose.dispose());
    }

    dispose(): void {
        // 後加入的先釋放，與建立順序相反
        while (this.disposers.length) this.disposers.pop()!();
    }
}

/**
 * ViewModel 基底：不依賴 Cocos 元件，只持有 Observable 與意圖方法。
 * 由 View 建立並在 View 銷毀時呼叫 dispose。
 */
export abstract class ViewModel {
    protected readonly bag = new DisposeBag();

    dispose(): void {
        this.bag.dispose();
    }
}
