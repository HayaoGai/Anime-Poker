import { AudioClip, director, resources, SpriteFrame } from 'cc';
import { AVATARS, avatarById, AvatarVariant, VOICE_ACTIONS } from '../config/Avatars';
import { bgmPath, SFX_NAMES, sfxPath, type SfxName } from '../core/AudioManager';
import { preloadResources } from '../core/ResourceCache';

// 素材預載的時程：在前一個場景就把下一個場景會用到的素材排入背景佇列（依使用的先後排序），
// 切換畫面時圖片與人聲已在快取中，不必當下才下載（Web 上會晚一拍才出現）。

const UI_SFX: readonly SfxName[] = ['ui_click', 'ui_open', 'ui_close', 'notice'];

/** 標題畫面：大廳會用到的介面音效、頭像選項、立繪與選擇頭像的人聲 */
export function preloadForLobby(): void {
    preloadResources(UI_SFX.map(sfxPath), AudioClip);
    preloadResources(AVATARS.map((a) => a.texture[AvatarVariant.Icon]), SpriteFrame);
    // 立繪與人聲同時出現（點選頭像時），依頭像交錯排入
    for (const avatar of AVATARS) {
        preloadResources([avatar.texture[AvatarVariant.Full]], SpriteFrame);
        preloadResources([avatar.voice.select], AudioClip);
    }
}

/** 大廳：牌桌場景、牌面與籌碼、其餘音效、所有頭像的座位圖與行動人聲，最後是牌桌 BGM */
export function preloadForTable(): void {
    director.preloadScene('Table');
    resources.preloadDir('textures/cards', SpriteFrame);
    resources.preloadDir('textures/chips', SpriteFrame);
    preloadResources(SFX_NAMES.map(sfxPath), AudioClip);
    for (const avatar of AVATARS) preloadAvatarForTable(avatar.id);
    // 牌桌 BGM 是最大的檔案（數 MB），排在最後，不與人聲、圖片搶頻寬
    preloadResources([bgmPath('table')], AudioClip);
}

/** 牌桌座位圖與行動人聲；urgent 用於已入座的頭像，排到佇列最前面 */
export function preloadAvatarForTable(avatarId: string, urgent = false): void {
    const avatar = avatarById(avatarId);
    const voices = VOICE_ACTIONS.filter((action) => action !== 'select').map((action) => avatar.voice[action]);
    // urgent 會插到佇列最前面，後排入的先載入，因此圖片最後排入
    preloadResources(voices, AudioClip, urgent);
    preloadResources([avatar.texture[AvatarVariant.Table]], SpriteFrame, urgent);
}
