// Table 場景：6 個座位、公共牌、底池、行動面板、倒數、勝利橫幅、特效層與粒子。
import { N, color, ref, vec2, writeScene } from '../lib/cocos.mjs';
import { child, component, realTrack, vec3Track, writeClip } from '../lib/anim.mjs';
import { C, animation, blockInput, iconButton, label, localized, opacity, pillButton, script, solid, sprite, stretch, tex, widget } from '../lib/ui.mjs';
import { PREFABS, canvasNode, prefabRef, scriptTypeOf, systemButtons } from '../common.mjs';
import { LOBBY_PREFABS } from './lobby.mjs';

const LOCALIZED = () => scriptTypeOf('i18n/LocalizedLabel');
const CARD = [112, 156];

/** 畫面位置 0～5（0 為正下方，順時針）的座位座標與各元件相對位置 */
const SEATS = [
    { pos: [0, -330], cards: [215, 10], cardSize: [120, 168], bet: [0, 170], marker: [-95, 75] },
    { pos: [-700, -190], cards: [165, 0], cardSize: [76, 106], bet: [290, 80], marker: [95, 75] },
    { pos: [-700, 200], cards: [165, 0], cardSize: [76, 106], bet: [290, -80], marker: [95, 75] },
    { pos: [0, 350], cards: [185, 0], cardSize: [76, 106], bet: [-210, -40], marker: [-95, 75] },
    { pos: [700, 200], cards: [-165, 0], cardSize: [76, 106], bet: [-290, -80], marker: [-95, 75] },
    { pos: [700, -190], cards: [-165, 0], cardSize: [76, 106], bet: [-290, 80], marker: [-95, 75] },
];

function particles(name, props, { size = [64, 64], position = [0, 0], active = true } = {}) {
    return new N(name, { size, position, active }).with('cc.ParticleSystem2D', {
        _visFlags: 0,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: color(C.white),
        duration: -1,
        emissionRate: 10,
        life: 1,
        lifeVar: 0.3,
        angle: 90,
        angleVar: 30,
        startSize: 40,
        startSizeVar: 10,
        endSize: 20,
        endSizeVar: 0,
        startSpin: 0,
        startSpinVar: 180,
        endSpin: 0,
        endSpinVar: 360,
        sourcePos: vec2(0, 0),
        posVar: vec2(0, 0),
        emitterMode: 0,
        gravity: vec2(0, 0),
        speed: 100,
        speedVar: 30,
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
        playOnLoad: false,
        autoRemoveOnFinish: false,
        _custom: true,
        _file: null,
        _totalParticles: 60,
        _startColor: color(C.white),
        _startColorVar: color('#000000', 0),
        _endColor: color(C.white, 0),
        _endColorVar: color('#000000', 0),
        _positionType: 0,
        ...props,
    });
}

function writeClips() {
    return {
        turnPulse: writeClip('animations/turn_pulse.anim', {
            duration: 1.2,
            wrapMode: 'loop',
            tracks: [
                vec3Track(['scale'], [[0, [0.92, 0.92, 1]], [0.6, [1.12, 1.12, 1]], [1.2, [0.92, 0.92, 1]]]),
                realTrack([component('cc.UIOpacity'), 'opacity'], [[0, 120], [0.6, 255], [1.2, 120]]),
            ],
        }).ref,
        allInPop: writeClip('animations/allin_pop.anim', {
            duration: 0.5,
            tracks: [vec3Track(['scale'], [[0, [0, 0, 1]], [0.25, [1.35, 1.35, 1]], [0.5, [1, 1, 1]]])],
        }).ref,
        winBanner: writeClip('animations/win_banner.anim', {
            duration: 0.9,
            tracks: [
                vec3Track([child('Panel'), 'scale'], [[0, [0, 0, 1]], [0.45, [1.15, 1.15, 1]], [0.65, [0.95, 0.95, 1]], [0.9, [1, 1, 1]]]),
                realTrack([child('Dim'), component('cc.UIOpacity'), 'opacity'], [[0, 0], [0.3, 255]], { interp: 'linear' }),
            ],
        }).ref,
        glowSpin: writeClip('animations/glow_spin.anim', {
            duration: 8,
            wrapMode: 'loop',
            tracks: [vec3Track(['eulerAngles'], [[0, [0, 0, 0]], [8, [0, 0, 360]]], { interp: 'linear' })],
        }).ref,
    };
}

