// Lobby 場景：左上角名牌、房間列表、房間大廳（座位、開始遊戲），以及暱稱頭像設定、房間列表項目、提示訊息 Prefab。
import { N, ref, writePrefab, writeScene } from '../lib/cocos.mjs';
import { C, blockInput, button, iconButton, label, layout, localized, mask, pillButton, script, solid, sprite, stretch, tex, widget } from '../lib/ui.mjs';
import { PREFABS, canvasNode, closeButton, panelTitle, popupShell, prefabRef, scriptTypeOf, systemButtons, writePopupClips } from '../common.mjs';
import { sparkleParticles } from './title.mjs';

export const LOBBY_PREFABS = {
    roomItem: 'prefabs/lobby/RoomItem.prefab',
    profile: 'prefabs/lobby/ProfilePopup.prefab',
    toast: 'prefabs/common/Toast.prefab',
};

const LOCALIZED = () => scriptTypeOf('i18n/LocalizedLabel');

/** 圓形裁切的頭像：Clip（橢圓遮罩）> Image；回傳 { node, image } */
function circleAvatar(name, diameter, { position, frame = true } = {}) {
    const image = sprite(new N('Image', { size: [diameter, diameter] }), tex('avatars/avatar_01'));
    const clip = mask(new N('Clip', { size: [diameter, diameter] }), 1).add(image);
    const node = new N(name, { size: [diameter, diameter], position });
    node.add(clip);
    if (frame) node.add(sprite(new N('Frame', { size: [diameter * 1.2, diameter * 1.2] }), tex('ui/avatar_frame')));
    script(node, 'views/common/AvatarImage', { sprite: ref(image, 'cc.Sprite') });
    return node;
}

/** 小標籤（例如房主、電腦） */
function badge(name, key, tint, { position, width = 110 } = {}) {
    const text = localized(label(new N('Label', { size: [width - 16, 40] }), '', { fontSize: 26, tint: C.white }), key);
    const node = sprite(new N(name, { size: [width, 48], position }), tex('ui/panel_white'), { type: 'sliced', tint });
    return node.add(text);
}

// ------------------------------------------------------------------ Prefab

function writeToast(force) {
    const text = label(new N('Label', { size: [960, 60] }), '', { fontSize: 34, tint: C.white, overflow: 'shrink' });
    const root = sprite(new N('Toast', { size: [1000, 84], position: [0, 440] }), tex('ui/panel_nameplate'), { type: 'sliced' });
    return writePrefab(LOBBY_PREFABS.toast, root.add(text), { force });
}

function writeRoomItem(force) {
    const W = 1320;
    const H = 128;
    const name = localized(label(new N('RoomName', { size: [440, 70], anchor: [0, 0.5], position: [-W / 2 + 40, 0] }), '', { fontSize: 38, tint: C.ink, align: 'left' }), 'lobby.roomName', ['host=…']);

    const statusText = localized(label(new N('Label', { size: [130, 44] }), '', { fontSize: 28, tint: C.white }), 'lobby.statusLobby');
    const status = sprite(new N('StatusBadge', { size: [150, 56], position: [-90, 0] }), tex('ui/panel_white'), { type: 'sliced', tint: '#2fae8c' }).add(statusText);

    const players = label(new N('Players', { size: [150, 60], position: [70, 0] }), '0 / 6', { fontSize: 40, tint: C.purpleDeep });
    const spectators = localized(label(new N('Spectators', { size: [170, 50], position: [225, 0] }), '', { fontSize: 28, tint: C.inkSoft, bold: false }), 'lobby.spectators', ['count=0']);
    const join = pillButton('JoinButton', 'lobby.join', { width: 170, height: 88, fontSize: 34, position: [395, 0] });
    const spectate = pillButton('SpectateButton', 'lobby.spectate', { base: 'ui/btn_pill_lavender', width: 170, height: 88, fontSize: 34, position: [570, 0] });

    const root = sprite(new N('RoomItem', { size: [W, H] }), tex('ui/panel_white'), { type: 'sliced', tint: '#fff7fb' });
    root.add(name, status, players, spectators, join, spectate);
    script(root, 'views/lobby/RoomItem', {
        roomName: ref(name, LOCALIZED()),
        status: ref(statusText, LOCALIZED()),
        statusBadge: ref(status, 'cc.Sprite'),
        players: ref(players, 'cc.Label'),
        spectators: ref(spectators, LOCALIZED()),
        joinButton: ref(join, 'cc.Button'),
        spectateButton: ref(spectate, 'cc.Button'),
    });
    return writePrefab(LOBBY_PREFABS.roomItem, root, { force });
}

