import { _decorator, assetManager, Color, Component, director, easing, Graphics, js, Label, Node, UIOpacity } from 'cc';

const { ccclass, property, menu } = _decorator;

/** scripts 包的進入點（scripts/app/Boot.ts） */
interface BootEntry {
    run(onProgress: (ratio: number) => void): Promise<void>;
}

/** Web 範本（build-templates/web-mobile/index.ejs）提供的 HTML 啟動畫面 */
interface SplashHost {
    hideSplash?: () => Promise<void>;
}

/**
 * 作者圖（與 HTML 啟動畫面一致）：由黑幕淡入，同時由 0.7 倍放大到原尺寸；
 * 淡入完成後停留 INTRO_HOLD 秒再淡出回黑幕
 */
const INTRO_FADE_IN = 0.5;
const INTRO_SCALE_FROM = 0.7;
const INTRO_SCALE_TIME = 1.5;
const INTRO_HOLD = 3;
const INTRO_FADE_OUT = 0.5;
/** 進度條淡入淡出的秒數 */
const BAR_FADE = 0.25;
/** 進度條追上實際進度的速度：每秒拉近差距的比例，以及每秒至少前進的量 */
const BAR_CATCH_UP = 6;
const BAR_MIN_SPEED = 0.8;
/** 每格最多推進的秒數：場景剛載入的頭幾格常卡頓很久，不限制的話動畫會一閃而過 */
const MAX_STEP = 1 / 30;
/** scripts 包載入失敗時重試的間隔（毫秒） */
const RETRY_DELAY = 2000;

/**
 * 首場景（main 包只有這個場景與本腳本）：
 *   1. 作者圖淡入並由 0.7 倍放大，停留後淡出。Web 由 HTML 啟動畫面顯示（引擎載入前就出現），
 *      原生平台與編輯器預覽沒有 HTML 啟動畫面，改由本場景播放同樣的動畫。
 *   2. 同時載入 scripts 包，交由其中的 Boot 載入標題畫面所需的包、素材與字型。
 *   3. 作者圖結束時還沒載完才顯示進度條，載完後進入標題畫面。
 * 只依賴引擎，不 import scripts 包的模組（scripts 包此時尚未載入）。
 */
@ccclass('LoadingView')
@menu('AnimePoker/LoadingView')
export class LoadingView extends Component {
    @property({ type: Node, tooltip: '作者圖（原生平台與編輯器預覽才顯示；Web 由 HTML 啟動畫面顯示）' })
    author: Node | null = null;

    @property({ type: Graphics, tooltip: '畫進度條的 Graphics' })
    bar: Graphics | null = null;

    @property({ type: Label, tooltip: '進度百分比' })
    percent: Label | null = null;

    @property({ tooltip: '進度條寬度' })
    barWidth = 640;

    @property({ tooltip: '進度條高度' })
    barHeight = 14;

    @property({ tooltip: '進度條底色' })
    trackColor = new Color(255, 255, 255, 40);

    @property({ tooltip: '進度條顏色' })
    fillColor = new Color(255, 143, 177, 255);

    @property({ tooltip: '載入完成後進入的場景' })
    nextScene = 'Title';

    private introTime = -1;
    private introDone: (() => void) | null = null;
    private authorOpacity: UIOpacity | null = null;

    private target = 0;
    private shown = 0;
    private barAlpha = 0;
    private barAlphaTarget = 0;
    private readonly waiters: { until: () => boolean; resolve: () => void }[] = [];
    private readonly color = new Color();

    protected onLoad(): void {
        this.authorOpacity = this.author ? this.author.getComponent(UIOpacity) ?? this.author.addComponent(UIOpacity) : null;
        if (this.authorOpacity) this.authorOpacity.opacity = 0;
        this.drawBar();
    }

    protected start(): void {
        void this.run();
    }

