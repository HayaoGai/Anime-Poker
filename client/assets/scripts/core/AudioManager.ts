import { AudioClip, AudioSource, director, Node } from 'cc';
import { avatarById, type VoiceAction } from '../config/Avatars';
import type { ActionKind } from '../shared/poker';
import { Observable } from './Observable';
import { loadResource } from './ResourceCache';
import { storage } from './Storage';

/** 與 tools/gen-sfx 產生的檔名一致 */
export const SFX_NAMES = [
    'ui_click',
    'ui_open',
    'ui_close',
    'notice',
    'card_deal',
    'card_flip',
    'card_shuffle',
    'card_reveal',
    'chip_bet',
    'chip_collect',
    'chip_win',
    'check',
    'fold',
    'all_in',
    'your_turn',
    'timer_tick',
    'timer_warning',
    'win',
    'lose',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export function sfxPath(name: SfxName): string {
    return `audio/sfx/${name}`;
}

/** 背景音樂（使用者提供）：標題與大廳共用、牌桌 */
export type BgmName = 'title' | 'table';

/** 牌局行動對應的人聲；all-in 優先 */
export function voiceActionFor(kind: ActionKind, allIn: boolean): Exclude<VoiceAction, 'select'> {
    return allIn ? 'allIn' : kind;
}

/**
 * 音效、人聲與背景音樂。掛在常駐節點上，切換場景時 BGM 不中斷。
 * 素材不存在時（例如人聲尚未提供）靜默略過。
 */
class AudioService {
    readonly bgmVolume = new Observable(storage.get('bgmVolume', 0.6));
    readonly sfxVolume = new Observable(storage.get('sfxVolume', 0.9));
    /** 暫停選單的三個開關，預設開啟。關閉音樂只靜音，曲目照常進行，重新開啟時不會從頭播放 */
    readonly musicEnabled = new Observable(storage.get('musicEnabled', true));
    readonly sfxEnabled = new Observable(storage.get('sfxEnabled', true));
    readonly voiceEnabled = new Observable(storage.get('voiceEnabled', true));

    private bgmSource: AudioSource | null = null;
    private sfxSource: AudioSource | null = null;
    /** 選擇頭像的人聲：獨立音源，才能中斷上一句 */
    private voiceSource: AudioSource | null = null;
    private selectVoiceToken = 0;
    private currentBgm: BgmName | null = null;
    /** 切到背景時 BGM 正在播放，回到前景才需要接著播 */
    private bgmResumePending = false;

    constructor() {
        this.bgmVolume.subscribe((v) => {
            storage.set('bgmVolume', v);
            this.applyBgmVolume();
        }, false);
        this.sfxVolume.subscribe((v) => storage.set('sfxVolume', v), false);
        this.musicEnabled.subscribe((on) => {
            storage.set('musicEnabled', on);
            this.applyBgmVolume();
        }, false);
        this.sfxEnabled.subscribe((on) => storage.set('sfxEnabled', on), false);
        this.voiceEnabled.subscribe((on) => {
            storage.set('voiceEnabled', on);
            if (!on) this.stopSelectVoice();
        }, false);
    }

    async playSfx(name: SfxName, volumeScale = 1): Promise<void> {
        if (!this.sfxEnabled.value) return;
        const clip = await loadResource(sfxPath(name), AudioClip);
        if (clip && this.sfxEnabled.value) this.sources().sfx.playOneShot(clip, this.sfxVolume.value * volumeScale);
    }

    /** 依行動者的頭像播放人聲 */
    async playVoice(avatarId: string, action: VoiceAction): Promise<void> {
        if (!this.voiceEnabled.value) return;
        const clip = await loadResource(avatarById(avatarId).voice[action], AudioClip);
        if (clip && this.voiceEnabled.value) this.sources().sfx.playOneShot(clip, this.sfxVolume.value);
    }

    /** 播放選擇頭像的人聲，並中斷上一句仍在播放的 */
    async playSelectVoice(avatarId: string): Promise<void> {
        const token = ++this.selectVoiceToken;
        if (!this.voiceEnabled.value) return;
        const clip = await loadResource(avatarById(avatarId).voice.select, AudioClip);
        // 載入期間又選了別的頭像（或關閉了人聲），就不播放這句
        if (!clip || token !== this.selectVoiceToken) return;
        const { voice } = this.sources();
        voice.stop();
        voice.clip = clip;
        voice.loop = false;
        voice.volume = this.sfxVolume.value;
        voice.play();
    }

    /** 中斷選擇頭像的人聲（含載入中尚未播放的） */
    stopSelectVoice(): void {
        this.selectVoiceToken++;
        this.voiceSource?.stop();
    }

    /** 切換背景音樂；傳 null 停止。相同曲目不會重新開始 */
    async playBgm(name: BgmName | null): Promise<void> {
        if (name === this.currentBgm) return;
        this.currentBgm = name;
        this.bgmResumePending = false;
        const { bgm } = this.sources();
        bgm.stop();
        if (!name) return;

        const clip = await loadResource(`audio/bgm/${name}`, AudioClip);
        // 載入期間又切換了曲目，就不播放這首
        if (!clip || this.currentBgm !== name) return;
        bgm.clip = clip;
        bgm.loop = true;
        bgm.volume = this.bgmTargetVolume;
        bgm.play();
    }

    /**
     * 前景／背景切換。Web 上 WebBridge 與 Game.EVENT_HIDE/SHOW 會各通知一次，引擎本身也會中斷並恢復音源；
     * 對播放中的音源呼叫 play() 會從頭重播，因此只恢復由這裡暫停、且尚未恢復的 BGM。
     * 已停止的 BGM（例如牌桌曲目尚未提供）不會被恢復，避免播出殘留的上一首。
     */
    pauseAll(): void {
        if (!this.bgmSource?.playing) return;
        this.bgmResumePending = true;
        this.bgmSource.pause();
    }

    resumeAll(): void {
        if (!this.bgmResumePending) return;
        this.bgmResumePending = false;
        // 從暫停處接著播放
        if (this.bgmSource && !this.bgmSource.playing) this.bgmSource.play();
    }

    private get bgmTargetVolume(): number {
        return this.musicEnabled.value ? this.bgmVolume.value : 0;
    }

    private applyBgmVolume(): void {
        if (this.bgmSource) this.bgmSource.volume = this.bgmTargetVolume;
    }

    private sources(): { bgm: AudioSource; sfx: AudioSource; voice: AudioSource } {
        if (!this.bgmSource || !this.sfxSource || !this.voiceSource || !this.bgmSource.isValid) {
            const node = new Node('AudioManager');
            director.getScene()!.addChild(node);
            director.addPersistRootNode(node);
            this.bgmSource = node.addComponent(AudioSource);
            this.sfxSource = node.addComponent(AudioSource);
            this.voiceSource = node.addComponent(AudioSource);
            // 常駐節點在每次切換場景時都會重新 onEnable，playOnAwake（預設開啟）會把留著的 clip 再播一次
            //（例如選擇頭像的人聲），播放一律由程式控制
            for (const source of [this.bgmSource, this.sfxSource, this.voiceSource]) source.playOnAwake = false;
        }
        return { bgm: this.bgmSource, sfx: this.sfxSource!, voice: this.voiceSource! };
    }
}

export const audio = new AudioService();
