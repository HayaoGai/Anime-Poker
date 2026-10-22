import { instantiate, Node, Sprite, SpriteFrame, tween, UITransform, Vec3 } from 'cc';

export interface FlyOptions {
    duration?: number;
    delay?: number;
    /** 弧線高度（相對兩點距離的比例），0 為直線 */
    arc?: number;
    /** 起點與終點的縮放 */
    fromScale?: number;
    toScale?: number;
    /** 旋轉角度（度） */
    spin?: number;
}

/**
 * 在特效層中讓一個 Sprite 沿二次貝茲曲線從 A 飛到 B（發牌、籌碼都使用）。
 * Cocos 的 Tween 沒有內建貝茲曲線，這裡以補間一個 0→1 的進度值並在 onUpdate 計算位置。
 */
export class Flyer {
    private readonly pool: Node[] = [];

    constructor(
        private readonly layer: Node,
        private readonly template: Node,
    ) {
        template.active = false;
    }

    /** 世界座標 → 特效層座標 */
    toLocal(world: Vec3): Vec3 {
        return this.layer.getComponent(UITransform)!.convertToNodeSpaceAR(world);
    }

    fly(frame: SpriteFrame | null, fromWorld: Vec3, toWorld: Vec3, options: FlyOptions = {}): Promise<void> {
        const { duration = 0.4, delay = 0, arc = 0.25, fromScale = 1, toScale = 1, spin = 0 } = options;
        const node = this.pool.pop() ?? instantiate(this.template);
        node.parent = this.layer;
        node.active = false;
        const sprite = node.getComponent(Sprite);
        if (sprite && frame) sprite.spriteFrame = frame;

        const from = this.toLocal(fromWorld);
        const to = this.toLocal(toWorld);
        const distance = Vec3.distance(from, to);
        // 控制點：中點往「左手邊」偏移，形成拋物線
        const mid = new Vec3((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
        const dir = new Vec3(to.x - from.x, to.y - from.y, 0).normalize();
        const control = new Vec3(mid.x - dir.y * distance * arc, mid.y + dir.x * distance * arc + distance * arc * 0.5, 0);

        const progress = { t: 0 };
        const position = new Vec3();
        return new Promise((resolve) => {
            tween(progress)
                .delay(delay)
                .call(() => {
                    node.active = true;
                    node.setPosition(from);
                    node.setScale(fromScale, fromScale, 1);
                    node.angle = 0;
                })
                .to(duration, { t: 1 }, {
                    easing: 'quadOut',
                    onUpdate: () => {
                        const t = progress.t;
                        const u = 1 - t;
                        position.set(u * u * from.x + 2 * u * t * control.x + t * t * to.x, u * u * from.y + 2 * u * t * control.y + t * t * to.y, 0);
                        node.setPosition(position);
                        const s = fromScale + (toScale - fromScale) * t;
                        node.setScale(s, s, 1);
                        node.angle = spin * t;
                    },
                })
                .call(() => {
                    node.active = false;
                    this.pool.push(node);
                    resolve();
                })
                .start();
        });
    }
}