function cardNode(name, [w, h], { position = [0, 0], angle = 0 } = {}) {
    const highlight = sprite(new N('Highlight', { size: [w * 1.12, h * 1.1], active: false }), tex('ui/card_highlight'));
    const node = sprite(new N(name, { size: [w, h], position, angle }), tex('cards/card_back'));
    node.add(highlight);
    script(node, 'views/table/CardView', { highlight: ref(highlight) });
    return node;
}

function seatNode(index, layout, clips) {
    const S = layout;
    const winGlow = opacity(sprite(new N('WinGlow', { size: [340, 340], active: false }), tex('ui/glow'), { tint: C.gold }));
    const turnGlow = opacity(sprite(new N('TurnGlow', { size: [250, 250], active: false }), tex('ui/glow'), { tint: C.pink }));
    animation(turnGlow, [clips.turnPulse]);
    const timerBg = sprite(new N('TimerBg', { size: [170, 170] }), tex('ui/timer_ring_bg'));
    const timer = sprite(new N('TimerRing', { size: [170, 170], active: false }), tex('ui/timer_ring'), { type: 'filled', fillType: 'radial', fillStart: 0.25, fillRange: 1 });

    const image = sprite(new N('Image', { size: [128, 128] }), tex('avatars/avatar_01'));
    const clip = new N('Clip', { size: [128, 128] }).with('cc.Mask', { _type: 1, _inverted: false, _segments: 64, _alphaThreshold: 0.1 }).add(image);
    const avatar = new N('Avatar', { size: [128, 128] }).add(clip, sprite(new N('Frame', { size: [152, 152] }), tex('ui/avatar_frame')));
    script(avatar, 'views/common/AvatarImage', { sprite: ref(image, 'cc.Sprite') });

    const nickname = label(new N('Nickname', { size: [210, 36], position: [0, 16] }), '', { fontSize: 26, tint: C.white, overflow: 'shrink' });
    const stack = label(new N('Stack', { size: [210, 36], position: [0, -18] }), '', { fontSize: 28, tint: C.gold });
    const nameplate = sprite(new N('Nameplate', { size: [232, 84], position: [0, -104] }), tex('ui/panel_nameplate'), { type: 'sliced' }).add(nickname, stack);

    const [cw, ch] = S.cardSize;
    const gap = cw * 0.58;
    const card1 = cardNode('Card1', S.cardSize, { position: [S.cards[0] - gap / 2, S.cards[1]], angle: 6 });
    const card2 = cardNode('Card2', S.cardSize, { position: [S.cards[0] + gap / 2, S.cards[1]], angle: -6 });
    void ch;

    const betLabel = label(new N('BetLabel', { size: [160, 40], anchor: [0, 0.5], position: [30, 0] }), '', { fontSize: 28, tint: C.white, align: 'left', outline: { color: C.purpleDeep, width: 3 } });
    const bet = new N('Bet', { size: [200, 56], position: S.bet, active: false }).add(sprite(new N('Chip', { size: [48, 48], position: [0, 0] }), tex('chips/chip_5')), betLabel);

    const marker = sprite(new N('Marker', { size: [58, 58], position: S.marker, active: false }), tex('ui/marker_dealer'));

    const bubbleLabel = label(new N('Label', { size: [200, 44] }), '', { fontSize: 30, tint: C.white });
    const bubble = sprite(new N('Bubble', { size: [220, 64], position: [0, 112], active: false }), tex('ui/btn_pill_lavender'), { type: 'sliced' }).add(bubbleLabel);

    const allInText = localized(label(new N('Label', { size: [160, 48] }), '', { fontSize: 30, tint: C.white, outline: { color: C.pinkDeep, width: 3 } }), 'action.allIn');
    const allIn = sprite(new N('AllInBadge', { size: [180, 64], position: [0, 78], active: false }), tex('ui/btn_pill_gold'), { type: 'sliced' }).add(allInText);
    animation(allIn, [clips.allInPop]);

    const result = label(new N('Result', { size: [320, 56], position: [0, 158], active: false }), '', { fontSize: 38, tint: C.gold, outline: { color: C.purpleDeep, width: 4 } });
    const status = localized(label(new N('Status', { size: [260, 40], position: [0, -165], active: false }), '', { fontSize: 24, tint: C.white, outline: { color: C.purpleDeep, width: 3 }, bold: false }), 'table.waitingNextHand');

    const occupied = new N('Occupied', { size: [240, 240] }).add(winGlow, turnGlow, timerBg, timer, avatar, nameplate, card1, card2, bet, marker, bubble, allIn, result, status);
    const empty = new N('Empty', { size: [120, 120], active: false }).add(sprite(new N('Placeholder', { size: [120, 120] }), tex('ui/avatar_mask'), { tint: C.white, alpha: 40 }));

    const node = new N(`Seat${index}`, { size: [240, 240], position: S.pos });
    opacity(node);
    node.add(occupied, empty);
    script(node, 'views/table/SeatView', {
        occupiedRoot: ref(occupied),
        emptyRoot: ref(empty),
        avatar: ref(avatar, scriptTypeOf('views/common/AvatarImage')),
        nickname: ref(nickname, 'cc.Label'),
        stack: ref(stack, 'cc.Label'),
        timerRing: ref(timer, 'cc.Sprite'),
        turnGlow: ref(turnGlow, 'cc.Animation'),
        cards: [ref(card1, scriptTypeOf('views/table/CardView')), ref(card2, scriptTypeOf('views/table/CardView'))],
        betRoot: ref(bet),
        betLabel: ref(betLabel, 'cc.Label'),
        marker: ref(marker, 'cc.Sprite'),
        dealerFrame: tex('ui/marker_dealer'),
        smallBlindFrame: tex('ui/marker_sb'),
        bigBlindFrame: tex('ui/marker_bb'),
        bubble: ref(bubble),
        bubbleLabel: ref(bubbleLabel, 'cc.Label'),
        allInBadge: ref(allIn, 'cc.Animation'),
        winGlow: ref(winGlow),
        resultLabel: ref(result, 'cc.Label'),
        status: ref(status, LOCALIZED()),
        dim: ref(node, 'cc.UIOpacity'),
    });
    return node;
}