function writeProfilePopup(force, clips) {
    const W = 1120;
    const H = 780;

    const nicknameLabel = localized(label(new N('NicknameLabel', { size: [220, 60], anchor: [0, 0.5], position: [-480, 190] }), '', { fontSize: 36, tint: C.purpleDeep, align: 'left' }), 'profile.nickname');

    // 與引擎內建 EditBox 相同的配置：標籤錨點在左上、高度與行高等於輸入框高度（EditBox 執行時依此重新配置）
    const text = label(new N('TEXT_LABEL', { size: [620, 92], anchor: [0, 1], position: [-310, 46] }), '', { fontSize: 38, tint: C.ink, align: 'left', overflow: 'clamp', bold: false, lineHeight: 92 });
    const placeholder = label(new N('PLACEHOLDER_LABEL', { size: [620, 92], anchor: [0, 1], position: [-310, 46] }), '', { fontSize: 32, tint: '#a39cb8', align: 'left', overflow: 'clamp', bold: false, lineHeight: 92 });
    localized(placeholder, 'profile.nicknamePlaceholder');
    const input = sprite(new N('NicknameInput', { size: [660, 92], position: [110, 190] }), tex('ui/panel_input'), { type: 'sliced' });
    input.add(text, placeholder);
    input.with('cc.EditBox', {
        editingDidBegan: [],
        textChanged: [],
        editingDidEnded: [],
        editingReturn: [],
        _textLabel: ref(text, 'cc.Label'),
        _placeholderLabel: ref(placeholder, 'cc.Label'),
        // KeyboardReturnType.DONE、InputFlag.DEFAULT、InputMode.SINGLE_LINE
        _returnType: 1,
        _string: '',
        _tabIndex: 0,
        _backgroundImage: tex('ui/panel_input'),
        _inputFlag: 5,
        _inputMode: 6,
        _maxLength: 12,
    });

    const avatarLabel = localized(label(new N('AvatarLabel', { size: [600, 60], position: [0, 80] }), '', { fontSize: 36, tint: C.purpleDeep }), 'profile.avatar');

    // 頭像選項範本：執行時依 config/Avatars 複製
    const selected = sprite(new N('Selected', { size: [168, 168], active: false }), tex('ui/avatar_frame'));
    const option = circleAvatar('AvatarOption', 130, { frame: false });
    option.add(selected);
    button(option, { zoomScale: 0.94 });
    const grid = new N('AvatarGrid', { size: [960, 180], position: [0, -60] }).add(option);
    layout(grid, { type: 'horizontal', spacingX: 26, resize: 'container' });

    const error = localized(label(new N('Error', { size: [800, 50], position: [0, -200] }), '', { fontSize: 30, tint: C.pinkDeep }), 'profile.nicknameRequired');
    const save = pillButton('SaveButton', 'profile.save', { width: 380, height: 104, position: [0, -300] });
    const close = closeButton(W, H);

    const root = popupShell('ProfilePopup', 'views/lobby/ProfilePopup', { width: W, height: H, clips }, (panel) =>
        panel.add(panelTitle('profile.title', H / 2 - 70, 700), nicknameLabel, input, avatarLabel, grid, error, save, close),
    () => ({
        nicknameInput: ref(input, 'cc.EditBox'),
        avatarGrid: ref(grid),
        avatarTemplate: ref(option),
        errorLabel: ref(error, LOCALIZED()),
        saveButton: ref(save, 'cc.Button'),
        closeButton: ref(close, 'cc.Button'),
    }));
    return writePrefab(LOBBY_PREFABS.profile, root, { force });
}

// ------------------------------------------------------------------ 場景

function profileBadge() {
    const avatar = circleAvatar('Avatar', 84, { position: [62, -56] });
    const nickname = label(new N('Nickname', { size: [260, 60], anchor: [0, 0.5], position: [124, -56] }), '', { fontSize: 36, tint: C.white, align: 'left', shadow: { color: C.black, alpha: 90, offset: [0, -2], blur: 2 } });
    const edit = sprite(new N('EditIcon', { size: [36, 36], position: [408, -56] }), tex('icons/icon_edit'));
    const node = sprite(new N('ProfileBadge', { size: [450, 112], anchor: [0, 1] }), tex('ui/panel_nameplate'), { type: 'sliced' });
    widget(node, { top: 28, left: 28 });
    button(node, { zoomScale: 0.96 });
    node.add(avatar, nickname, edit);
    script(node, 'views/common/ProfileBadge', {
        avatar: ref(avatar, scriptTypeOf('views/common/AvatarImage')),
        nickname: ref(nickname, 'cc.Label'),
        button: ref(node, 'cc.Button'),
    });
    return node;
}

