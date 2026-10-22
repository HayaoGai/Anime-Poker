import { _decorator, CCString, Component, Label } from 'cc';
import type { Unsubscribe } from '../core/Observable';
import { i18n, type I18nKey } from './I18n';

const { ccclass, property, requireComponent, executeInEditMode, menu } = _decorator;

/**
 * 掛在 Label 上，於編輯器填入語系鍵值即可自動顯示對應文字並隨語系切換更新。
 * executeInEditMode：在編輯器中也會即時顯示翻譯結果，所見即所得。
 */
@ccclass('LocalizedLabel')
@menu('AnimePoker/LocalizedLabel')
@executeInEditMode
@requireComponent(Label)
export class LocalizedLabel extends Component {
    @property({ tooltip: '語系鍵值，例如 title.tapToStart' })
    get key(): string {
        return this._key;
    }
    set key(value: string) {
        this._key = value;
        this.refresh();
    }

    /** 參數，格式為 name=value，例如 version=0.0.5 */
    @property({ type: [CCString], tooltip: '參數（name=value）' })
    params: string[] = [];

    @property
    private _key = '';

    private unsubscribe: Unsubscribe | null = null;

    /** 程式動態設定鍵值與參數（例如顯示金額） */
    setKey(key: I18nKey, params?: Record<string, string | number>): void {
        this._key = key;
        this.params = params ? Object.entries(params).map(([k, v]) => `${k}=${v}`) : [];
        this.refresh();
    }

    protected onEnable(): void {
        this.unsubscribe = i18n.language.subscribe(() => this.refresh());
    }

    protected onDisable(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    private refresh(): void {
        if (!this._key) return;
        const params = Object.fromEntries(
            this.params.map((p) => {
                const index = p.indexOf('=');
                return index === -1 ? [p, ''] : [p.slice(0, index), p.slice(index + 1)];
            }),
        );
        const text = i18n.t(this._key as I18nKey, params);
        const label = this.getComponent(Label);
        if (label) label.string = text;
    }
}