function actionPanel() {
    const fold = pillButton('FoldButton', 'table.fold', { base: 'ui/btn_pill_rose', width: 230, height: 96, fontSize: 36, position: [-645, 60] });
    const call = pillButton('CallButton', 'table.check', { base: 'ui/btn_pill_mint', width: 260, height: 96, fontSize: 32, position: [-395, 60] });
    const raise = pillButton('RaiseButton', 'table.raise', { base: 'ui/btn_pill_gold', width: 260, height: 96, fontSize: 32, position: [-130, 60] });
    const callLabel = call.children.find((c) => c.name === 'Label');
    const raiseLabel = raise.children.find((c) => c.name === 'Label');

    // 加注面板：金額、滑桿、快捷鍵
    const amount = label(new N('Amount', { size: [360, 56], position: [-170, 40] }), '', { fontSize: 40, tint: C.gold, outline: { color: C.purpleDeep, width: 3 } });
    const handle = sprite(new N('Handle', { size: [64, 64] }), tex('ui/slider_thumb'));
    const slider = sprite(new N('Slider', { size: [380, 24], position: [-170, -30] }), tex('ui/slider_track'), { type: 'sliced', tint: '#ffffff', alpha: 110 }).add(handle);
    slider.with('cc.Slider', { _handle: ref(handle, 'cc.Sprite'), _direction: 0, _progress: 0, _slideEvents: [] });
    const quick = (name, key, position, base = 'ui/btn_pill_lavender') => pillButton(name, key, { base, width: 130, height: 64, fontSize: 24, position });
    const min = quick('MinButton', 'table.minRaise', [120, 40]);
    const half = quick('HalfPotButton', 'table.halfPot', [260, 40]);
    const pot = quick('PotButton', 'table.fullPot', [120, -36]);
    const allIn = quick('AllInButton', 'table.allIn', [260, -36], 'ui/btn_pill_pink');
    const raisePanel = sprite(new N('RaisePanel', { size: [760, 180], position: [-400, 225], active: false }), tex('ui/panel_nameplate'), { type: 'sliced' });
    raisePanel.add(amount, slider, min, half, pot, allIn);
    blockInput(raisePanel);

    const node = new N('ActionPanel', { size: [780, 120], anchor: [1, 0], active: false });
    widget(node, { bottom: 24, right: 24 });
    node.add(raisePanel, fold, call, raise);
    script(node, 'views/table/ActionPanel', {
        foldButton: ref(fold, 'cc.Button'),
        callButton: ref(call, 'cc.Button'),
        callLabel: ref(callLabel, LOCALIZED()),
        raiseButton: ref(raise, 'cc.Button'),
        raiseLabel: ref(raiseLabel, LOCALIZED()),
        raisePanel: ref(raisePanel),
        slider: ref(slider, 'cc.Slider'),
        amountLabel: ref(amount, 'cc.Label'),
        minButton: ref(min, 'cc.Button'),
        halfPotButton: ref(half, 'cc.Button'),
        potButton: ref(pot, 'cc.Button'),
        allInButton: ref(allIn, 'cc.Button'),
    });
    return node;
}

