import { Canvas, Color, director, DynamicAtlasManager, Graphics, macro, Node, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';
import { DEBUG, EDITOR } from 'cc/env';

const manager = DynamicAtlasManager.instance;

if (!EDITOR) {
    macro.CLEANUP_IMAGE_CACHE = false; // 合圖需要保留原始圖片資料
    manager.enabled = true;
    manager.maxFrameSize = 2000;
}

const DEBUG_NODE = 'DynamicAtlasDebug';
const DEBUG_GAP = 20;

/**
 * 除錯用：在目前場景 Canvas 的最上層並排顯示所有動態合圖（2.4 的 showDebug 在 3.x 已移除）。
 * 只會顯示呼叫當下已建立的合圖；之後新增的合圖要再呼叫一次，切換場景時會隨場景一起移除。
 */
function showDebug(show: boolean): void {
    const canvas = director.getScene()?.getComponentInChildren(Canvas)?.node;
    canvas?.getChildByName(DEBUG_NODE)?.destroy();
    const size = canvas?.getComponent(UITransform)?.contentSize;
    if (!show || !canvas || !size) return;

    // 引擎沒有公開合圖貼圖，只能讀私有欄位
    const atlases = (manager as unknown as { _atlases: { _texture: Texture2D }[] })._atlases;
    const count = atlases.length;
    if (count === 0) {
        console.log('[DynamicAtlas] 目前沒有任何動態合圖');
        return;
    }

    const root = new Node(DEBUG_NODE);
    root.layer = canvas.layer;
    canvas.addChild(root);
    root.addComponent(UITransform).setContentSize(size);
    const g = root.addComponent(Graphics);
    g.fillColor = new Color(0, 0, 0, 200);
    g.rect(-size.width, -size.height, size.width * 2, size.height * 2);
    g.fill();

    const side = Math.min(size.height * 0.9, (size.width * 0.95 - DEBUG_GAP * (count - 1)) / count);
    const startX = -((side + DEBUG_GAP) * (count - 1)) / 2;
    atlases.forEach((atlas, i) => {
        const frame = new SpriteFrame();
        frame.texture = atlas._texture;
        frame.packable = false;

        const node = new Node(`Atlas${i}`);
        node.layer = canvas.layer;
        root.addChild(node);
        node.setPosition(startX + (side + DEBUG_GAP) * i, 0);
        const transform = node.addComponent(UITransform);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        transform.setContentSize(side, side);
    });
    console.log(`[DynamicAtlas] ${count} 張合圖，每張 ${manager.textureSize}×${manager.textureSize}`);
}

// 開發預覽與勾選 Debug 的建置版才掛上，沿用 2.4 的指令：cc.dynamicAtlasManager.showDebug(true)
if (DEBUG && !EDITOR) {
    (manager as unknown as { showDebug: typeof showDebug }).showDebug = showDebug;
    (globalThis as unknown as { cc: Record<string, unknown> }).cc.dynamicAtlasManager = manager;
}
