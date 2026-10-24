import { Asset, resources } from 'cc';

type AssetType<T extends Asset> = new (...args: never[]) => T;

const cache = new Map<string, Promise<Asset | null>>();

function cacheKey<T extends Asset>(path: string, type: AssetType<T>): string {
    return `${type.name}:${path}`;
}

/**
 * 從 resources 依路徑載入資源並快取。
 * 路徑不存在時直接回傳 null（先查詢目錄，不會觸發載入錯誤），用於人聲、BGM 等可選素材。
 */
export function loadResource<T extends Asset>(path: string, type: AssetType<T>): Promise<T | null> {
    const key = cacheKey(path, type);
    let pending = cache.get(key);
    if (!pending) {
        pending = resources.getInfoWithPath(path, type as never)
            ? new Promise((resolve) => {
                  resources.load(path, type as never, (err: Error | null, asset: T) => {
                      if (err) console.warn(`[resources] 載入失敗：${path}`, err);
                      resolve(err ? null : asset);
                  });
              })
            : Promise.resolve(null);
        cache.set(key, pending);
    }
    return pending as Promise<T | null>;
}

/** 檢查資源是否存在（不載入） */
export function hasResource<T extends Asset>(path: string, type: AssetType<T>): boolean {
    return resources.getInfoWithPath(path, type as never) !== null;
}

/** 背景預載同時進行的數量：保留頻寬給當下就要用的素材 */
const PRELOAD_CONCURRENCY = 4;
const preloadQueue: { path: string; type: AssetType<Asset> }[] = [];
let preloading = 0;

/**
 * 背景預載：排入佇列依序載入，結果與 loadResource 共用快取，之後取用不必再等待。
 * urgent 排到佇列最前面（例如已入座玩家的素材）。
 * 還沒輪到的項目若先被 loadResource 要求，會直接載入，不必等佇列。
 */
export function preloadResources<T extends Asset>(paths: readonly string[], type: AssetType<T>, urgent = false): void {
    const items = paths.filter((path) => !cache.has(cacheKey(path, type))).map((path) => ({ path, type }));
    if (urgent) preloadQueue.unshift(...items);
    else preloadQueue.push(...items);
    pumpPreload();
}

function pumpPreload(): void {
    while (preloading < PRELOAD_CONCURRENCY && preloadQueue.length > 0) {
        const { path, type } = preloadQueue.shift()!;
        // 已被 loadResource 載入或重複排入的項目直接略過
        if (cache.has(cacheKey(path, type))) continue;
        preloading++;
        void loadResource(path, type).then(() => {
            preloading--;
            pumpPreload();
        });
    }
}
