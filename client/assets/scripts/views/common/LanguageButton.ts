import { _decorator, Button, Component, Prefab } from 'cc';
import { audio } from '../../core/AudioManager';
import { popups } from '../../core/PopupManager';

const { ccclass, property, menu, requireComponent } = _decorator;

/** 開啟語系選單（位於全螢幕按鈕左邊） */
@ccclass('LanguageButton')
@menu('AnimePoker/LanguageButton')
@requireComponent(Button)
export class LanguageButton extends Component {
    @property(Prefab)
    menuPrefab: Prefab | null = null;

    protected onLoad(): void {
        this.node.on(Button.EventType.CLICK, this.open, this);
    }

    private open(): void {
        if (!this.menuPrefab) return;
        void popups.show(this.menuPrefab);
    }
}
