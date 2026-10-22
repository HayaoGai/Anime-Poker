// 程序合成遊戲音效（WAV），走清脆、可愛的電子音色。
//
//   pnpm gen:sfx
//
// 人聲配音與背景音樂由使用者提供，不在此產生。
import path from 'node:path';
import { CLIENT_DIR, info, success } from '../lib/common.mjs';
import { bell, finalize, mix, noise, noiseSource, note, reverb, silence, tone, writeWav } from './lib/synth.mjs';

const OUT = path.join(CLIENT_DIR, 'assets', 'resources', 'audio', 'sfx');

/** 指數滑音：t 秒內從 a 滑到 b */
const glide = (a, b, seconds) => (t) => a * (b / a) ** Math.min(1, t / seconds);

/** 籌碼碰撞聲：塑膠感的短促不和諧泛音 + 敲擊雜訊 */
function clink(pitch = 1, gain = 1, seed = 1) {
    const out = silence(0.12);
    for (const [f, a, d] of [[2300, 1, 0.03], [3650, 0.6, 0.022], [5200, 0.35, 0.015]]) {
        mix(out, tone({ freq: f * pitch, duration: 0.12, gain: a * gain, attack: 0.0005, decay: d }));
    }
    mix(out, noise({ duration: 0.02, low: 2500, gain: 0.5 * gain, decay: 0.004, seed }));
    return out;
}

/** 發牌的「咻」聲：帶通雜訊由高往低掃 */
function flick(seed = 3, gain = 1) {
    return mix(
        noise({ duration: 0.11, gain, attack: 0.004, decay: 0.035, low: glide(3500, 1200, 0.1), high: glide(9000, 4000, 0.1), seed }),
        tone({ freq: glide(220, 120, 0.03), duration: 0.04, gain: 0.25 * gain, decay: 0.012 }),
    );
}

/** 木魚般的敲擊（過牌） */
function knock(gain = 1) {
    return mix(
        tone({ freq: glide(320, 160, 0.04), duration: 0.09, gain, attack: 0.001, decay: 0.025 }),
        noise({ duration: 0.03, high: 1800, gain: 0.4 * gain, decay: 0.008, seed: 11 }),
    );
}

function sparkleShower(duration, count, { from = 2000, to = 4500, gain = 0.25, seed = 5 } = {}) {
    const out = silence(duration + 0.3);
    const rand = noiseSource(seed);
    for (let i = 0; i < count; i++) {
        const t = (i / count) * duration + (rand() * 0.5 + 0.5) * 0.02;
        const f = from + ((to - from) * i) / count + rand() * 200;
        mix(out, tone({ freq: f, duration: 0.25, gain: gain * (0.6 + 0.4 * Math.abs(rand())), attack: 0.002, decay: 0.06 }), t);
    }
    return out;
}

