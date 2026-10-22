import { _decorator, Component } from 'cc';
import { initApp } from './App';

const { ccclass, menu, executionOrder } = _decorator;

/**
 * 掛在每個場景的 Canvas 上。最早執行，確保全域服務在場景其他元件 onLoad 之前就緒。
 */
@ccclass('AppRoot')
@menu('AnimePoker/AppRoot')
@executionOrder(-1000)
export class AppRoot extends Component {
    protected onLoad(): void {
        initApp();
    }
}
