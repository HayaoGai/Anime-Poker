// 各場景共用的節點結構：Canvas、角落的系統按鈕、彈窗外殼與開關動畫、共用彈窗 Prefab。
import { N, color, ownUuid, ref, scriptType, writePrefab } from './lib/cocos.mjs';
import { child, component, realTrack, vec3Track, writeClip } from './lib/anim.mjs';
import { C, animation, blockInput, iconButton, label, localized, opacity, pillButton, safeArea, script, solid, sprite, stretch, tex, widget } from './lib/ui.mjs';

export const prefabRef = (assetPath) => ({ __uuid__: ownUuid(assetPath), __expectedType__: 'cc.Prefab' });

/** 引用自訂腳本元件時使用的型別（與 script() 掛上的 __type__ 相同） */
export const scriptTypeOf = (scriptPath) => scriptType(scriptPath);

export const PREFABS = {
    confirm: 'prefabs/common/ConfirmPopup.prefab',
    credits: 'prefabs/common/CreditsPopup.prefab',
    languageMenu: 'prefabs/common/LanguageMenu.prefab',
};

// ------------------------------------------------------------------ 動畫

/** 彈窗開關動畫：所有彈窗的子節點都命名為 Mask / Panel，因此共用同一組 AnimationClip */
export function writePopupClips() {
    const open = writeClip('animations/popup_open.anim', {
        duration: 0.32,
        tracks: [
            vec3Track([child('Panel'), 'scale'], [[0, [0.6, 0.6, 1]], [0.2, [1.06, 1.06, 1]], [0.32, [1, 1, 1]]]),
            realTrack([child('Mask'), component('cc.UIOpacity'), 'opacity'], [[0, 0], [0.18, 255]], { interp: 'linear' }),
        ],
    });
    const close = writeClip('animations/popup_close.anim', {
        duration: 0.16,
        tracks: [
            vec3Track([child('Panel'), 'scale'], [[0, [1, 1, 1]], [0.16, [0.7, 0.7, 1]]]),
            realTrack([child('Mask'), component('cc.UIOpacity'), 'opacity'], [[0, 255], [0.16, 0]], { interp: 'linear' }),
        ],
    });
    return [open.ref, close.ref];
}

// ------------------------------------------------------------------ Canvas

/**
 * 場景根節點 Canvas（含 Camera、AppRoot、ScreenAdapter）。
 * 回傳 canvas 與 safe：safe 為貼齊安全區域的全螢幕容器，角落按鈕放在其中。
 */
export function canvasNode() {
    const camera = new N('Camera').with('cc.Camera', {
        _projection: 0,
        _priority: 0,
        _fov: 45,
        _fovAxis: 0,
        _orthoHeight: 540,
        _near: 0,
        _far: 2000,
        _color: color('#231c3a'),
        _depth: 1,
        _stencil: 0,
        _clearFlags: 7,
        _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
        _aperture: 19,
        _shutter: 7,
        _iso: 0,
        _screenScale: 1,
        _visibility: 1108344832,
        _targetTexture: null,
        _postProcess: null,
        _usePostProcess: false,
        _cameraType: -1,
        _trackingType: 0,
    });
    const canvas = new N('Canvas', { size: [1920, 1080], position: [960, 540] });
    canvas.with('cc.Canvas', { _cameraComponent: ref(camera, 'cc.Camera'), _alignCanvasWithScreen: true });
    stretch(canvas, 'always');
    script(canvas, 'app/AppRoot');
    script(canvas, 'core/ScreenAdapter');
    canvas.add(camera);

    const safe = new N('SafeArea', { size: [1920, 1080] });
    stretch(safe);
    safeArea(safe);
    return { canvas, safe };
}

/** 右上角：語系按鈕 + 全螢幕按鈕（語系在左） */
export function systemButtons() {
    const language = iconButton('LanguageButton', 'icon_language', { position: [-124, 0] });
    script(language, 'views/common/LanguageButton', { menuPrefab: prefabRef(PREFABS.languageMenu) });

    const fullscreen = iconButton('FullscreenButton', 'icon_fullscreen_enter', { base: 'ui/btn_circle_pink', position: [0, 0] });
    const icon = fullscreen.children.find((c) => c.name === 'Icon');
    script(fullscreen, 'views/common/FullscreenButton', {
        icon: ref(icon, 'cc.Sprite'),
        enterFrame: tex('icons/icon_fullscreen_enter'),
        exitFrame: tex('icons/icon_fullscreen_exit'),
    });

    // 容器的錨點在右上，Widget 貼齊右上角；按鈕座標以最右側按鈕的中心為原點
    const container = new N('SystemButtons', { size: [228, 104], anchor: [1, 1] });
    widget(container, { top: 28, right: 28 });
    language.position = [-176, -52];
    fullscreen.position = [-52, -52];
    return container.add(language, fullscreen);
}

// ------------------------------------------------------------------ 彈窗

/**
 * 彈窗外殼：全螢幕根節點（PopupBase 子類別 + Animation）＞ Mask（半透明遮罩）、Panel（面板）。
 * @param props 腳本的其他欄位（可用 ref 引用 panel 內的節點）
 */
