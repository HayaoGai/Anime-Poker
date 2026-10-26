import { AudioClip, SpriteFrame } from 'cc';
import { AVATAR_BUNDLE, AVATARS, avatarById, AvatarVariant, VOICE_ACTIONS } from '../config/Avatars';
import { AUDIO_BUNDLE, bgmPath, SFX_NAMES, sfxPath, type SfxName } from '../core/AudioManager';
import { loadBundle, loadBundles, preloadScene, type BundleName } from '../core/Bundles';
import { preloadResources } from '../core/ResourceCache';
import { labelFont } from '../i18n/LabelFont';

// 素材預載的時程：在前一個場景就把下一個場景會用到的素材排入背景佇列（依使用的先後排序），
// 切換畫面時圖片與人聲已在快取中，不必當下才下載（Web 上會晚一拍才出現）。
// Loading 只載入標題畫面需要的包，其餘的包（大廳、牌桌、頭像）在標題畫面才於背景載入。

/** 標題畫面之後才用到的包：只下載設定檔與索引，素材依下面的時程預載 */
const DEFERRED_BUNDLES: readonly BundleName[] = ['lobby', 'avatars', 'table'];

const UI_SFX: readonly SfxName[] = ['ui_click', 'ui_open', 'ui_close', 'notice'];

/** 標題畫面：完整字型（大廳的暱稱要用）、其餘的包、大廳場景、大廳會用到的介面音效、頭像選項、立繪與選擇頭像的人聲 */
export function preloadForLobby(): void {
    labelFont.loadFullFont();
    void loadBundles(DEFERRED_BUNDLES);
    void preloadScene('Lobby');
    preloadResources(AUDIO_BUNDLE, UI_SFX.map(sfxPath), AudioClip);
    preloadResources(AVATAR_BUNDLE, AVATARS.map((a) => a.texture[AvatarVariant.Icon]), SpriteFrame);
    // 立繪與人聲同時出現（點選頭像時），依頭像交錯排入
    for (const avatar of AVATARS) {
        preloadResources(AVATAR_BUNDLE, [avatar.texture[AvatarVariant.Full]], SpriteFrame);
        preloadResources(AVATAR_BUNDLE, [avatar.voice.select], AudioClip);
    }
}

/** 大廳：牌桌場景、牌面與籌碼、其餘音效、所有頭像的立繪與行動人聲，最後是牌桌 BGM */
export function preloadForTable(): void {
    void preloadScene('Table');
    // 引擎的 preloadDir 不會下載圖片，改為直接載入（與 CardFrames、TableView 載入同一批，結果共用快取）
    void loadBundle('table').then((table) => {
        table.loadDir('textures/cards', SpriteFrame);
        table.loadDir('textures/chips', SpriteFrame);
    });
    preloadResources(AUDIO_BUNDLE, SFX_NAMES.map(sfxPath), AudioClip);
    for (const avatar of AVATARS) preloadAvatarForTable(avatar.id);
    // 牌桌 BGM 是最大的檔案（數 MB），排在最後，不與人聲、圖片搶頻寬
    preloadResources(AUDIO_BUNDLE, [bgmPath('table')], AudioClip);
}

/** 牌桌座位的立繪與行動人聲；urgent 用於已入座的頭像，排到佇列最前面 */
export function preloadAvatarForTable(avatarId: string, urgent = false): void {
    const avatar = avatarById(avatarId);
    const voices = VOICE_ACTIONS.filter((action) => action !== 'select').map((action) => avatar.voice[action]);
    // urgent 會插到佇列最前面，後排入的先載入，因此圖片最後排入
    preloadResources(AVATAR_BUNDLE, voices, AudioClip, urgent);
    preloadResources(AVATAR_BUNDLE, [avatar.texture[AvatarVariant.Full]], SpriteFrame, urgent);
}
