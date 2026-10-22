import { _decorator, Component, Sprite, SpriteFrame } from 'cc';
import { avatarById } from '../../config/Avatars';
import { loadResource } from '../../core/ResourceCache';

const { ccclass, property, menu } = _decorator;

/** 依頭像 id 從 resources 載入圖片（座位、名牌、頭像選擇都使用） */
@ccclass('AvatarImage')
@menu('AnimePoker/AvatarImage')
export class AvatarImage extends Component {
    @property(Sprite)
    sprite: Sprite | null = null;

    private current = '';

    setAvatar(avatarId: string): void {
        if (avatarId === this.current) return;
        this.current = avatarId;
        if (!avatarId) {
            if (this.sprite) this.sprite.spriteFrame = null;
            return;
        }
        void loadResource(avatarById(avatarId).texture, SpriteFrame).then((frame) => {
            // 載入期間頭像又換了，就不套用舊的結果
            if (this.isValid && this.sprite && this.current === avatarId && frame) this.sprite.spriteFrame = frame;
        });
    }
}
