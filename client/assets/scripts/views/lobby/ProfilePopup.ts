import { _decorator, Button, EditBox, instantiate, Node } from 'cc';
import { AVATARS } from '../../config/Avatars';
import { audio } from '../../core/AudioManager';
import { PopupBase } from '../../core/PopupBase';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import { profile } from '../../models/ProfileModel';
import { normalizeNickname } from '../../shared/protocol';
import { AvatarImage } from '../common/AvatarImage';

const { ccclass, property, menu } = _decorator;

/**
 * 暱稱與頭像設定。首次進入時為必填（不能關閉），之後點左上角名牌可再修改。
 * 頭像選項依 config/Avatars 動態產生（複製 Prefab 中的範本節點），新增頭像不需改 Prefab。
 */
@ccclass('ProfilePopup')
@menu('AnimePoker/ProfilePopup')
export class ProfilePopup extends PopupBase<boolean> {
    @property(EditBox)
    nicknameInput: EditBox | null = null;

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

    /** forced：首次設定，兩個欄位都填好才能關閉 */
    setup({ forced }: { forced: boolean }): void {
        this.closeOnBack = !forced;
        this.closeOnMask = !forced;
        if (this.closeButton) this.closeButton.node.active = !forced;
    }

    protected onLoad(): void {
        if (this.nicknameInput) this.nicknameInput.string = profile.nickname.value;
        this.buildAvatars();
        this.select(profile.avatarId.value);
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
                void audio.playSfx('ui_click');
                this.select(avatar.id);
            });
            this.options.set(avatar.id, node);
        }
    }

    private select(avatarId: string): void {
        this.selected = this.options.has(avatarId) ? avatarId : '';
        this.options.forEach((node, id) => {
            const mark = node.getChildByName('Selected');
            if (mark) mark.active = id === this.selected;
            node.setScale(id === this.selected ? 1.08 : 1, id === this.selected ? 1.08 : 1, 1);
        });
    }

    private save(): void {
        const nickname = normalizeNickname(this.nicknameInput?.string ?? '');
        if (!nickname) return this.showError('profile.nicknameRequired');
        if (!this.selected) return this.showError('profile.avatarRequired');
        profile.save(nickname, this.selected);
        void audio.playSfx('ui_click');
        this.close(true);
    }

    private showError(key: 'profile.nicknameRequired' | 'profile.avatarRequired' | null): void {
        if (!this.errorLabel) return;
        this.errorLabel.node.active = key !== null;
        if (key) this.errorLabel.setKey(key);
    }
}
