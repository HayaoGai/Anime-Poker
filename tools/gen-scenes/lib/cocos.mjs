// Cocos Creator 3.8 場景／Prefab 的序列化。
// 以節點樹描述畫面，輸出與編輯器相同格式的 JSON（物件陣列，彼此以 __id__ 引用）。
// 欄位名稱取自引擎內建的預設 Prefab 與原始碼（resources/3d/engine）。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR } from '../../lib/common.mjs';

export const ASSETS = path.join(CLIENT_DIR, 'assets');

/** UI_2D 圖層 */
const LAYER_UI = 33554432;

// ------------------------------------------------------------------ uuid

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 腳本 class id：uuid 保留前 5 個十六進位字元，其餘每 3 個字元轉成 2 個 base64 字元（與 Cocos 編譯結果相同） */
export function compressUuid(uuid, reserved = 5) {
    const hex = uuid.replace(/-/g, '');
    let out = hex.slice(0, reserved);
    for (let i = reserved; i < 32; i += 3) {
        const v = parseInt(hex.substr(i, 3), 16);
        out += BASE64[v >> 6] + BASE64[v & 63];
    }
    return out;
}

/** 由字串決定的 uuid（同一路徑每次產生相同結果，重跑產生器不會改變引用） */
export function stableUuid(seed) {
    const h = createHash('sha1').update(seed).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** 節點與 fileId 用的短 id（22 字元 base64） */
function shortId(seed) {
    return createHash('sha1').update(seed).digest('base64').replace(/=+$/, '').slice(0, 22);
}

function readMeta(assetPath) {
    const metaFile = path.join(ASSETS, `${assetPath}.meta`);
    if (!existsSync(metaFile)) throw new Error(`找不到 ${assetPath}.meta，請先讓 Cocos 匯入此資源`);
    return JSON.parse(readFileSync(metaFile, 'utf8'));
}

/** 圖片的 SpriteFrame 引用，assetPath 相對於 assets/，例如 resources/textures/ui/btn_pill_pink.png */
export function spriteFrame(assetPath) {
    const meta = readMeta(assetPath);
    const frame = Object.values(meta.subMetas).find((s) => s.importer === 'sprite-frame');
    if (!frame) throw new Error(`${assetPath} 不是 sprite-frame`);
    return { __uuid__: frame.uuid, __expectedType__: 'cc.SpriteFrame' };
}

export function assetRef(assetPath, expectedType) {
    return { __uuid__: readMeta(assetPath).uuid, __expectedType__: expectedType };
}

/** 自訂腳本元件的 __type__ */
export function scriptType(scriptPath) {
    return compressUuid(readMeta(`scripts/${scriptPath}.ts`).uuid);
}

/** 由 generator 產生的資源（prefab、anim）預先決定 uuid：已有 .meta 時沿用 */
export function ownUuid(assetPath) {
    const metaFile = path.join(ASSETS, `${assetPath}.meta`);
    if (existsSync(metaFile)) return JSON.parse(readFileSync(metaFile, 'utf8')).uuid;
    return stableUuid(`anime-poker:${assetPath}`);
}

// ------------------------------------------------------------------ 值型別

export const vec2 = (x, y) => ({ __type__: 'cc.Vec2', x, y });
export const vec3 = (x, y, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });
export const size = (width, height) => ({ __type__: 'cc.Size', width, height });
export const color = (hex, a = 255) => {
    const v = hex.replace('#', '');
    return { __type__: 'cc.Color', r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16), a };
};

// ------------------------------------------------------------------ 節點樹

/**
 * 節點描述。components 中引用其他節點／元件時使用 ref(node) / ref(node, 'cc.Sprite')，
 * 序列化時轉成 __id__。
 */
export class N {
    constructor(name, options = {}) {
        this.name = name;
        this.position = options.position ?? [0, 0];
        this.scale = options.scale ?? [1, 1];
        this.angle = options.angle ?? 0;
        this.active = options.active ?? true;
        this.size = options.size ?? [100, 100];
        this.anchor = options.anchor ?? [0.5, 0.5];
        this.children = [];
        this.components = [];
    }

    add(...children) {
        this.children.push(...children.filter(Boolean));
        return this;
    }

    /** 加入元件：type 為 'cc.Sprite' 或腳本 class id，props 為序列化欄位 */
    with(type, props = {}) {
        this.components.push({ type, props });
        return this;
    }
}

/** 引用節點或節點上的元件 */
export const ref = (node, componentType) => ({ $ref: node, $component: componentType });

// ------------------------------------------------------------------ 序列化

class Doc {
    constructor(kind, assetPath) {
        this.kind = kind; // 'scene' | 'prefab'
        this.assetPath = assetPath;
        this.objects = [];
        this.nodeIds = new Map();
        this.componentIds = new Map();
        this.pending = [];
    }