function roomListPanel() {
    const W = 1440;
    const H = 820;
    const title = new N('Title', { size: [600, 70], anchor: [0, 0.5], position: [-W / 2 + 60, H / 2 - 70] });
    localized(label(title, '', { fontSize: 46, tint: C.pinkDeep, align: 'left' }), 'lobby.roomList');
    const create = pillButton('CreateButton', 'lobby.createRoom', { width: 320, height: 96, fontSize: 36, position: [W / 2 - 210, H / 2 - 70] });

    const content = new N('Content', { size: [1320, 0], anchor: [0.5, 1], position: [0, 310] });
    layout(content, { type: 'vertical', spacingY: 16, padding: [10, 0, 10, 0] });
    const view = mask(new N('View', { size: [1340, 620] }), 0).add(content);
    const rooms = new N('Rooms', { size: [1340, 620], position: [0, -50] }).add(view);
    rooms.with('cc.ScrollView', {
        bounceDuration: 0.23,
        brake: 0.75,
        elastic: true,
        inertia: true,
        horizontal: false,
        vertical: true,
        cancelInnerEvents: true,
        scrollEvents: [],
        _content: ref(content),
        _horizontalScrollBar: null,
        _verticalScrollBar: null,
    });

    const hint = localized(label(new N('Hint', { size: [1000, 70], position: [0, 20] }), '', { fontSize: 40, tint: C.inkSoft }), 'common.loading');
    const retry = pillButton('RetryButton', 'common.retry', { base: 'ui/btn_pill_lavender', position: [0, -100] });
    retry.active = false;

    const panel = sprite(new N('RoomListPanel', { size: [W, H], position: [0, -60] }), tex('ui/panel_popup'), { type: 'sliced' });
    panel.add(title, create, rooms, hint, retry);
    script(panel, 'views/lobby/RoomListPanel', {
        content: ref(content),
        itemPrefab: prefabRef(LOBBY_PREFABS.roomItem),
        createButton: ref(create, 'cc.Button'),
        hint: ref(hint, LOCALIZED()),
        retryButton: ref(retry, 'cc.Button'),
    });
    return panel;
}

function seatSlot(index, position) {
    const avatar = circleAvatar('Avatar', 140, { position: [0, 26] });
    const nickname = label(new N('Nickname', { size: [360, 54], position: [0, -86] }), '', { fontSize: 34, tint: C.ink });
    const host = badge('HostBadge', 'room.host', C.gold, { position: [-128, 104] });
    const bot = badge('BotBadge', 'room.bot', C.lavender, { position: [128, 104] });
    const remove = iconButton('RemoveBotButton', 'icon_remove', { base: 'ui/btn_circle_pink', diameter: 64, iconSize: 36, position: [150, -86] });
    const me = sprite(new N('MeMarker', { size: [400, 270] }), tex('ui/panel_input'), { type: 'sliced', tint: C.pink });
    const occupied = new N('Occupied', { size: [400, 270] }).add(me, avatar, nickname, host, bot, remove);

    const emptyText = localized(label(new N('Label', { size: [300, 60], position: [0, 50] }), '', { fontSize: 36, tint: '#a39cb8' }), 'room.emptySeat');
    const addBot = pillButton('AddBotButton', 'room.addBot', { base: 'ui/btn_pill_lavender', width: 260, height: 84, fontSize: 32, position: [0, -50] });
    const sit = pillButton('SitButton', 'room.sit', { width: 260, height: 84, fontSize: 32, position: [0, -50] });
    const empty = new N('Empty', { size: [400, 270] }).add(emptyText, addBot, sit);

    const node = sprite(new N(`Seat${index + 1}`, { size: [400, 270], position }), tex('ui/panel_white'), { type: 'sliced', tint: '#f6efff' });
    node.add(occupied, empty);
    script(node, 'views/lobby/SeatSlot', {
        occupiedRoot: ref(occupied),
        emptyRoot: ref(empty),
        avatar: ref(avatar, scriptTypeOf('views/common/AvatarImage')),
        nickname: ref(nickname, 'cc.Label'),
        hostBadge: ref(host),
        botBadge: ref(bot),
        meMarker: ref(me),
        addBotButton: ref(addBot, 'cc.Button'),
        removeBotButton: ref(remove, 'cc.Button'),
        sitButton: ref(sit, 'cc.Button'),
    });
    return node;
}

