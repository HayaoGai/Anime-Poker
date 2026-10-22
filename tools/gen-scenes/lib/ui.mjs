// 常用 UI 元件的建構函式。數值對應引擎列舉（Sprite.Type、Label.Overflow、Widget.AlignFlags…）。
import { N, color, ref, scriptType, size, spriteFrame, vec2 } from './cocos.mjs';

export const C = {
    ink: '#3a2f5b',
    inkSoft: '#6b5f8f',
    white: '#ffffff',
    black: '#000000',
    pink: '#ff8fb1',
    pinkDeep: '#e8436f',
    lavender: '#b79cff',
    purpleDeep: '#4b3f72',
    mint: '#6fdcbf',
    gold: '#ffd36e',
    cream: '#fffaf5',
};

/** resources/textures 底下的圖片 */
export const tex = (name) => spriteFrame(`resources/textures/${name}.png`);

const SPRITE_TYPE = { simple: 0, sliced: 1, tiled: 2, filled: 3 };
const SIZE_MODE = { custom: 0, trimmed: 1, raw: 2 };
const FILL_TYPE = { horizontal: 0, vertical: 1, radial: 2 };

export function sprite(node, frame, { type = 'simple', sizeMode = 'custom', tint = C.white, alpha = 255, fillType = 'radial', fillStart = 0, fillRange = 1, fillCenter = [0.5, 0.5] } = {}) {
    return node.with('cc.Sprite', {
        _visFlags: 0,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: color(tint, alpha),
        _spriteFrame: frame,
        _type: SPRITE_TYPE[type],
        _fillType: FILL_TYPE[fillType],
        _sizeMode: SIZE_MODE[sizeMode],
        _fillCenter: vec2(...fillCenter),
        _fillStart: fillStart,
        _fillRange: fillRange,
        _isTrimmedMode: true,
        _useGrayscale: false,
        _atlas: null,
    });
}

const H_ALIGN = { left: 0, center: 1, right: 2 };
const V_ALIGN = { top: 0, center: 1, bottom: 2 };
const OVERFLOW = { none: 0, clamp: 1, shrink: 2, resize: 3 };

export function label(node, text, { fontSize = 36, tint = C.ink, align = 'center', valign = 'center', overflow = 'shrink', bold = true, wrap = false, lineHeight, outline, shadow } = {}) {
    return node.with('cc.Label', {
        _visFlags: 0,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: color(tint),
        _string: text,
        _horizontalAlign: H_ALIGN[align],
        _verticalAlign: V_ALIGN[valign],
        _actualFontSize: fontSize,
        _fontSize: fontSize,
        _fontFamily: 'Arial',
        _lineHeight: lineHeight ?? Math.round(fontSize * 1.25),
        _overflow: OVERFLOW[overflow],
        _enableWrapText: wrap,
        _font: null,
        _isSystemFontUsed: true,
        _spacingX: 0,
        _isItalic: false,
        _isBold: bold,
        _isUnderline: false,
        _underlineHeight: 2,
        _cacheMode: 0,
        _enableOutline: !!outline,
        _outlineColor: color(outline?.color ?? C.black),
        _outlineWidth: outline?.width ?? 2,
        _enableShadow: !!shadow,
        _shadowColor: color(shadow?.color ?? C.black, shadow?.alpha ?? 120),
        _shadowOffset: vec2(...(shadow?.offset ?? [0, -3])),
        _shadowBlur: shadow?.blur ?? 3,
    });
}

/**
 * Widget 對齊：傳入要對齊的邊與距離，例如 { top: 24, right: 24 }、{ left: 0, right: 0, top: 0, bottom: 0 }。
 * hc / vc 為水平／垂直置中的偏移。
 */
export function widget(node, align, { mode = 'resize' } = {}) {
    const flag = { top: 1, vc: 2, bottom: 4, left: 8, hc: 16, right: 32 };
    let alignFlags = 0;
    for (const key of Object.keys(flag)) if (align[key] !== undefined) alignFlags |= flag[key];
    return node.with('cc.Widget', {
        _alignFlags: alignFlags,
        _target: null,
        _left: align.left ?? 0,
        _right: align.right ?? 0,
        _top: align.top ?? 0,
        _bottom: align.bottom ?? 0,
        _horizontalCenter: align.hc ?? 0,
        _verticalCenter: align.vc ?? 0,
        _isAbsLeft: true,
        _isAbsRight: true,
        _isAbsTop: true,
        _isAbsBottom: true,
        _isAbsHorizontalCenter: true,
        _isAbsVerticalCenter: true,
        _originalWidth: 0,
        _originalHeight: 0,
        // ONCE 0、ON_WINDOW_RESIZE 1、ALWAYS 2
        _alignMode: { once: 0, resize: 1, always: 2 }[mode],
        _lockFlags: 0,
    });
}

