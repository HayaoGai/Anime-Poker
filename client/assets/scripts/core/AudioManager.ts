import { AudioClip, AudioSource, director, Node } from 'cc';
import { avatarById, type VoiceAction } from '../config/Avatars';
import type { ActionKind } from '../shared/poker';
import { Observable } from './Observable';
import { loadResource } from './ResourceCache';
import { storage } from './Storage';

/** 與 tools/gen-sfx 產生的檔名一致 */
export type SfxName =
    | 'ui_click'
    | 'ui_open'
    | 'ui_close'
    | 'notice'
    | 'card_deal'
    | 'card_flip'
    | 'card_shuffle'
    | 'card_reveal'
    | 'chip_bet'
    | 'chip_collect'
    | 'chip_win'
    | 'check'
    | 'fold'
    | 'all_in'
    | 'your_turn'
    | 'timer_tick'
    | 'timer_warning'
    | 'win'
    | 'lose';

/** 背景音樂（使用者提供）：房間大廳、房間列表、牌桌 */
export type BgmName = 'room' | 'room_list' | 'table';

/** 牌局行動對應的人聲；all-in 優先 */
export function voiceActionFor(kind: ActionKind, allIn: boolean): VoiceAction {
    return allIn ? 'allIn' : kind;
}

/**
 * 音效、人聲與背景音樂。掛在常駐節點上，切換場景時 BGM 不中斷。
 * 素材不存在時（例如人聲尚未提供）靜默略過。
 */
class AudioService {
    readonly bgmVolume = new Observable(storage.get('bgmVolume', 0.6));
    readonly sfxVolume = new Observable(storage.get('sfxVolume', 0.9));

    private bgmSource: AudioSource | null = null;
    private sfxSource: AudioSource | null = null;
    private currentBgm: BgmName | null = null;

    constructor() {
        this.bgmVolume.subscribe((v) => {
            storage.set('bgmVolume', v);
            if (this.bgmSource) this.bgmSource.volume = v;
        }, false);
        this.sfxVolume.subscribe((v) => storage.set('sfxVolume', v), false);
    }

    async playSfx(name: SfxName, volumeScale = 1): Promise<void> {
        const clip = await loadResource(`audio/sfx/${name}`, AudioClip);
        if (clip) this.sources().sfx.playOneShot(clip, this.sfxVolume.value * volumeScale);
    }

    /** 依行動者的頭像播放人聲 */
    async playVoice(avatarId: string, action: VoiceAction): Promise<void> {
        const clip = await loadResource(avatarById(avatarId).voice[action], AudioClip);
        if (clip) this.sources().sfx.playOneShot(clip, this.sfxVolume.value);
    }

    /** 切換背景音樂；傳 null 停止。相同曲目不會重新開始 */
    async playBgm(name: BgmName | null): Promise<void> {
        if (name === this.currentBgm) return;
        this.currentBgm = name;
        const { bgm } = this.sources();
        bgm.stop();
        if (!name) return;

        const clip = await loadResource(`audio/bgm/${name}`, AudioClip);
        // 載入期間又切換了曲目，就不播放這首
        if (!clip || this.currentBgm !== name) return;
        bgm.clip = clip;
        bgm.loop = true;
        bgm.volume = this.bgmVolume.value;
        bgm.play();
    }

    pauseAll(): void {
        this.bgmSource?.pause();
    }

    resumeAll(): void {
        if (this.currentBgm && this.bgmSource?.clip) this.bgmSource.play();
    }

    private sources(): { bgm: AudioSource; sfx: AudioSource } {
        if (!this.bgmSource || !this.sfxSource || !this.bgmSource.isValid) {
            const node = new Node('AudioManager');
            director.getScene()!.addChild(node);
            director.addPersistRootNode(node);
            this.bgmSource = node.addComponent(AudioSource);
            this.sfxSource = node.addComponent(AudioSource);
        }
        return { bgm: this.bgmSource, sfx: this.sfxSource! };
    }
}

export const audio = new AudioService();
