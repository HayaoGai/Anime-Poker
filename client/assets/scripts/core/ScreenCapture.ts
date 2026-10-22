import { Camera, director, Director, RenderTexture, screen } from 'cc';
import { encodePng } from './PngEncoder';

/**
 * 截取攝影機畫面為 PNG：暫時把攝影機的輸出導到 RenderTexture，等一幀畫完後讀回像素再還原。
 * 截圖寬度上限 maxWidth，高度依螢幕比例。
 */
export async function captureToPng(camera: Camera, maxWidth = 1280): Promise<Uint8Array> {
    const size = screen.windowSize;
    const scale = Math.min(1, maxWidth / size.width);
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));

    const texture = new RenderTexture();
    texture.reset({ width, height });
    const previous = camera.targetTexture;
    camera.targetTexture = texture;
    try {
        await new Promise<void>((resolve) => director.once(Director.EVENT_AFTER_DRAW, () => resolve()));
        const pixels = texture.readPixels(0, 0, width, height);
        if (!pixels) throw new Error('readPixels 失敗');
        // GL 系的 framebuffer 原點在左下角，像素列由下往上
        return encodePng(pixels, width, height, { flipY: true });
    } finally {
        camera.targetTexture = previous;
        texture.destroy();
    }
}
