import { Asset, resources } from 'cc';

type AssetType<T extends Asset> = new (...args: never[]) => T;

const cache = new Map<string, Promise<Asset | null>>();

/**
 * 從 resources 依路徑載入資源並快取。
 * 路徑不存在時直接回傳 null（先查詢目錄，不會觸發載入錯誤），用於人聲、BGM 等可選素材。
 */
export function loadResource<T extends Asset>(path: string, type: AssetType<T>): Promise<T | null> {
    const key = `${type.name}:${path}`;
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
