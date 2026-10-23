import { _decorator, Button, EditBox, instantiate, Node, Sprite, SpriteFrame, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { avatarById, AVATARS, AvatarVariant } from '../../config/Avatars';
import { audio } from '../../core/AudioManager';
import { PopupBase } from '../../core/PopupBase';
import { loadResource } from '../../core/ResourceCache';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import { profile } from '../../models/ProfileModel';
import { normalizeNickname } from '../../shared/protocol';
import { AvatarImage } from '../common/AvatarImage';

const { ccclass, property, menu } = _decorator;

/**
 * 暱稱與頭像設定。首次進入時為必填（不能關閉），之後點左上角名牌可再修改。
 * 頭像選項依 config/Avatars 動態產生（複製 Prefab 中的範本節點），新增頭像不需改 Prefab。
 * 左側立繪顯示目前選擇的頭像，尚未設定過頭像時預設選第一位。
 */
@ccclass('ProfilePopup')
@menu('AnimePoker/ProfilePopup')
export class ProfilePopup extends PopupBase<boolean> {
    @property(EditBox)
    nicknameInput: EditBox | null = null;

    @property({ type: Sprite, tooltip: '目前選擇頭像的立繪' })
    avatarFull: Sprite | null = null;

    @property({ type: Node, tooltip: '頭像選項的容器（Layout）' })
    avatarGrid: Node | null = null;

    @property({ type: Node, tooltip: '頭像選項範本：含 AvatarImage 與名為 Selected 的子節點' })
    avatarTemplate: Node | null = null;

    @property(LocalizedLabel)
    errorLabel: LocalizedLabel | null = null;

    @property(Button)
    saveButton: Button | null = null;

    @property(Button)
    closeButton: Button | null = null;

    private selected = '';
    private readonly options = new Map<string, Node>();
    /** 立繪的原始位置（切換動畫的終點） */
    private fullHome = new Vec3();
    /** 切換動畫中淡出的舊立繪 */
    private fullGhost: Node | null = null;

    /** forced：首次設定，兩個欄位都填好才能關閉 */
    setup({ forced }: { forced: boolean }): void {
        this.closeOnBack = !forced;
        this.closeOnMask = !forced;
        if (this.closeButton) this.closeButton.node.active = !forced;
    }

    protected onLoad(): void {
        if (this.nicknameInput) this.nicknameInput.string = profile.nickname.value;
        if (this.avatarFull) this.fullHome.set(this.avatarFull.node.position);
        this.buildAvatars();
        this.select(profile.avatarId.value || AVATARS[0].id, false);
        this.showError(null);
        this.saveButton?.node.on(Button.EventType.CLICK, this.save, this);
        this.closeButton?.node.on(Button.EventType.CLICK, () => this.close(false));
    }

    private buildAvatars(): void {
        const template = this.avatarTemplate;
        if (!template || !this.avatarGrid) return;
        template.active = false;
        for (const avatar of AVATARS) {
            const node = instantiate(template);
            node.name = avatar.id;
            node.active = true;
            this.avatarGrid.addChild(node);
            node.getComponent(AvatarImage)?.setAvatar(avatar.id);
            node.on(Button.EventType.CLICK, () => {
                // 點已選的頭像只給點擊音，不打斷正在播放的人聲
                if (avatar.id === this.selected) void audio.playSfx('ui_click');
                else void audio.playSelectVoice(avatar.id);
                this.select(avatar.id);
            });
            this.options.set(avatar.id, node);
        }
    }

    /** 關閉時中斷選擇頭像的人聲 */
    close(result?: boolean): void {
        audio.stopSelectVoice();
        super.close(result);
    }

    protected onDestroy(): void {
        super.onDestroy();
        // 場景切換等原因被直接銷毀時，人聲同樣要中斷
        audio.stopSelectVoice();
        this.stopFullTweens();
    }

    private select(avatarId: string, animate = true): void {
        const previous = this.selected;
        this.selected = this.options.has(avatarId) ? avatarId : AVATARS[0].id;
        this.options.forEach((node, id) => {
            const mark = node.getChildByName('Selected');
            if (mark) mark.active = id === this.selected;
            node.setScale(id === this.selected ? 1.08 : 1, id === this.selected ? 1.08 : 1, 1);
        });
        if (this.selected !== previous) this.showFull(this.selected, animate);
    }

    private showFull(avatarId: string, animate: boolean): void {
        const sprite = this.avatarFull;
        if (!sprite) return;
        void loadResource(avatarById(avatarId).texture[AvatarVariant.Full], SpriteFrame).then((frame) => {
            // 載入期間又換了頭像，就不套用舊的結果
            if (!this.isValid || this.selected !== avatarId || !frame) return;
            if (animate && sprite.spriteFrame) this.switchFull(sprite, frame);
            else sprite.spriteFrame = frame;
        });
    }

    /** 舊立繪向左移並淡出，新立繪從右側移到原位並淡入 */
    private switchFull(sprite: Sprite, frame: SpriteFrame): void {
        const SLIDE = 40;
        const DURATION = 0.25;
        const node = sprite.node;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        this.stopFullTweens();

        // 複製目前的立繪（含切換中的位置與透明度）作為淡出的舊立繪，放在新立繪後面
        const ghost = instantiate(node);
        node.parent!.insertChild(ghost, node.getSiblingIndex());
        this.fullGhost = ghost;
        const ghostOpacity = ghost.getComponent(UIOpacity)!;
        tween(ghost)
            .to(DURATION, { position: new Vec3(this.fullHome.x - SLIDE, this.fullHome.y, this.fullHome.z) }, { easing: 'quadOut' })
            .call(() => {
                if (this.fullGhost === ghost) this.fullGhost = null;
                ghost.destroy();
            })
            .start();
        tween(ghostOpacity).to(DURATION, { opacity: 0 }).start();

        sprite.spriteFrame = frame;
        node.setPosition(this.fullHome.x + SLIDE, this.fullHome.y, this.fullHome.z);
        opacity.opacity = 0;
        tween(node).to(DURATION, { position: this.fullHome.clone() }, { easing: 'quadOut' }).start();
        tween(opacity).to(DURATION, { opacity: 255 }).start();
    }

    private stopFullTweens(): void {
        const node = this.avatarFull?.node;
        if (node?.isValid) {
            Tween.stopAllByTarget(node);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
        }
        const ghost = this.fullGhost;
        this.fullGhost = null;
        if (ghost?.isValid) {
            Tween.stopAllByTarget(ghost);
            const opacity = ghost.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            ghost.destroy();
        }
    }

    private save(): void {
        const nickname = normalizeNickname(this.nicknameInput?.string ?? '');
        if (!nickname) return this.showError('profile.nicknameRequired');
        if (!this.selected) return this.showError('profile.avatarRequired');
        profile.save(nickname, this.selected);
        this.close(true);
    }

    private showError(key: 'profile.nicknameRequired' | 'profile.avatarRequired' | null): void {
        if (!this.errorLabel) return;
        this.errorLabel.node.active = key !== null;
        if (key) this.errorLabel.setKey(key);
    }
}