    push(obj) {
        this.objects.push(obj);
        return this.objects.length - 1;
    }

    fileId(seed) {
        return shortId(`${this.assetPath}:${seed}`);
    }

    /** 第一輪：配置節點與元件物件；第二輪再解析 ref */
    writeNode(node, parentId, pathKey, prefabRootId) {
        const id = this.push(null);
        this.nodeIds.set(node, id);
        const rootId = prefabRootId ?? id;

        const childIds = node.children.map((child, i) => this.writeNode(child, id, `${pathKey}/${child.name}#${i}`, rootId));

        // UITransform 一律放第一個
        const components = [{ type: 'cc.UITransform', props: { _contentSize: size(...node.size), _anchorPoint: vec2(...node.anchor) } }, ...node.components];
        const componentIds = components.map((c, i) => {
            const compId = this.push(null);
            this.componentIds.set(`${id}:${c.type}`, compId);
            const obj = { __type__: c.type, _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: id }, _enabled: true, __prefab: null, ...c.props, _id: '' };
            if (this.kind === 'prefab') {
                obj.__prefab = { __id__: this.push({ __type__: 'cc.CompPrefabInfo', fileId: this.fileId(`${pathKey}:${c.type}:${i}`) }) };
            } else {
                obj._id = shortId(`${this.assetPath}:${pathKey}:${c.type}:${i}`);
            }
            this.objects[compId] = obj;
            this.pending.push(obj);
            return compId;
        });

        const rad = (node.angle * Math.PI) / 360;
        this.objects[id] = {
            __type__: 'cc.Node',
            _name: node.name,
            _objFlags: 0,
            __editorExtras__: {},
            _parent: parentId === null ? null : { __id__: parentId },
            _children: childIds.map((c) => ({ __id__: c })),
            _active: node.active,
            _components: componentIds.map((c) => ({ __id__: c })),
            _prefab:
                this.kind === 'prefab'
                    ? { __id__: this.push({ __type__: 'cc.PrefabInfo', root: { __id__: rootId }, asset: { __id__: 0 }, fileId: this.fileId(pathKey), instance: null, targetOverrides: null }) }
                    : null,
            _lpos: vec3(node.position[0], node.position[1], node.position[2] ?? 0),
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: Math.sin(rad), w: Math.cos(rad) },
            _lscale: vec3(node.scale[0], node.scale[1], 1),
            _mobility: 0,
            _layer: LAYER_UI,
            _euler: vec3(0, 0, node.angle),
            _id: this.kind === 'scene' ? shortId(`${this.assetPath}:${pathKey}`) : '',
        };
        return id;
    }

    resolveRefs() {
        const resolve = (value) => {
            if (Array.isArray(value)) return value.map(resolve);
            if (value && typeof value === 'object') {
                if ('$ref' in value) {
                    const nodeId = this.nodeIds.get(value.$ref);
                    if (nodeId === undefined) throw new Error(`引用的節點 ${value.$ref.name} 不在此文件中`);
                    if (!value.$component) return { __id__: nodeId };
                    const compId = this.componentIds.get(`${nodeId}:${value.$component}`);
                    if (compId === undefined) throw new Error(`節點 ${value.$ref.name} 沒有元件 ${value.$component}`);
                    return { __id__: compId };
                }
                return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
            }
            return value;
        };
        for (const obj of this.pending) {
            for (const key of Object.keys(obj)) {
                if (key !== 'node' && key !== '__prefab') obj[key] = resolve(obj[key]);
            }
        }
    }
}

