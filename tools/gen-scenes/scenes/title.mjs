// Title 場景：背景、飄浮的標題、閃爍的「點按任意鍵開始」、閃光粒子、製作人員與系統按鈕。
import { N, color, ref, vec2, writeScene } from '../lib/cocos.mjs';
import { component, realTrack, vec3Track, writeClip } from '../lib/anim.mjs';
import { C, animation, iconButton, label, localized, opacity, script, sprite, stretch, tex, widget } from '../lib/ui.mjs';
import { PREFABS, canvasNode, prefabRef, systemButtons } from '../common.mjs';

/** 閃光粒子：從整個畫面隨機位置緩緩上飄、旋轉並淡出（ParticleSystem2D 重力模式） */
export function sparkleParticles(name, { position = [0, 0], posVar = [960, 540], rate = 6, total = 40, startColor = '#ffffff', endColor = '#ff8fb1' } = {}) {
    return new N(name, { size: [64, 64], position }).with('cc.ParticleSystem2D', {
        _visFlags: 0,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 1,
        _color: color(C.white),
        duration: -1,
        emissionRate: rate,
        life: 3.2,
        lifeVar: 1,
        angle: 90,
        angleVar: 60,
        startSize: 30,
        startSizeVar: 14,
        endSize: 4,
        endSizeVar: 2,
        startSpin: 0,
        startSpinVar: 180,
        endSpin: 180,
        endSpinVar: 180,
        sourcePos: vec2(0, 0),
        posVar: vec2(...posVar),
        emitterMode: 0,
        gravity: vec2(0, 12),
        speed: 24,
        speedVar: 12,
        tangentialAccel: 0,
        tangentialAccelVar: 0,
        radialAccel: 0,
        radialAccelVar: 0,
        rotationIsDir: false,
        startRadius: 0,
        startRadiusVar: 0,
        endRadius: 0,
        endRadiusVar: 0,
        rotatePerS: 0,
        rotatePerSVar: 0,
        preview: true,
        playOnLoad: true,
        autoRemoveOnFinish: false,
        _custom: true,
        _file: null,
        _spriteFrame: tex('particles/particle_sparkle'),
        _totalParticles: total,
        _startColor: color(startColor, 255),
        _startColorVar: color('#000000', 0),
        _endColor: color(endColor, 0),
        _endColorVar: color('#000000', 0),
        _positionType: 0,
    });
}

export function writeTitleScene({ force } = {}) {
    // 「點按任意鍵開始」呼吸般閃爍；標題上下飄浮
    const blink = writeClip('animations/title_blink.anim', {
        duration: 1.6,
        wrapMode: 'loop',
        tracks: [realTrack([component('cc.UIOpacity'), 'opacity'], [[0, 255], [0.8, 70], [1.6, 255]])],
    });
    const float = writeClip('animations/logo_float.anim', {
        duration: 3,
        wrapMode: 'loop',
        tracks: [
            vec3Track(['position'], [[0, [0, 150, 0]], [1.5, [0, 176, 0]], [3, [0, 150, 0]]]),
            vec3Track(['scale'], [[0, [1, 1, 1]], [1.5, [1.03, 1.03, 1]], [3, [1, 1, 1]]]),
        ],
    });

    const { canvas, safe } = canvasNode();

    const background = sprite(new N('Background', { size: [1920, 1080] }), tex('title/title_bg'));
    script(background, 'views/common/CoverBackground');

    const logo = sprite(new N('Logo', { size: [1200, 400], position: [0, 150] }), tex('title/title_logo'));
    animation(logo, [float.ref], { playOnLoad: true });

    const tapToStart = new N('TapToStart', { size: [1200, 90], position: [0, -300] });
    label(tapToStart, '', { fontSize: 54, tint: C.white, outline: { color: C.pinkDeep, width: 5 }, shadow: { color: C.purpleDeep, alpha: 120, offset: [0, -4], blur: 4 } });
    localized(tapToStart, 'title.tapToStart');
    opacity(tapToStart);
    animation(tapToStart, [blink.ref], { playOnLoad: true });

    // 全畫面點按區域：位於按鈕之下，點按按鈕不會觸發開始
    const tapArea = new N('TapArea', { size: [1920, 1080] });
    stretch(tapArea);

    const credits = iconButton('CreditsButton', 'icon_credits', { position: [-52, 52] });
    const creditsCorner = new N('CreditsCorner', { size: [104, 104], anchor: [1, 0] });
    widget(creditsCorner, { bottom: 28, right: 28 });
    creditsCorner.add(credits);

    safe.add(systemButtons(), creditsCorner);

    canvas.add(
        background,
        sparkleParticles('Sparkles'),
        logo,
        tapToStart,
        tapArea,
        safe,
    );
    script(canvas, 'views/title/TitleView', {
        tapArea: ref(tapArea),
        creditsButton: ref(credits, 'cc.Button'),
        creditsPopup: prefabRef(PREFABS.credits),
        confirmPopup: prefabRef(PREFABS.confirm),
        nextScene: 'Lobby',
    });

    return writeScene('scenes/Title.scene', canvas, { force });
}
