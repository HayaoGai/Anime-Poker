// AnimationClip（.anim）的序列化。格式對應引擎原始碼 cocos/animation/tracks 與 cocos/core/curves：
// JSON 格式下 RealCurve 直接寫出 _times / _values（只有二進位 CCON 才壓縮成 bytes）。
import path from 'node:path';
import { ASSETS, ownUuid, writeAsset } from './cocos.mjs';

const INTERPOLATION = { linear: 0, constant: 1, cubic: 2 };
const WRAP_MODE = { normal: 1, loop: 2, pingpong: 22 };
/** ExtrapolationMode.CLAMP */
const CLAMP = 1;

/** 動畫目標路徑：子節點名稱、元件、屬性名稱，例如 node('Panel')、component('cc.UIOpacity')、'opacity' */
export const child = (nodePath) => ({ __type__: 'cc.animation.HierarchyPath', path: nodePath });
export const component = (type) => ({ __type__: 'cc.animation.ComponentPath', component: type });

function curve(keys, interp) {
    return {
        __type__: 'cc.RealCurve',
        _times: keys.map(([t]) => t),
        _values: keys.map(([, value]) => ({
            __type__: 'cc.RealKeyframeValue',
            interpolationMode: INTERPOLATION[interp],
            tangentWeightMode: 0,
            value,
            rightTangent: 0,
            rightTangentWeight: 0,
            leftTangent: 0,
            leftTangentWeight: 0,
            easingMethod: 0,
        })),
        preExtrapolation: CLAMP,
        postExtrapolation: CLAMP,
    };
}

const channel = (keys, interp) => ({ __type__: 'cc.animation.Channel', _curve: curve(keys, interp) });

const binding = (paths) => ({ __type__: 'cc.animation.TrackBinding', path: { __type__: 'cc.animation.TrackPath', _paths: paths }, proxy: null });

/** 單一數值軌道，例如 UIOpacity.opacity。keys 為 [時間, 值] */
export function realTrack(paths, keys, { interp = 'cubic' } = {}) {
    return { __type__: 'cc.animation.RealTrack', _binding: binding(paths), _channel: channel(keys, interp) };
}

/** 向量軌道，例如 position / scale。keys 為 [時間, [x, y, z]] */
export function vec3Track(paths, keys, { interp = 'cubic' } = {}) {
    const channels = [0, 1, 2, 3].map((i) => channel(i < 3 ? keys.map(([t, v]) => [t, v[i] ?? 0]) : [], interp));
    return { __type__: 'cc.animation.VectorTrack', _binding: binding(paths), _channels: channels, _nComponents: 3 };
}

/** 顏色軌道。keys 為 [時間, [r, g, b, a]] */
export function colorTrack(paths, keys, { interp = 'linear' } = {}) {
    const channels = [0, 1, 2, 3].map((i) => channel(keys.map(([t, v]) => [t, v[i]]), interp));
    return { __type__: 'cc.animation.ColorTrack', _binding: binding(paths), _channels: channels };
}

/**
 * 輸出 .anim。name 即動畫狀態名稱（Animation.play(name)），與檔名相同。
 * @param events 影格事件 [{ frame: 秒, func: 方法名稱, params: [] }]，呼叫掛在同一節點上的元件方法
 */
export function writeClip(assetPath, { duration, wrapMode = 'normal', tracks, events = [], speed = 1 }) {
    const file = path.join(ASSETS, assetPath);
    const name = path.basename(assetPath, '.anim');
    const clip = {
        __type__: 'cc.AnimationClip',
        _name: name,
        _objFlags: 0,
        __editorExtras__: { embeddedPlayerGroups: [] },
        _native: '',
        sample: 60,
        speed,
        wrapMode: WRAP_MODE[wrapMode],
        enableTrsBlending: false,
        _duration: duration,
        _hash: 0,
        _tracks: tracks,
        _exoticAnimation: null,
        _events: events,
        _embeddedPlayers: [],
        _additiveSettings: { __type__: 'cc.AnimationClipAdditiveSettings', enabled: false, refClip: null },
        _auxiliaryCurveEntries: [],
    };
    const uuid = ownUuid(assetPath);
    writeAsset(file, clip, { uuid, importer: 'animation-clip', ver: '2.0.3', userData: { name } });
    return { file, ref: { __uuid__: uuid, __expectedType__: 'cc.AnimationClip' } };
}