const SOUNDS = {
    // ---- 介面 ----
    ui_click: () => mix(tone({ freq: glide(1500, 900, 0.03), duration: 0.07, attack: 0.001, decay: 0.02 }), noise({ duration: 0.01, low: 4000, gain: 0.2 })),
    ui_open: () => {
        const out = silence(0.3);
        mix(out, bell(note('E6'), 0.3, 0.8), 0);
        mix(out, bell(note('B6'), 0.25, 0.7), 0.06);
        return reverb(out, { wet: 0.2, tail: 0.25 });
    },
    ui_close: () => {
        const out = silence(0.3);
        mix(out, bell(note('B5'), 0.3, 0.7), 0);
        mix(out, bell(note('E5'), 0.25, 0.8), 0.06);
        return reverb(out, { wet: 0.2, tail: 0.25 });
    },
    notice: () => {
        const out = silence(0.25);
        mix(out, tone({ freq: note('A5'), duration: 0.1, type: 'triangle', decay: 0.05 }), 0);
        mix(out, tone({ freq: note('D6'), duration: 0.14, type: 'triangle', decay: 0.07 }), 0.07);
        return out;
    },

    // ---- 牌 ----
    card_deal: () => flick(3),
    card_flip: () => mix(noise({ duration: 0.05, low: 2500, gain: 0.9, decay: 0.01, seed: 9 }), tone({ freq: glide(900, 500, 0.02), duration: 0.04, gain: 0.3, decay: 0.01 })),
    card_shuffle: () => {
        const out = silence(0.8);
        for (let i = 0; i < 14; i++) mix(out, flick(20 + i, 0.5 + 0.4 * Math.sin(i)), i * 0.045);
        return out;
    },
    card_reveal: () => {
        const out = mix(silence(0.6), SOUNDS.card_flip());
        mix(out, sparkleShower(0.25, 8, { from: 2600, to: 4200, gain: 0.3 }), 0.03);
        return reverb(out, { wet: 0.25 });
    },

    // ---- 籌碼 ----
    chip_bet: () => {
        const out = silence(0.25);
        mix(out, clink(1, 1, 1), 0);
        mix(out, clink(1.08, 0.7, 2), 0.05);
        return out;
    },
    chip_collect: () => {
        const out = silence(0.55);
        const rand = noiseSource(4);
        for (let i = 0; i < 8; i++) mix(out, clink(0.95 + rand() * 0.1, 0.5 + Math.abs(rand()) * 0.5, i + 3), i * 0.045 + Math.abs(rand()) * 0.015);
        return out;
    },
    chip_win: () => {
        const out = silence(1.1);
        for (let i = 0; i < 14; i++) mix(out, clink(1 + i * 0.035, 0.75, i + 30), i * 0.05);
        mix(out, sparkleShower(0.7, 12, { from: 2500, to: 5000, gain: 0.18 }), 0.1);
        return reverb(out, { wet: 0.2 });
    },

    // ---- 行動 ----
    check: () => {
        const out = silence(0.25);
        mix(out, knock(1), 0);
        mix(out, knock(0.8), 0.11);
        return out;
    },
    fold: () => noise({ duration: 0.32, gain: 0.7, attack: 0.04, decay: 0.12, low: glide(2600, 500, 0.3), high: glide(6000, 1500, 0.3), seed: 13 }),
    all_in: () => {
        const out = silence(1.4);
        mix(out, tone({ freq: glide(180, 900, 0.6), duration: 0.65, type: 'saw', gain: 0.35, attack: 0.05, release: 0.1 }), 0);
        mix(out, noise({ duration: 0.65, gain: 0.25, attack: 0.3, low: glide(800, 4000, 0.6), high: glide(3000, 10000, 0.6), seed: 17 }), 0);
        for (const n of ['C5', 'E5', 'G5', 'C6']) mix(out, bell(note(n), 0.75, 0.55), 0.6);
        mix(out, sparkleShower(0.5, 10, { from: 3000, to: 5500 }), 0.62);
        return reverb(out, { wet: 0.3, tail: 0.5 });
    },

    // ---- 計時 ----
    your_turn: () => {
        const out = silence(0.7);
        mix(out, bell(note('C6'), 0.5, 0.9), 0);
        mix(out, bell(note('G6'), 0.6, 0.8), 0.12);
        mix(out, sparkleShower(0.25, 6, { from: 3500, to: 5000, gain: 0.15 }), 0.15);
        return reverb(out, { wet: 0.25, tail: 0.4 });
    },
    timer_tick: () => tone({ freq: 1900, duration: 0.05, type: 'triangle', attack: 0.0005, decay: 0.012 }),
    timer_warning: () => {
        const out = silence(0.2);
        mix(out, tone({ freq: note('E6'), duration: 0.09, type: 'square', gain: 0.35, decay: 0.05 }), 0);
        mix(out, tone({ freq: note('E6'), duration: 0.09, type: 'sine', gain: 0.6, decay: 0.05 }), 0);
        return out;
    },

    // ---- 結算 ----
    win: () => {
        const out = silence(1.8);
        const melody = [['C5', 0], ['E5', 0.11], ['G5', 0.22], ['C6', 0.33]];
        for (const [n, t] of melody) {
            mix(out, tone({ freq: note(n), duration: 0.16, type: 'pulse25', gain: 0.3, decay: 0.12 }), t);
            mix(out, bell(note(n), 0.3, 0.5), t);
        }
        for (const n of ['C5', 'E5', 'G5', 'C6']) {
            mix(out, tone({ freq: note(n), duration: 1.1, type: 'triangle', gain: 0.25, attack: 0.02, decay: 0.6, release: 0.3, vibrato: { rate: 6, depth: 0.006, delay: 0.2 } }), 0.46);
        }
        mix(out, tone({ freq: note('C3'), duration: 1.2, type: 'triangle', gain: 0.35, decay: 0.5, release: 0.3 }), 0.46);
        mix(out, sparkleShower(0.9, 16, { from: 2500, to: 5500, gain: 0.16 }), 0.5);
        return reverb(out, { wet: 0.25, tail: 0.5 });
    },
    lose: () => {
        const out = silence(1.2);
        const notes = [['G4', 0, 0.22], ['E4', 0.22, 0.22], ['C4', 0.44, 0.6]];
        for (const [n, t, d] of notes) {
            const f = note(n);
            const freq = n === 'C4' ? (x) => f * (1 - 0.06 * Math.min(1, Math.max(0, x - 0.15) / 0.4)) : f;
            mix(out, tone({ freq, duration: d, type: 'triangle', gain: 0.7, attack: 0.01, decay: d * 0.8, release: 0.08, vibrato: { rate: 5, depth: 0.01 } }), t);
        }
        return reverb(out, { wet: 0.2, tail: 0.3 });
    },
};

for (const [name, make] of Object.entries(SOUNDS)) {
    const samples = finalize(make());
    writeWav(path.join(OUT, `${name}.wav`), samples);
    info(`${name}.wav（${(samples.length / 44100).toFixed(2)} 秒）`);
}
success(`音效產生完成：${Object.keys(SOUNDS).length} 個`);
