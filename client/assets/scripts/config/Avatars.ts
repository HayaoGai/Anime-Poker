import { DEFAULT_AVATAR_IDS } from '../shared/protocol';

/** 人聲對應的行動（每個頭像一組）：牌局行動，以及 select（選擇頭像時） */
export const VOICE_ACTIONS = ['check', 'bet', 'call', 'raise', 'fold', 'allIn', 'select'] as const;
export type VoiceAction = (typeof VOICE_ACTIONS)[number];

export interface AvatarDef {
    id: string;
    /** resources 底下的 SpriteFrame 路徑 */
    texture: string;
    /** resources 底下的人聲 AudioClip 路徑；檔案不存在時靜默略過 */
    voice: Record<VoiceAction, string>;
}

function defaultAvatar(id: string): AvatarDef {
    return {
        id,
        texture: `textures/avatars/${id}/spriteFrame`,
        voice: Object.fromEntries(VOICE_ACTIONS.map((action) => [action, `audio/voice/${id}/${action}`])) as Record<VoiceAction, string>,
    };
}

/**
 * 可選擇的頭像。新增頭像時：
 *   1. 圖片放到 resources/textures/avatars/、人聲放到 resources/audio/voice/<id>/
 *   2. 在此清單加入一筆（id 只能用小寫英數、底線、連字號）
 * 伺服器只驗證 id 格式，電腦玩家則從 shared 的 DEFAULT_AVATAR_IDS 挑選。
 */
export const AVATARS: readonly AvatarDef[] = [...DEFAULT_AVATAR_IDS.map(defaultAvatar)];

export function avatarById(id: string): AvatarDef {
    return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
