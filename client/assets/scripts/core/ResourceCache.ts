import { Asset } from 'cc';
import { loadBundle, type BundleName } from './Bundles';

type AssetType<T extends Asset> = new (...args: never[]) => T;

const cache = new Map<string, Promise<Asset | null>>();

function cacheKey<T extends Asset>(bundle: BundleName, path: string, type: AssetType<T>): string {
    return `${type.name}:${bundle}/${path}`;
}

/**
 * 從 bundle 依路徑載入資源並快取（bundle 尚未載入時先載入）。
 * 路徑不存在時直接回傳 null（先查詢目錄，不會觸發載入錯誤），用於人聲、BGM 等可選素材。
 */
export function loadResource<T extends Asset>(bundle: BundleName, path: string, type: AssetType<T>): Promise<T | null> {
    const key = cacheKey(bundle, path, type);
    let pending = cache.get(key);
    if (!pending) {
        pending = loadBundle(bundle).then((loaded) =>
            loaded.getInfoWithPath(path, type as never)
                ? new Promise<T | null>((resolve) => {
                      loaded.load(path, type as never, (err: Error | null, asset: T) => {
                          if (err) console.warn(`[${bundle}] 載入失敗：${path}`, err);
                          resolve(err ? null : asset);
                      });
                  })
                : null,
        );
        cache.set(key, pending);
    }
    return pending as Promise<T | null>;
}

/** 背景預載同時進行的數量：保留頻寬給當下就要用的素材 */
const PRELOAD_CONCURRENCY = 4;
const preloadQueue: { bundle: BundleName; path: string; type: AssetType<Asset> }[] = [];
let preloading = 0;

/**
 * 背景預載：排入佇列依序載入，結果與 loadResource 共用快取，之後取用不必再等待。
 * urgent 排到佇列最前面（例如已入座玩家的素材）。
 * 還沒輪到的項目若先被 loadResource 要求，會直接載入，不必等佇列。
 */
export function preloadResources<T extends Asset>(bundle: BundleName, paths: readonly string[], type: AssetType<T>, urgent = false): void {
    const items = paths.filter((path) => !cache.has(cacheKey(bundle, path, type))).map((path) => ({ bundle, path, type }));
    if (urgent) preloadQueue.unshift(...items);
    else preloadQueue.push(...items);
    pumpPreload();
}

function pumpPreload(): void {
    while (preloading < PRELOAD_CONCURRENCY && preloadQueue.length > 0) {
        const { bundle, path, type } = preloadQueue.shift()!;
        // 已被 loadResource 載入或重複排入的項目直接略過
        if (cache.has(cacheKey(bundle, path, type))) continue;
        preloading++;
        void loadResource(bundle, path, type).then(() => {
            preloading--;
            pumpPreload();
        });
    }
}
