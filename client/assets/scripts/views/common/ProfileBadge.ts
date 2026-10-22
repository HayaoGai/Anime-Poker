import { _decorator, Button, Label } from 'cc';
import { ViewBase } from '../../core/ViewBase';
import { profile } from '../../models/ProfileModel';
import { AvatarImage } from './AvatarImage';

const { ccclass, property, menu } = _decorator;

/** 左上角的頭像與暱稱，與玩家設定同步；點按開啟設定（由場景 View 處理 onClick） */
@ccclass('ProfileBadge')
@menu('AnimePoker/ProfileBadge')
export class ProfileBadge extends ViewBase {
    @property(AvatarImage)
    avatar: AvatarImage | null = null;

    @property(Label)
    nickname: Label | null = null;

    @property(Button)
    button: Button | null = null;

    onClick: (() => void) | null = null;

    protected onLoad(): void {
        this.bindLabel(this.nickname, profile.nickname);
        this.bind(profile.avatarId, (id) => this.avatar?.setAvatar(id));
        this.button?.node.on(Button.EventType.CLICK, () => this.onClick?.());
    }
}
