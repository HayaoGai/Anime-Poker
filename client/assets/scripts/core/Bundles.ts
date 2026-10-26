import { assetManager, AssetManager, director } from 'cc';

/**
 * 素材依場景或功能分成獨立的 Asset Bundle（assets 底下同名的資料夾）。
 * main 包只有 Loading 場景；本模組所在的 scripts 包由 Loading 第一個載入，其餘的包都經由這裡取得：
 *   - common：共用彈窗、按鈕圖示與介面圖集、粒子貼圖、字型
 *   - title／lobby／table：各場景與其專屬的 Prefab、動畫、圖片
 *   - avatars：頭像圖片與人聲（大廳與牌桌共用）
 *   - audio：音效與背景音樂
 * Loading 載入 common、title、audio 後進入標題畫面，其餘的包在標題畫面於背景載入（見 app/Preload.ts）。
 */
export type BundleName = 'common' | 'title' | 'lobby' | 'table' | 'avatars' | 'audio';

export type SceneName = 'Title' | 'Lobby' | 'Table';

/** 場景所在的 bundle */
const SCENE_BUNDLES: Record<SceneName, BundleName> = {
    Title: 'title',
    Lobby: 'lobby',
    Table: 'table',
};

/** 載入失敗時重試的間隔（毫秒）：多半是網路暫時中斷，不必讓玩家手動重新整理 */
const RETRY_DELAY = 2000;

const pending = new Map<BundleName, Promise<AssetManager.Bundle>>();

/** 載入 bundle（只下載設定檔與索引，素材在用到或預載時才下載）；同一個包只載入一次，失敗時自動重試 */
export function loadBundle(name: BundleName): Promise<AssetManager.Bundle> {
    let bundle = pending.get(name);
    if (!bundle) {
        bundle = new Promise((resolve) => {
            const attempt = (): void => {
                assetManager.loadBundle(name, (err, loaded) => {
                    if (!err) {
                        resolve(loaded);
                        return;
                    }
                    console.warn(`[Bundles] ${name} 載入失敗，${RETRY_DELAY / 1000} 秒後重試`, err);
                    setTimeout(attempt, RETRY_DELAY);
                });
            };
            const loaded = assetManager.getBundle(name);
            if (loaded) resolve(loaded);
            else attempt();
        });
        pending.set(name, bundle);
    }
    return bundle;
}

export function loadBundles(names: readonly BundleName[]): Promise<AssetManager.Bundle[]> {
    return Promise.all(names.map(loadBundle));
}

/** 切換場景；所在的 bundle 尚未載入時先載入 */
export async function loadScene(name: SceneName): Promise<void> {
    await loadBundle(SCENE_BUNDLES[name]);
    director.loadScene(name);
}

/**
 * 預載場景：下載並載入場景的所有相依素材，之後切換到該場景不必再等待；onProgress 回報已完成與總項目數。
 * 引擎的 preloadScene 只下載描述檔，圖片要到切換場景時才下載，因此改以 loadScene 載入但不執行
 *（場景本身不會被快取，相依素材會）。下載失敗時仍會完成（切換場景時會再嘗試一次），不讓預載卡住流程。
 */
export async function preloadScene(name: SceneName, onProgress?: (finished: number, total: number) => void): Promise<void> {
    const bundle = await loadBundle(SCENE_BUNDLES[name]);
    await new Promise<void>((resolve) => {
        bundle.loadScene(name, (finished, total) => onProgress?.(finished, total), (err) => {
            if (err) console.warn(`[Bundles] 預載場景 ${name} 失敗`, err);
            resolve();
        });
    });
}
