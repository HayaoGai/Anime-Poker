import { _decorator, Component, Label, Node } from 'cc';
import type { Listener, ReadonlyObservable } from './Observable';
import { DisposeBag } from './ViewModel';

const { ccclass } = _decorator;

/**
 * View 基底：節點由編輯器透過 @property 指定（所見即所得），
 * 在 onLoad 綁定 ViewModel；所有綁定在節點銷毀時自動解除。
 */
@ccclass('ViewBase')
export class ViewBase extends Component {
    protected readonly bindings = new DisposeBag();

    protected bind<T>(source: ReadonlyObservable<T>, listener: Listener<T>): void {
        this.bindings.add(source.subscribe(listener));
    }

    protected bindLabel<T>(label: Label | null, source: ReadonlyObservable<T>, format: (value: T) => string = String): void {
        if (!label) return;
        this.bind(source, (value) => (label.string = format(value)));
    }

    protected bindActive(node: Node | null, source: ReadonlyObservable<boolean>, invert = false): void {
        if (!node) return;
        this.bind(source, (value) => (node.active = invert ? !value : value));
    }

    protected onDestroy(): void {
        this.bindings.dispose();
    }
}