    protected update(dt: number): void {
        const step = Math.min(dt, MAX_STEP);
        if (this.introTime >= 0) this.updateIntro(step);

        if (this.barAlpha !== this.barAlphaTarget || this.shown !== this.target) {
            const fade = step / BAR_FADE;
            this.barAlpha = this.barAlphaTarget > this.barAlpha ? Math.min(this.barAlphaTarget, this.barAlpha + fade) : Math.max(this.barAlphaTarget, this.barAlpha - fade);
            const gap = this.target - this.shown;
            this.shown = gap > 0 ? Math.min(this.target, this.shown + Math.max(gap * BAR_CATCH_UP, BAR_MIN_SPEED) * step) : this.target;
            this.drawBar();
        }

        for (let i = this.waiters.length - 1; i >= 0; i--) {
            if (!this.waiters[i].until()) continue;
            this.waiters[i].resolve();
            this.waiters.splice(i, 1);
        }
    }

    private async run(): Promise<void> {
        let loaded = false;
        const loading = this.load().then(() => (loaded = true));
        await this.playIntro();
        // 作者圖停留期間就載完了（例如有快取），直接進入標題畫面，不閃一下進度條
        if (!loaded) {
            this.barAlphaTarget = 1;
            await loading;
            await this.waitUntil(() => this.shown >= 1);
            this.barAlphaTarget = 0;
            await this.waitUntil(() => this.barAlpha <= 0);
        }
        director.loadScene(this.nextScene);
    }

    private async load(): Promise<void> {
        const boot = await this.loadBoot();
        await boot.run((ratio) => (this.target = Math.max(this.target, Math.min(ratio, 1))));
        this.target = 1;
    }

    /** 載入 scripts 包，失敗時（多半是網路暫時中斷）自動重試 */
    private loadBoot(): Promise<BootEntry> {
        return new Promise((resolve) => {
            const attempt = (): void => {
                assetManager.loadBundle('scripts', (err) => {
                    if (err) {
                        console.warn(`[Loading] scripts 載入失敗，${RETRY_DELAY / 1000} 秒後重試`, err);
                        setTimeout(attempt, RETRY_DELAY);
                        return;
                    }
                    resolve(js.getClassByName('Boot') as unknown as BootEntry);
                });
            };
            attempt();
        });
    }

    private playIntro(): Promise<void> {
        const hideSplash = (globalThis as SplashHost).hideSplash;
        if (hideSplash) {
            if (this.author) this.author.active = false;
            return hideSplash();
        }
        if (!this.author) return Promise.resolve();
        this.introTime = 0;
        this.updateIntro(0);
        return new Promise((resolve) => (this.introDone = resolve));
    }

    private updateIntro(step: number): void {
        this.introTime += step;
        const t = this.introTime;
        const enter = easing.sineOut(Math.min(t / INTRO_FADE_IN, 1));
        const grow = easing.quintOut(Math.min(t / INTRO_SCALE_TIME, 1));
        const leave = Math.min(Math.max((t - INTRO_FADE_IN - INTRO_HOLD) / INTRO_FADE_OUT, 0), 1);
        const scale = INTRO_SCALE_FROM + (1 - INTRO_SCALE_FROM) * grow;
        this.author?.setScale(scale, scale, 1);
        if (this.authorOpacity) this.authorOpacity.opacity = 255 * enter * (1 - leave);
        if (leave >= 1) {
            this.introTime = -1;
            if (this.author) this.author.active = false;
            this.introDone?.();
            this.introDone = null;
        }
    }

    /** Graphics 不受 UIOpacity 影響，淡入淡出以顏色的透明度重畫 */
    private drawBar(): void {
        const g = this.bar;
        if (g) {
            const w = this.barWidth;
            const h = this.barHeight;
            g.clear();
            g.fillColor = this.withAlpha(this.trackColor);
            g.roundRect(-w / 2, -h / 2, w, h, h / 2);
            g.fill();
            if (this.shown > 0) {
                g.fillColor = this.withAlpha(this.fillColor);
                g.roundRect(-w / 2, -h / 2, Math.max(h, w * this.shown), h, h / 2);
                g.fill();
            }
        }
        if (this.percent) {
            this.percent.string = `${Math.floor(this.shown * 100)}%`;
            this.percent.color = this.withAlpha(Color.WHITE);
        }
    }

    private withAlpha(color: Readonly<Color>): Color {
        return this.color.set(color.r, color.g, color.b, color.a * this.barAlpha);
    }

    private waitUntil(until: () => boolean): Promise<void> {
        return new Promise((resolve) => this.waiters.push({ until, resolve }));
    }
}
