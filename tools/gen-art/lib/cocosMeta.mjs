// 修補 Cocos 匯入圖片後產生的 .meta：關閉自動裁切、設定 9-slice 邊界。
// .meta 由 Cocos 產生（uuid 由 Cocos 決定），這裡只修改 sprite-frame 的 userData。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * @param border [上, 右, 下, 左]，省略代表不切割
 * @returns 'missing'（尚未匯入）| 'patched' | 'unchanged'
 */
export function patchSpriteMeta(pngFile, { border } = {}) {
    const metaFile = `${pngFile}.meta`;
    if (!existsSync(metaFile)) return 'missing';

    const raw = readFileSync(metaFile, 'utf8');
    const meta = JSON.parse(raw);
    const frame = Object.values(meta.subMetas ?? {}).find((sub) => sub.importer === 'sprite-frame');
    if (!frame) return 'unchanged';

    const ud = frame.userData;
    // 不裁切透明邊緣：同類圖片尺寸一致，排版與對齊才可預期
    Object.assign(ud, {
        trimType: 'none',
        trimX: 0,
        trimY: 0,
        offsetX: 0,
        offsetY: 0,
        width: ud.rawWidth,
        height: ud.rawHeight,
    });
    if (border) {
        const [top, right, bottom, left] = border;
        Object.assign(ud, { borderTop: top, borderRight: right, borderBottom: bottom, borderLeft: left });
    }

    const next = `${JSON.stringify(meta, null, 2)}\n`;
    if (next === raw || next === `${raw}\n`) return 'unchanged';
    writeFileSync(metaFile, next);
    return 'patched';
}