function winBanner(clips) {
    const dim = opacity(solid('Dim', 1920, 1080, C.black, 150));
    stretch(dim);
    blockInput(dim);
    const glow = sprite(new N('Glow', { size: [1100, 1100] }), tex('ui/glow'), { tint: C.gold, alpha: 200 });
    animation(glow, [clips.glowSpin], { playOnLoad: true });
    const title = localized(label(new N('Title', { size: [900, 110], position: [0, 40] }), '', { fontSize: 72, tint: C.white, outline: { color: C.pinkDeep, width: 6 }, shadow: { color: C.purpleDeep, alpha: 150, offset: [0, -5], blur: 4 } }), 'table.youWin');
    const share = pillButton('ShareButton', 'table.share', { base: 'ui/btn_pill_gold', width: 300, height: 96, position: [0, -110] });
    const panel = sprite(new N('Panel', { size: [1060, 380] }), tex('ui/panel_popup'), { type: 'sliced', tint: '#ffe1ec' }).add(title, share);

    const confetti = particles('Confetti', {
        duration: 3,
        emissionRate: 50,
        life: 3.5,
        lifeVar: 1,
        angle: -90,
        angleVar: 25,
        startSize: 30,
        startSizeVar: 12,
        endSize: 24,
        speed: 160,
        speedVar: 80,
        gravity: vec2(0, -120),
        posVar: vec2(1000, 0),
        _totalParticles: 150,
        _spriteFrame: tex('particles/particle_confetti'),
        _startColor: color('#ff8fb1'),
        _startColorVar: color('#80d0ff', 0),
        _endColor: color('#b79cff', 200),
    }, { position: [0, 560] });
    const hearts = particles('Hearts', {
        duration: 3,
        emissionRate: 18,
        life: 2.5,
        angle: 90,
        angleVar: 40,
        startSize: 46,
        startSizeVar: 16,
        endSize: 10,
        speed: 220,
        speedVar: 60,
        gravity: vec2(0, -60),
        posVar: vec2(420, 40),
        _totalParticles: 60,
        _spriteFrame: tex('particles/particle_heart'),
        _startColor: color('#ff8fb1'),
        _endColor: color('#e8436f', 0),
    }, { position: [0, -180] });

    const node = new N('WinBanner', { size: [1920, 1080], active: false });
    stretch(node);
    node.add(dim, glow, panel, confetti, hearts);
    animation(node, [clips.winBanner]);
    script(node, 'views/table/WinBanner', {
        title: ref(title, LOCALIZED()),
        animation: ref(node, 'cc.Animation'),
        particles: [ref(confetti, 'cc.ParticleSystem2D'), ref(hearts, 'cc.ParticleSystem2D')],
        shareButton: ref(share, 'cc.Button'),
        glow: ref(glow),
    });
    return node;
}

