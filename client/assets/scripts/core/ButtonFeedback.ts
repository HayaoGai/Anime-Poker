import { Button, game, Node, Sprite, sys } from 'cc';
import { EDITOR } from 'cc/env';

/**
 * 全域的按鈕回饋，所有場景與 Prefab 的 Button 自動套用：
 *   - 不能點按時變暗：按鈕（含其中圖示）的 Sprite 改為灰階，恢復時還原；
 *   - Web 版滑鼠移到按鈕上時，能點按顯示 pointer、不能點按顯示 not-allowed。
 *
 * 以包裝 Button 的 onEnable／onDisable 與 interactable setter 實作，不必在每個按鈕上另外掛元件。
 * 滑鼠移入改由自己監聽：Button 在不能點按時不會追蹤 hover，無法顯示 not-allowed。
 *
 * 在模組載入時安裝（早於任何場景中按鈕的 onEnable）；編輯器中不安裝，避免灰階狀態被存進場景檔。
 */

/** 每個按鈕被這裡設為灰階的 Sprite，恢復時只還原這些（不動原本就是灰階的圖） */
const dimmed = new WeakMap<Button, Sprite[]>();
let hovered: Button | null = null;

function applyDim(button: Button): void {
    const target = button.target ?? button.node;
    if (!button.interactable) {
        if (dimmed.has(button)) return;
        const sprites = target.getComponentsInChildren(Sprite).filter((s) => !s.grayscale);
        for (const sprite of sprites) sprite.grayscale = true;
        dimmed.set(button, sprites);
    } else {
        for (const sprite of dimmed.get(button) ?? []) if (sprite.isValid) sprite.grayscale = false;
        dimmed.delete(button);
    }
}

function refreshCursor(): void {
    if (!sys.isBrowser || !game.canvas) return;
    game.canvas.style.cursor = hovered && hovered.enabledInHierarchy ? (hovered.interactable ? 'pointer' : 'not-allowed') : '';
}

function onMouseEnter(this: Button): void {
    hovered = this;
    refreshCursor();
}

function onMouseLeave(this: Button): void {
    if (hovered !== this) return;
    hovered = null;
    refreshCursor();
}

function install(): void {
    const proto = Button.prototype;

    const onEnable = proto.onEnable;
    proto.onEnable = function (this: Button) {
        onEnable.call(this);
        applyDim(this);
        this.node.on(Node.EventType.MOUSE_ENTER, onMouseEnter, this);
        this.node.on(Node.EventType.MOUSE_LEAVE, onMouseLeave, this);
    };

    // 停用或銷毀時不會收到滑鼠移出，必須在這裡還原游標
    const onDisable = proto.onDisable;
    proto.onDisable = function (this: Button) {
        onDisable.call(this);
        this.node.off(Node.EventType.MOUSE_ENTER, onMouseEnter, this);
        this.node.off(Node.EventType.MOUSE_LEAVE, onMouseLeave, this);
        if (hovered === this) {
            hovered = null;
            refreshCursor();
        }
    };

    const descriptor = findAccessor(proto, 'interactable');
    if (descriptor?.get && descriptor.set) {
        const { get, set } = descriptor;
        Object.defineProperty(proto, 'interactable', {
            ...descriptor,
            get,
            set(this: Button, value: boolean) {
                set.call(this, value);
                applyDim(this);
                if (hovered === this) refreshCursor();
            },
        });
    }
}

/** interactable 的 getter／setter 可能定義在父類別的原型上 */
function findAccessor(proto: object | null, key: string): PropertyDescriptor | undefined {
    for (let p = proto; p; p = Object.getPrototypeOf(p)) {
        const descriptor = Object.getOwnPropertyDescriptor(p, key);
        if (descriptor) return descriptor;
    }
    return undefined;
}

if (!EDITOR) install();