function waitingRoomPanel() {
    const W = 1440;
    const H = 820;
    const title = localized(label(new N('Title', { size: [1000, 70], position: [0, H / 2 - 70] }), '', { fontSize: 46, tint: C.pinkDeep }), 'lobby.roomName', ['host=…']);
    const seats = [0, 1, 2, 3, 4, 5].map((i) => seatSlot(i, [(i % 3 - 1) * 440, i < 3 ? 140 : -150]));

    const leave = pillButton('LeaveButton', 'room.leave', { base: 'ui/btn_pill_lavender', width: 300, height: 96, fontSize: 34, position: [-W / 2 + 210, -H / 2 + 75] });
    const spectators = localized(label(new N('Spectators', { size: [400, 60], position: [-140, -H / 2 + 75] }), '', { fontSize: 32, tint: C.inkSoft, bold: false }), 'lobby.spectators', ['count=0']);
    const start = pillButton('StartButton', 'room.start', { width: 340, height: 104, fontSize: 40, position: [W / 2 - 230, -H / 2 + 75] });
    const waiting = localized(label(new N('WaitingHint', { size: [600, 60], position: [W / 2 - 340, -H / 2 + 75] }), '', { fontSize: 34, tint: C.purpleDeep }), 'room.waitingHost');
    const needPlayers = localized(label(new N('NeedPlayersHint', { size: [500, 44], position: [W / 2 - 230, -H / 2 + 150] }), '', { fontSize: 26, tint: C.pinkDeep, bold: false }), 'room.needPlayers');

    const panel = sprite(new N('WaitingRoomPanel', { size: [W, H], position: [0, -60], active: false }), tex('ui/panel_popup'), { type: 'sliced' });
    panel.add(title, ...seats, leave, spectators, start, waiting, needPlayers);
    script(panel, 'views/lobby/WaitingRoomPanel', {
        title: ref(title, LOCALIZED()),
        seats: seats.map((s) => ref(s, scriptTypeOf('views/lobby/SeatSlot'))),
        spectators: ref(spectators, LOCALIZED()),
        startButton: ref(start, 'cc.Button'),
        waitingHint: ref(waiting),
        needPlayersHint: ref(needPlayers),
        leaveButton: ref(leave, 'cc.Button'),
    });
    return panel;
}

export function writeLobby({ force } = {}) {
    const clips = writePopupClips();
    const written = [writeToast(force), writeRoomItem(force), writeProfilePopup(force, clips)];

    const { canvas, safe } = canvasNode();
    const background = sprite(new N('Background', { size: [1920, 1080] }), tex('title/title_bg'));
    script(background, 'views/common/CoverBackground');
    const tint = solid('Tint', 1920, 1080, C.purpleDeep, 60);
    stretch(tint);

    const list = roomListPanel();
    const room = waitingRoomPanel();
    const badgeNode = profileBadge();
    safe.add(badgeNode, systemButtons());

    const loadingText = localized(label(new N('Label', { size: [800, 80] }), '', { fontSize: 44, tint: C.white }), 'common.loading');
    const loading = solid('Loading', 1920, 1080, C.black, 140, { active: false });
    stretch(loading);
    blockInput(loading);
    loading.add(loadingText);

    canvas.add(background, tint, sparkleParticles('Sparkles', { rate: 3, total: 20 }), list, room, safe, loading);
    script(canvas, 'views/lobby/LobbyView', {
        listPanel: ref(list, scriptTypeOf('views/lobby/RoomListPanel')),
        roomPanel: ref(room, scriptTypeOf('views/lobby/WaitingRoomPanel')),
        profileBadge: ref(badgeNode, scriptTypeOf('views/common/ProfileBadge')),
        loading: ref(loading),
        profilePopup: prefabRef(LOBBY_PREFABS.profile),
        toastPrefab: prefabRef(LOBBY_PREFABS.toast),
    });
    written.push(writeScene('scenes/Lobby.scene', canvas, { force }));
    return written;
}

export { PREFABS };
