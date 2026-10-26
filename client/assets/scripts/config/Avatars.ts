import type { BundleName } from '../core/Bundles';
import { DEFAULT_AVATAR_IDS } from '../shared/protocol';

/** 頭像圖片與人聲所在的 bundle（assets/avatars）；AvatarDef 的路徑都相對於它 */
export const AVATAR_BUNDLE: BundleName = 'avatars';

/** 人聲對應的行動（每個頭像一組）：牌局行動，以及 select（選擇頭像時） */
export const VOICE_ACTIONS = ['check', 'bet', 'call', 'raise', 'fold', 'allIn', 'select'] as const;
export type VoiceAction = (typeof VOICE_ACTIONS)[number];

/** 同一頭像的不同圖片 */
export enum AvatarVariant {
    /** avatar_X_icon.png：頭像選項、名牌、房間大廳座位 */
    Icon,
    /** avatar_X_full.png：頭像設定的立繪、牌桌座位 */
    Full,
}

export interface AvatarDef {
    id: string;
    /** avatars 包裡的 SpriteFrame 路徑，依 AvatarVariant 索引 */
    texture: Record<AvatarVariant, string>;
    /** avatars 包裡的人聲 AudioClip 路徑；檔案不存在時靜默略過 */
    voice: Record<VoiceAction, string>;
}

function defaultAvatar(id: string): AvatarDef {
    return {
        id,
        texture: {
            [AvatarVariant.Icon]: `textures/${id}_icon/spriteFrame`,
            [AvatarVariant.Full]: `textures/${id}_full/spriteFrame`,
        },
        voice: Object.fromEntries(VOICE_ACTIONS.map((action) => [action, `voice/${id}/${action}`])) as Record<VoiceAction, string>,
    };
}

/**
 * 可選擇的頭像。新增頭像時：
 *   1. 圖片（<id>_icon.png、<id>_full.png）放到 avatars/textures/、人聲放到 avatars/voice/<id>/
 *   2. 在此清單加入一筆（id 只能用小寫英數、底線、連字號）
 * 伺服器只驗證 id 格式，電腦玩家則從 shared 的 DEFAULT_AVATAR_IDS 挑選。
 */
export const AVATARS: readonly AvatarDef[] = [...DEFAULT_AVATAR_IDS.map(defaultAvatar)];

export function avatarById(id: string): AvatarDef {
    return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