export function popupShell(name, scriptPath, { width, height, clips, maskAlpha = 150, panelFrame = 'ui/panel_popup', panelPosition = [0, 0], panelWidget, closeOnMask = true, closeOnBack = true }, buildPanel, props = () => ({})) {
    const mask = solid('Mask', 1920, 1080, C.black, maskAlpha);
    stretch(mask);
    blockInput(mask);
    opacity(mask);

    const panel = new N('Panel', { size: [width, height], position: panelPosition });
    if (panelFrame) sprite(panel, tex(panelFrame), { type: 'sliced' });
    // 需要貼齊螢幕邊緣的面板（例如角落按鈕的下拉選單）以 Widget 對齊
    if (panelWidget) widget(panel, panelWidget);
    blockInput(panel);
    buildPanel(panel);

    const root = new N(name, { size: [1920, 1080] });
    stretch(root);
    animation(root, clips);
    script(root, scriptPath, {
        mask: ref(mask),
        panel: ref(panel),
        animation: ref(root, 'cc.Animation'),
        closeOnMask,
        closeOnBack,
        ...props(panel),
    });
    return root.add(mask, panel);
}

/** 面板標題 */
export function panelTitle(key, y, width) {
    const node = new N('Title', { size: [width, 70], position: [0, y] });
    label(node, '', { fontSize: 46, tint: C.pinkDeep });
    return localized(node, key);
}

/** 面板右上角的關閉按鈕 */
export function closeButton(panelWidth, panelHeight) {
    return iconButton('CloseButton', 'icon_close', { base: 'ui/btn_circle_pink', diameter: 80, iconSize: 44, position: [panelWidth / 2 - 30, panelHeight / 2 - 30] });
}

// ------------------------------------------------------------------ 共用 Prefab

export function writeCommonPrefabs({ force } = {}) {
    const clips = writePopupClips();
    const written = [];

    // 確認框
    {
        const message = new N('Message', { size: [780, 230], position: [0, 50] });
        label(message, '', { fontSize: 40, tint: C.ink, wrap: true, overflow: 'shrink' });
        localized(message, 'title.exitConfirm');
        const ok = pillButton('OkButton', 'common.ok', { position: [170, -150] });
        const cancel = pillButton('CancelButton', 'common.cancel', { base: 'ui/btn_pill_lavender', position: [-170, -150] });
        const root = popupShell('ConfirmPopup', 'views/common/ConfirmPopup', { width: 900, height: 500, clips }, (panel) => panel.add(message, ok, cancel), () => ({
            message: ref(message, scriptTypeOf('i18n/LocalizedLabel')),
            okButton: ref(ok, 'cc.Button'),
            cancelButton: ref(cancel, 'cc.Button'),
        }));
        written.push(writePrefab(PREFABS.confirm, root, { force }));
    }

    // 製作人員
    {
        const W = 1000;
        const H = 600;
        const avatarMask = new N('Avatar', { size: [240, 240], position: [-280, -20] });
        avatarMask.with('cc.Mask', { _type: 1, _inverted: false, _segments: 64, _alphaThreshold: 0.1 });
        const photo = sprite(new N('Photo', { size: [240, 240] }), tex('credits/author'));
        avatarMask.add(photo);
        const frame = sprite(new N('Frame', { size: [290, 290], position: [-280, -20] }), tex('ui/avatar_frame'));

        const name = label(new N('Name', { size: [460, 90], position: [160, 60], anchor: [0.5, 0.5] }), 'Lance', { fontSize: 72, tint: C.purpleDeep, outline: { color: C.white, width: 4 } });
        const role = localized(label(new N('Role', { size: [460, 50], position: [160, -10] }), '', { fontSize: 30, tint: C.inkSoft, bold: false }), 'credits.role');
        const email = label(new N('Email', { size: [460, 50], position: [160, -80] }), 'hayaogai@gmail.com', { fontSize: 32, tint: C.pinkDeep, bold: false });
        const version = new N('Version', { size: [360, 44], anchor: [1, 0], position: [W / 2 - 40, -H / 2 + 28] });
        label(version, '', { fontSize: 26, tint: C.inkSoft, align: 'right', bold: false });
        localized(version, 'credits.version', ['version=…']);
        const close = closeButton(W, H);

        const root = popupShell('CreditsPopup', 'views/common/CreditsPopup', { width: W, height: H, clips }, (panel) =>
            panel.add(panelTitle('credits.title', H / 2 - 70, 600), frame, avatarMask, name, role, email, version, close),
        () => ({ version: ref(version, scriptTypeOf('i18n/LocalizedLabel')), closeButton: ref(close, 'cc.Button') }));
        written.push(writePrefab(PREFABS.credits, root, { force }));
    }

    // 語系選單：透明遮罩，面板以 Widget 對齊在右上角語系按鈕的正下方（按鈕中心距右緣 28 + 176）
    {
        const options = [
            ['ZhHant', '繁體中文'],
            ['ZhHans', '简体中文'],
            ['En', 'English'],
        ].map(([key, text], i) => pillButton(`${key}Button`, null, { base: 'ui/btn_pill_lavender', width: 300, height: 88, fontSize: 34, position: [0, 92 - i * 100], text }));
        const root = popupShell(
            'LanguageMenu',
            'views/common/LanguageMenu',
            { width: 360, height: 360, clips, maskAlpha: 1, panelWidget: { top: 28 + 104 + 16, right: 28 + 176 - 180 } },
            (panel) => panel.add(...options),
            () => ({
                zhHantButton: ref(options[0], 'cc.Button'),
                zhHansButton: ref(options[1], 'cc.Button'),
                enButton: ref(options[2], 'cc.Button'),
                selectedFrame: tex('ui/btn_pill_pink'),
                normalFrame: tex('ui/btn_pill_lavender'),
            }),
        );
        written.push(writePrefab(PREFABS.languageMenu, root, { force }));
    }
    return written.filter(Boolean);
}
