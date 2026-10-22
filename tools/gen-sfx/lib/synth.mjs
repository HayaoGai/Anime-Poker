// 極簡的程序音效合成：振盪器、雜訊、濾波、包絡、混音、殘響與 WAV 輸出。
// 隨機性使用固定種子，每次產出的音檔完全相同。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RATE = 44100;
const TAU = Math.PI * 2;

export function silence(seconds) {
    return new Float32Array(Math.ceil(seconds * RATE));
}

/** 可重現的亂數（-1～1） */
export function noiseSource(seed = 1) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state / 0xffffffff) * 2 - 1;
    };
}

const WAVES = {
    sine: (p) => Math.sin(p * TAU),
    triangle: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
    square: (p) => ((p % 1) < 0.5 ? 1 : -1),
    pulse25: (p) => ((p % 1) < 0.25 ? 1 : -1),
    saw: (p) => 2 * (p % 1) - 1,
};

/**
 * 單一音：頻率可為常數或隨時間變化的函式 f(t)。
 * 包絡：attack 線性上升，之後以 decay 為時間常數指數衰減；release 為結尾淡出長度。
 */
export function tone({ freq, duration, type = 'sine', gain = 1, attack = 0.003, decay = Infinity, release = 0.02, vibrato }) {
    const out = silence(duration);
    const wave = WAVES[type];
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        let f = typeof freq === 'function' ? freq(t) : freq;
        if (vibrato && t > (vibrato.delay ?? 0)) f *= 1 + vibrato.depth * Math.sin(TAU * vibrato.rate * t);
        phase += f / RATE;
        const env = Math.min(1, t / attack) * Math.exp(-t / decay) * Math.min(1, (duration - t) / release);
        out[i] = wave(phase) * env * gain;
    }
    return out;
}

/** 鐘聲：基頻加上不和諧泛音，高泛音衰減較快，聽起來清脆可愛 */
export function bell(freq, duration, gain = 1) {
    const partials = [
        [1, 1, 1],
        [2, 0.5, 0.6],
        [2.76, 0.32, 0.45],
        [5.4, 0.16, 0.25],
    ];
    const out = silence(duration);
    for (const [ratio, amp, decayScale] of partials) {
        mix(out, tone({ freq: freq * ratio, duration, gain: amp * gain, attack: 0.002, decay: duration * 0.35 * decayScale }), 0);
    }
    return out;
}

/** 帶通雜訊，cutoff 可為函式 f(t)（以狀態變數濾波器實作） */
export function noise({ duration, gain = 1, attack = 0.002, decay = Infinity, release = 0.01, low, high, seed = 7 }) {
    const out = silence(duration);
    const rand = noiseSource(seed);
    let lp = 0;
    let hpPrev = 0;
    let hpOut = 0;
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        let x = rand();
        if (high) {
            // 一階低通：上限頻率
            const fc = typeof high === 'function' ? high(t) : high;
            const a = 1 - Math.exp((-TAU * fc) / RATE);
            lp += a * (x - lp);
            x = lp;
        }
        if (low) {
            // 一階高通：下限頻率
            const fc = typeof low === 'function' ? low(t) : low;
            const a = Math.exp((-TAU * fc) / RATE);
            hpOut = a * (hpOut + x - hpPrev);
            hpPrev = x;
            x = hpOut;
        }
        const env = Math.min(1, t / attack) * Math.exp(-t / decay) * Math.min(1, (duration - t) / release);
        out[i] = x * env * gain;
    }
    return out;
}

/** 把 src 疊加到 dest 的 offset 秒處（超出範圍會截斷） */
export function mix(dest, src, offset = 0, gain = 1) {
    const start = Math.round(offset * RATE);
    for (let i = 0; i < src.length && start + i < dest.length; i++) dest[start + i] += src[i] * gain;
    return dest;
}

/** 輕量殘響：數條不同長度的回授延遲線並聯，再與原音混合 */
export function reverb(input, { wet = 0.25, decay = 0.5, tail = 0.4 } = {}) {
    const out = silence(input.length / RATE + tail);
    out.set(input);
    const delays = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.round(s * RATE));
    for (const d of delays) {
        const line = new Float32Array(out.length);
        for (let i = 0; i < out.length; i++) {
            const dry = i < input.length ? input[i] : 0;
            line[i] = dry + (i >= d ? line[i - d] * decay : 0);
        }
        for (let i = 0; i < out.length; i++) out[i] += ((line[i] - (i < input.length ? input[i] : 0)) * wet) / delays.length;
    }
    return out;
}

export const note = (name) => {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
    return 440 * 2 ** (semis / 12);
};

/**
 * 後製：去除直流偏移（例如脈衝波本身帶有的直流成分）、裁掉尾端低於 -60dB 的靜音、
 * 正規化到指定峰值，並在頭尾加極短淡入淡出避免爆音。
 */
export function finalize(input, peak = 0.85) {
    // 直流阻隔：y[n] = x[n] - x[n-1] + R * y[n-1]
    let samples = new Float32Array(input.length);
    let prevX = 0;
    let prevY = 0;
    for (let i = 0; i < input.length; i++) {
        prevY = input[i] - prevX + 0.995 * prevY;
        prevX = input[i];
        samples[i] = prevY;
    }

    let loudest = 0;
    for (const s of samples) loudest = Math.max(loudest, Math.abs(s));
    let end = samples.length;
    while (end > 0 && Math.abs(samples[end - 1]) < loudest * 0.001) end--;
    samples = samples.slice(0, Math.min(samples.length, end + Math.round(0.01 * RATE)));

    let max = 0;
    for (const s of samples) max = Math.max(max, Math.abs(s));
    const scale = max > 0 ? peak / max : 1;
    const fade = Math.round(0.002 * RATE);
    for (let i = 0; i < samples.length; i++) {
        const edge = Math.min(1, i / fade, (samples.length - 1 - i) / fade);
        samples[i] *= scale * edge;
    }
    return samples;
}

/** 輸出 16-bit PCM 單聲道 WAV */
export function writeWav(file, samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // 單聲道
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.concat([header, data]));
}