export function writeTable({ force } = {}) {
    const clips = writeClips();
    const { canvas, safe } = canvasNode();

    const background = sprite(new N('Background', { size: [1920, 1080] }), tex('table/table_bg'));
    script(background, 'views/common/CoverBackground');

    const seats = SEATS.map((layout, i) => seatNode(i, layout, clips));

    const board = [-260, -130, 0, 130, 260].map((x, i) => {
        const card = cardNode(`Board${i + 1}`, CARD, { position: [x, 10] });
        card.active = false;
        return card;
    });
    const boardRoot = new N('Board', { size: [700, 180] }).add(...board);

    const potLabel = label(new N('PotLabel', { size: [420, 48], anchor: [0, 0.5], position: [34, 0] }), '', { fontSize: 32, tint: C.white, align: 'left', outline: { color: C.purpleDeep, width: 3 } });
    const pot = new N('Pot', { size: [460, 64], position: [-60, 150], active: false }).add(sprite(new N('Chips', { size: [56, 56] }), tex('chips/chip_100')), potLabel);
    const deck = sprite(new N('Deck', { size: [96, 134], position: [-430, 10], angle: -8 }), tex('cards/card_back'));

    // 特效層：飛行中的牌與籌碼、金幣爆發
    const cardTemplate = sprite(new N('CardTemplate', { size: CARD }), tex('cards/card_back'));
    const chipTemplate = sprite(new N('ChipTemplate', { size: [52, 52] }), tex('chips/chip_5'));
    const coinBurst = particles('CoinBurst', {
        duration: 0.35,
        emissionRate: 120,
        life: 0.9,
        lifeVar: 0.3,
        angle: 90,
        angleVar: 70,
        startSize: 40,
        startSizeVar: 10,
        endSize: 26,
        speed: 420,
        speedVar: 160,
        gravity: vec2(0, -1100),
        _totalParticles: 50,
        _spriteFrame: tex('particles/particle_coin'),
        _startColor: color(C.white),
        _endColor: color(C.white, 0),
    });
    const sparkle = particles('SparkleBurst', {
        duration: 0.4,
        emissionRate: 60,
        life: 0.8,
        angle: 0,
        angleVar: 180,
        startSize: 36,
        endSize: 4,
        speed: 260,
        speedVar: 80,
        _totalParticles: 30,
        _spriteFrame: tex('particles/particle_sparkle'),
        _startColor: color(C.gold),
        _endColor: color(C.pink, 0),
    });
    const effects = new N('Effects', { size: [1920, 1080] }).add(cardTemplate, chipTemplate, coinBurst, sparkle);

    const myCountdown = label(new N('MyCountdown', { size: [120, 90], position: [-130, -330], active: false }), '10', { fontSize: 72, tint: C.white, outline: { color: C.pinkDeep, width: 6 } });

    // 左上角：離開牌桌、改為觀戰（只有圖示）
    const leave = iconButton('LeaveButton', 'icon_leave', { base: 'ui/btn_circle_dark', position: [52, -52] });
    const spectate = iconButton('SpectateButton', 'icon_spectate', { base: 'ui/btn_circle_dark', position: [176, -52] });
    const topLeft = new N('TableButtons', { size: [228, 104], anchor: [0, 1] }).add(leave, spectate);
    widget(topLeft, { top: 28, left: 28 });

    const hudLabel = label(new N('Label', { size: [300, 40] }), '', { fontSize: 26, tint: C.white, bold: false });
    const hud = sprite(new N('Hud', { size: [300, 52] }), tex('ui/panel_nameplate'), { type: 'sliced', alpha: 200 }).add(hudLabel);
    widget(hud, { top: 20, hc: 0 });
    script(hud, 'views/table/TableHud', { label: ref(hudLabel, 'cc.Label') });

    const spectating = localized(label(new N('Spectating', { size: [400, 50], position: [0, 0], active: false }), '', { fontSize: 30, tint: C.white, outline: { color: C.purpleDeep, width: 3 } }), 'table.spectating');
    const spectatingRoot = new N('SpectatingRoot', { size: [400, 50] }).add(spectating);
    widget(spectatingRoot, { top: 84, hc: 0 });

    const sit = pillButton('SitButton', 'room.sit', { width: 320, height: 96, active: false });
    sit.active = false;
    const sitRoot = new N('SitRoot', { size: [320, 96] }).add(sit);
    widget(sitRoot, { bottom: 28, hc: 0 });

    safe.add(topLeft, hud, spectatingRoot, systemButtons(), actionPanel(), sitRoot);

    const reconnectText = localized(label(new N('Label', { size: [800, 80] }), '', { fontSize: 44, tint: C.white }), 'common.reconnecting');
    const reconnecting = solid('Reconnecting', 1920, 1080, C.black, 150, { active: false });
    stretch(reconnecting);
    blockInput(reconnecting);
    reconnecting.add(reconnectText);

    const banner = winBanner(clips);
    const actionPanelNode = safe.children.find((c) => c.name === 'ActionPanel');

    canvas.add(background, deck, boardRoot, pot, ...seats, myCountdown, effects, safe, banner, reconnecting);
    script(canvas, 'views/table/TableView', {
        seats: seats.map((s) => ref(s, scriptTypeOf('views/table/SeatView'))),
        board: board.map((b) => ref(b, scriptTypeOf('views/table/CardView'))),
        potRoot: ref(pot),
        potLabel: ref(potLabel, 'cc.Label'),
        deck: ref(deck),
        effects: ref(effects),
        cardTemplate: ref(cardTemplate),
        chipTemplate: ref(chipTemplate),
        coinBurst: ref(coinBurst, 'cc.ParticleSystem2D'),
        actionPanel: ref(actionPanelNode, scriptTypeOf('views/table/ActionPanel')),
        myCountdown: ref(myCountdown, 'cc.Label'),
        leaveButton: ref(leave, 'cc.Button'),
        spectateButton: ref(spectate, 'cc.Button'),
        sitButton: ref(sit, 'cc.Button'),
        reconnecting: ref(reconnecting),
        winBanner: ref(banner, scriptTypeOf('views/table/WinBanner')),
        spectatingLabel: ref(spectating, LOCALIZED()),
        confirmPopup: prefabRef(PREFABS.confirm),
        toastPrefab: prefabRef(LOBBY_PREFABS.toast),
    });
    return [writeScene('scenes/Table.scene', canvas, { force })];
}