const SCENE_GLOBALS = [
    { __type__: 'cc.SceneGlobals', ambient: 1, shadows: 2, _skybox: 3, fog: 4, octree: 5, skin: 6, lightProbeInfo: 7, postSettings: 8, bakedWithStationaryMainLight: false, bakedWithHighpLightmap: false },
    { __type__: 'cc.AmbientInfo', _skyColorHDR: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0.520833125 }, _skyColor: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0.520833125 }, _skyIllumHDR: 20000, _skyIllum: 20000, _groundAlbedoHDR: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 }, _groundAlbedo: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 }, _skyColorLDR: { __type__: 'cc.Vec4', x: 0.2, y: 0.5, z: 0.8, w: 1 }, _skyIllumLDR: 20000, _groundAlbedoLDR: { __type__: 'cc.Vec4', x: 0.2, y: 0.2, z: 0.2, w: 1 } },
    { __type__: 'cc.ShadowsInfo', _enabled: false, _type: 0, _normal: vec3(0, 1, 0), _distance: 0, _shadowColor: { __type__: 'cc.Color', r: 76, g: 76, b: 76, a: 255 }, _maxReceived: 4, _size: vec2(512, 512) },
    { __type__: 'cc.SkyboxInfo', _envLightingType: 0, _envmapHDR: null, _envmap: null, _envmapLDR: null, _diffuseMapHDR: null, _diffuseMapLDR: null, _enabled: false, _useHDR: true },
    { __type__: 'cc.FogInfo', _type: 0, _fogColor: { __type__: 'cc.Color', r: 200, g: 200, b: 200, a: 255 }, _enabled: false, _fogDensity: 0.3, _fogStart: 0.5, _fogEnd: 300, _fogAtten: 5, _fogTop: 1.5, _fogRange: 1.2, _accurate: false },
    { __type__: 'cc.OctreeInfo', _enabled: false, _minPos: vec3(-1024, -1024, -1024), _maxPos: vec3(1024, 1024, 1024), _depth: 8 },
    { __type__: 'cc.SkinInfo', _enabled: false, _blurRadius: 0.01, _sssIntensity: 3 },
    { __type__: 'cc.LightProbeInfo', _giScale: 1, _giSamples: 1024, _bounces: 2, _reduceRinging: 0, _showProbe: true, _showWireframe: true, _showConvex: false, _data: null, _lightProbeSphereVolume: 1 },
    { __type__: 'cc.PostSettingsInfo', _toneMappingType: 0 },
];

/**
 * 輸出場景。root 為 Canvas 節點（含 Camera），由 canvasNode() 建立。
 * @returns 寫入的路徑；檔案已存在且未指定 force 時略過並回傳 null
 */
export function writeScene(assetPath, root, { force = false } = {}) {
    const file = path.join(ASSETS, assetPath);
    if (existsSync(file) && !force) return null;

    const uuid = ownUuid(assetPath);
    const name = path.basename(assetPath, '.scene');
    const doc = new Doc('scene', assetPath);
    doc.push({ __type__: 'cc.SceneAsset', _name: name, _objFlags: 0, __editorExtras__: {}, _native: '', scene: { __id__: 1 } });
    const sceneId = doc.push(null);
    const canvasId = doc.writeNode(root, sceneId, root.name, null);
    const globalsBase = doc.objects.length;
    doc.objects[sceneId] = {
        __type__: 'cc.Scene',
        _name: name,
        _objFlags: 0,
        __editorExtras__: {},
        _parent: null,
        _children: [{ __id__: canvasId }],
        _active: true,
        _components: [],
        _prefab: null,
        _lpos: vec3(0, 0, 0),
        _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
        _lscale: vec3(1, 1, 1),
        _mobility: 0,
        _layer: 1073741824,
        _euler: vec3(0, 0, 0),
        autoReleaseAssets: false,
        _globals: { __id__: globalsBase },
        _id: uuid,
    };
    SCENE_GLOBALS.forEach((g, i) => {
        const copy = { ...g };
        if (i === 0) for (const k of ['ambient', 'shadows', '_skybox', 'fog', 'octree', 'skin', 'lightProbeInfo', 'postSettings']) copy[k] = { __id__: globalsBase + g[k] };
        doc.push(copy);
    });
    doc.resolveRefs();

    writeAsset(file, doc.objects, { uuid, importer: 'scene', ver: '1.1.50', userData: {} });
    return file;
}

/** 輸出 Prefab（執行時以 PopupManager 等實例化） */
export function writePrefab(assetPath, root, { force = false } = {}) {
    const file = path.join(ASSETS, assetPath);
    if (existsSync(file) && !force) return null;

    const uuid = ownUuid(assetPath);
    const name = path.basename(assetPath, '.prefab');
    const doc = new Doc('prefab', assetPath);
    doc.push({ __type__: 'cc.Prefab', _name: name, _objFlags: 0, __editorExtras__: {}, _native: '', data: { __id__: 1 }, optimizationPolicy: 0, persistent: false });
    doc.writeNode(root, null, root.name, null);
    doc.resolveRefs();

    writeAsset(file, doc.objects, { uuid, importer: 'prefab', ver: '1.1.50', userData: { syncNodeName: name } });
    return file;
}

/** 寫入資源檔；.meta 不存在時預先建立（指定 uuid，Cocos 匯入時會沿用） */
export function writeAsset(file, content, meta) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
    const metaFile = `${file}.meta`;
    if (!existsSync(metaFile)) {
        writeFileSync(
            metaFile,
            `${JSON.stringify({ ver: meta.ver, importer: meta.importer, imported: true, uuid: meta.uuid, files: ['.json'], subMetas: {}, userData: meta.userData }, null, 2)}\n`,
        );
    }
}
