import { _decorator, AudioClip } from 'cc';
import { AUDIO_BUNDLE, bgmPath } from '../core/AudioManager';
import { loadBundles, preloadScene } from '../core/Bundles';
import { loadResource } from '../core/ResourceCache';
import { labelFont } from '../i18n/LabelFont';
import { initApp } from './App';

const { ccclass } = _decorator;

/** 進度的配重（約略依檔案大小）：bundle 設定檔很小；標題場景的素材約 0.7MB、標題 BGM 約 1.8MB、介面字型約 0.3MB */
const WEIGHT_BUNDLES = 0.05;
const WEIGHT_SCENE = 0.25;
const WEIGHT_BGM = 0.55;
const WEIGHT_FONT = 0.15;

/**
 * scripts 包的進入點。Loading 場景位於 main 包，不能直接 import 這裡的模組，
 * 載入 scripts 包後以類別名稱取得（js.getClassByName('Boot')）並呼叫 run。
 */
@ccclass('Boot')
export class Boot {
    /**
     * 初始化全域服務，載入標題畫面所需的包、標題場景的素材、標題 BGM 與目前語系的介面字型；
     * 完成後由 Loading 切換到標題畫面。onProgress 回報 0–1 的整體進度。
     */
    static async run(onProgress: (ratio: number) => void): Promise<void> {
        initApp();

        let bundles = 0;
        let scene = 0;
        let font = 0;
        let bgm = 0;
        const report = (): void =>
            onProgress(bundles * WEIGHT_BUNDLES + scene * WEIGHT_SCENE + bgm * WEIGHT_BGM + font * WEIGHT_FONT);

        // 介面字型屬於 common 包，initApp 時就開始載入（完整字型由標題畫面開始載入）
        const fontReady = labelFont.ready().then(() => {
            font = 1;
            report();
        });
        // 標題 BGM 載完（下載並解碼）才進入標題畫面，第一次點擊時就能立刻播放；
        // Web 的瀏覽器規定使用者點擊前不能發出聲音，因此標題畫面要等第一次點擊才會出聲
        const bgmReady = loadResource(AUDIO_BUNDLE, bgmPath('title'), AudioClip).then(() => {
            bgm = 1;
            report();
        });
        await loadBundles(['common', 'title', 'audio']);
        bundles = 1;
        report();
        await preloadScene('Title', (finished, total) => {
            // 項目總數會隨相依素材解析而增加，取最大值避免進度倒退
            scene = Math.max(scene, total > 0 ? finished / total : 0);
            report();
        });
        scene = 1;
        report();
        await Promise.all([fontReady, bgmReady]);
    }
}