export const stretch = (node, mode) => widget(node, { left: 0, right: 0, top: 0, bottom: 0 }, { mode });

/** 按鈕：預設為縮放回饋（Transition.SCALE） */
export function button(node, { zoomScale = 0.92, interactable = true } = {}) {
    return node.with('cc.Button', {
        clickEvents: [],
        _interactable: interactable,
        _transition: 3,
        _normalColor: color('#ffffff'),
        _hoverColor: color('#f4f0ff'),
        _pressedColor: color('#e6e0f0'),
        _disabledColor: color('#9a94a8', 200),
        _normalSprite: null,
        _hoverSprite: null,
        _pressedSprite: null,
        _disabledSprite: null,
        _duration: 0.08,
        _zoomScale: zoomScale,
        _target: ref(node),
    });
}

export const opacity = (node, value = 255) => node.with('cc.UIOpacity', { _opacity: value });
export const blockInput = (node) => node.with('cc.BlockInputEvents', {});
export const safeArea = (node) => node.with('cc.SafeArea', { _symmetric: true });

/** Mask：0 矩形、1 橢圓 */
export const mask = (node, type = 1) => node.with('cc.Mask', { _type: type, _inverted: false, _segments: 64, _alphaThreshold: 0.1 });

export function layout(node, { type = 'horizontal', spacingX = 0, spacingY = 0, resize = 'container', padding = [0, 0, 0, 0], align = 'center' } = {}) {
    const [top, right, bottom, left] = padding;
    return node.with('cc.Layout', {
        // NONE 0、CONTAINER 1、CHILDREN 2
        _resizeMode: { none: 0, container: 1, children: 2 }[resize],
        // NONE 0、HORIZONTAL 1、VERTICAL 2、GRID 3
        _layoutType: { none: 0, horizontal: 1, vertical: 2, grid: 3 }[type],
        _cellSize: size(40, 40),
        _startAxis: 0,
        _paddingLeft: left,
        _paddingRight: right,
        _paddingTop: top,
        _paddingBottom: bottom,
        _spacingX: spacingX,
        _spacingY: spacingY,
        _verticalDirection: 1,
        _horizontalDirection: 0,
        _constraint: 0,
        _constraintNum: 2,
        _affectedByScale: false,
        _isAlign: align === 'center',
    });
}

export function animation(node, clips, { playOnLoad = false, defaultClip = clips[0] ?? null } = {}) {
    return node.with('cc.Animation', { playOnLoad, _clips: clips, _defaultClip: defaultClip });
}

/** 掛自訂腳本，scriptPath 相對於 assets/scripts（不含副檔名） */
export function script(node, scriptPath, props = {}) {
    return node.with(scriptType(scriptPath), props);
}

/** LocalizedLabel：key 為語系鍵值（需先有 Label） */
export const localized = (node, key, params = []) => script(node, 'i18n/LocalizedLabel', { _key: key, params });

// ------------------------------------------------------------------ 組合元件

/** 純色矩形（以 white.png 著色），常用於遮罩與背景 */
export function solid(name, w, h, tint, alpha = 255, options = {}) {
    const node = new N(name, { size: [w, h], ...options });
    return sprite(node, tex('ui/white'), { tint, alpha });
}

/** 圓形圖示按鈕：底圖 + 白色圖示 */
export function iconButton(name, icon, { base = 'ui/btn_circle_lavender', diameter = 104, iconSize = 60, position } = {}) {
    const iconNode = sprite(new N('Icon', { size: [iconSize, iconSize], position: [0, 3] }), tex(`icons/${icon}`));
    const node = new N(name, { size: [diameter, diameter], position });
    sprite(node, tex(base));
    button(node);
    return node.add(iconNode);
}

/** 藥丸形文字按鈕（9-slice），labelKey 為語系鍵值 */
export function pillButton(name, labelKey, { base = 'ui/btn_pill_pink', width = 320, height = 104, fontSize = 40, position, text = '' } = {}) {
    const text_ = new N('Label', { size: [width - 48, height - 24], position: [0, 4] });
    label(text_, text, { fontSize, tint: C.white, shadow: { color: C.black, alpha: 70, offset: [0, -2], blur: 2 } });
    if (labelKey) localized(text_, labelKey);
    const node = new N(name, { size: [width, height], position });
    sprite(node, tex(base), { type: 'sliced' });
    button(node);
    return node.add(text_);
}
