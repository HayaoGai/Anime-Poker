import { _decorator, Button, director, Label, Node, ParticleSystem2D, Prefab, resources, SpriteFrame, Vec3 } from 'cc';
import { audio, voiceActionFor } from '../../core/AudioManager';
import { backKey } from '../../core/BackKey';
import { eventBus } from '../../core/EventBus';
import { popups } from '../../core/PopupManager';
import { toast } from '../../core/Toast';
import { ViewBase } from '../../core/ViewBase';
import { i18n, t, type I18nKey } from '../../i18n/I18n';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import type { TableSnapshot } from '../../models/TableSnapshot';
import { tableStore } from '../../models/TableStore';
import { nativeBridge } from '../../native/NativeBridge';
import type { Card } from '../../shared/cards';
import { HandCategory } from '../../shared/poker';
import { RoomPhase } from '../../shared/protocol';
import { ACTION_TIMEOUT_MS, MAX_SEATS, toBB } from '../../shared/rules';
import { TableViewModel, type HandEventPayload } from '../../viewmodels/TableViewModel';
import { ConfirmPopup } from '../common/ConfirmPopup';
import { ActionPanel } from './ActionPanel';
import { cardFrames } from './CardFrames';
import { CardView } from './CardView';
import { Flyer } from './Flyer';
import { SeatView, type SeatRenderOptions } from './SeatView';
import { WinBanner } from './WinBanner';

const { ccclass, property, menu } = _decorator;

/** 由大到小的籌碼面額（與 tools/gen-art/chips.mjs 一致） */
const CHIP_VALUES = [500, 100, 25, 5, 1];

/** 依金額組合出最多 5 枚籌碼的面額（用於飛行動畫） */
function chipsFor(amount: number): number[] {
    const chips: number[] = [];
    let rest = amount;
    for (const value of CHIP_VALUES) {
        while (rest >= value && chips.length < 5) {
            chips.push(value);
            rest -= value;
        }
    }
    return chips.length ? chips : [1];
}

/**
 * Table 場景。畫面以「狀態差異」驅動動畫：
 *   - 座位、籌碼、公共牌等持久狀態以伺服器快照為準（中途加入、斷線重連都能直接正確顯示）
 *   - 快照的變化觸發動畫：下注增加 → 籌碼飛到桌上；下注歸零且底池增加 → 收進底池；公共牌增加 → 發牌並翻牌
 *   - 牌局事件觸發一次性的效果：發底牌、行動氣泡與人聲、攤牌翻牌、贏家高亮與粒子、倒數
 */
@ccclass('TableView')
@menu('AnimePoker/TableView')
export class TableView extends ViewBase {
    @property({ type: [SeatView], tooltip: '依畫面位置排列：0 為正下方（自己），順時針' })
    seats: SeatView[] = [];

    @property([CardView])
    board: CardView[] = [];

    @property(Node)
    potRoot: Node | null = null;

    @property(Label)
    potLabel: Label | null = null;

    @property({ type: Node, tooltip: '發牌的起點（牌堆）' })
    deck: Node | null = null;

    @property({ type: Node, tooltip: '飛行中的牌與籌碼所在的圖層' })
    effects: Node | null = null;

    @property({ type: Node, tooltip: '飛行用的牌（Sprite）範本' })
    cardTemplate: Node | null = null;

    @property({ type: Node, tooltip: '飛行用的籌碼（Sprite）範本' })
    chipTemplate: Node | null = null;

    @property({ type: ParticleSystem2D, tooltip: '贏得底池時在贏家位置爆出的金幣' })
    coinBurst: ParticleSystem2D | null = null;

    @property(ActionPanel)
    actionPanel: ActionPanel | null = null;

    @property(Label)
    myCountdown: Label | null = null;

    @property(Button)
    leaveButton: Button | null = null;

    @property(Button)
    spectateButton: Button | null = null;

    @property(Button)
    sitButton: Button | null = null;

    @property(Node)
    reconnecting: Node | null = null;

    @property(WinBanner)
    winBanner: WinBanner | null = null;

    @property(LocalizedLabel)
    spectatingLabel: LocalizedLabel | null = null;

    @property(Prefab)
    confirmPopup: Prefab | null = null;

    @property(Prefab)
    toastPrefab: Prefab | null = null;

    private vm: TableViewModel | null = null;
    private cardFlyer: Flyer | null = null;
    private chipFlyer: Flyer | null = null;
    private readonly chipFrames = new Map<number, SpriteFrame>();

    private previous: TableSnapshot | null = null;
    /** 已完成發牌動畫、可顯示底牌的那一手 */
    private dealtHand = -1;
    /** 公共牌已顯示（含飛行中）的張數 */
    private boardShown = 0;
    private lastCountdownSecond = -1;
    private ready = false;
    private leavingScene = false;

    protected onLoad(): void {
        // 直接從 Table 場景開始預覽時沒有連線：回到 Lobby
        if (!tableStore.session) {
            this.scheduleOnce(() => director.loadScene('Lobby'), 0);
            return;
        }
        toast.register(this.toastPrefab);
        if (this.effects && this.cardTemplate) this.cardFlyer = new Flyer(this.effects, this.cardTemplate);
        if (this.effects && this.chipTemplate) this.chipFlyer = new Flyer(this.effects, this.chipTemplate);

        this.vm = new TableViewModel();
        this.bindings.add(this.vm);
        this.actionPanel?.bindViewModel(this.vm);

        this.leaveButton?.node.on(Button.EventType.CLICK, () => void this.confirmLeave());
        this.spectateButton?.node.on(Button.EventType.CLICK, () => void this.confirmSpectate());
        this.sitButton?.node.on(Button.EventType.CLICK, () => this.vm?.sit());
        this.bindings.add(backKey.push(() => (void this.confirmLeave(), true)));
        if (this.winBanner) this.winBanner.onShare = () => void this.share();

        nativeBridge.setKeepScreenOn(true);
        void audio.playBgm('table');

        // 先載入牌面與籌碼圖片再開始渲染，動畫中不必等待載入
        void Promise.all([cardFrames.preload(), this.loadChipFrames()]).then(() => {
            if (!this.isValid) return;
            this.ready = true;
            this.bindViewModel(this.vm!);
        });
    }

    protected onDestroy(): void {
        nativeBridge.setKeepScreenOn(false);
        super.onDestroy();
    }

    protected update(): void {
        if (!this.ready || !this.vm) return;
        const s = this.vm.snapshot.value;
        const turnSeat = s?.turnSeat ?? -1;
        const remaining = s && turnSeat >= 0 ? this.vm.remaining(s.turnDeadline) : 0;
        for (let seat = 0; seat < MAX_SEATS; seat++) {
            const view = this.seatView(seat);
            view?.setTimer(seat === turnSeat && s!.turnDeadline > 0 ? remaining / ACTION_TIMEOUT_MS : null);
        }

        // 自己的倒數：剩 5 秒起每秒滴答，最後 3 秒改為警示音並震動
        const myTurn = turnSeat >= 0 && turnSeat === this.vm.mySeat.value;
        if (this.myCountdown) {
            this.myCountdown.node.active = myTurn;
            if (myTurn) this.myCountdown.string = String(Math.ceil(remaining / 1000));
        }
        const second = myTurn ? Math.ceil(remaining / 1000) : -1;
        if (second !== this.lastCountdownSecond) {
            this.lastCountdownSecond = second;
            if (second > 0 && second <= 3) {
                void audio.playSfx('timer_warning');
                nativeBridge.vibrate('warning');
            } else if (second > 3 && second <= 5) {
                void audio.playSfx('timer_tick');
            }
        }
    }

    // ---------------------------------------------------------------- 綁定

    private bindViewModel(vm: TableViewModel): void {
        this.bind(vm.snapshot, (snapshot) => this.onSnapshot(snapshot));
        this.bind(vm.holeCards, () => this.renderSeats(vm.snapshot.value));
        this.bind(vm.isSpectator, (spectator) => {
            if (this.spectateButton) this.spectateButton.node.active = !spectator;
            this.renderSpectator();
        });
        this.bind(vm.connection, (state) => {
            if (this.reconnecting) this.reconnecting.active = state === 'reconnecting';
            if (state === 'closed') this.backToLobby();
        });
        vm.onHandEvent((event) => this.onHandEvent(event));
        vm.onGameOver(({ winnerSeat, nickname }) => {
            const isMe = winnerSeat >= 0 && winnerSeat === vm.mySeat.value;
            void audio.playSfx(isMe ? 'win' : 'lose');
            if (isMe) nativeBridge.vibrate('success');
            this.winBanner?.show(nickname, isMe, true);
        });
        vm.onNotice(({ code, nickname }) => toast.show(i18n.tCode('notice', code, { name: nickname ?? '' })));
        vm.onError(({ code }) => toast.show(i18n.tCode('error', code)));
        this.bindings.add(eventBus.on('networkChanged', (online) => !online && toast.show(t('common.offline'))));
    }

    private onSnapshot(snapshot: TableSnapshot | null): void {
        if (!snapshot) return;
        const prev = this.previous;
        this.previous = snapshot;

        // 第一次收到狀態（剛進入、中途加入、重連）：直接顯示目前這一手，不補播發牌動畫
        if (!prev) {
            this.dealtHand = snapshot.handNumber;
            this.boardShown = snapshot.board.length;
            this.board.forEach((card, i) => {
                card.node.active = i < snapshot.board.length;
                if (card.node.active) card.show(snapshot.board[i], true);
            });
        } else {
            this.animateDiff(prev, snapshot);
        }
        this.renderSeats(snapshot);
        this.renderBoard(snapshot);
        this.renderPot(snapshot);
        this.renderSpectator();

        // 比賽結束、回到房間大廳
        if (snapshot.phase === RoomPhase.Lobby && prev?.phase === RoomPhase.Playing) {
            this.scheduleOnce(() => this.backToLobby(), 1);
        }
    }

    // ---------------------------------------------------------------- 渲染

    private seatView(seat: number): SeatView | undefined {
        return this.vm ? this.seats[this.vm.visualIndex(seat)] : undefined;
    }

    private renderSeats(snapshot: TableSnapshot | null): void {
        if (!snapshot || !this.vm) return;
        const me = this.vm.mySeat.value;
        snapshot.seats.forEach((seat, index) => {
            const view = this.seatView(index);
            if (!view) return;
            const playing = snapshot.phase === RoomPhase.Playing;
            let cards: SeatRenderOptions['cards'] = null;
            if (seat.occupied && seat.inHand && snapshot.handNumber === this.dealtHand) {
                if (seat.shownCards.length) cards = seat.shownCards;
                else if (index === me && this.vm!.holeCards.value.length) cards = this.vm!.holeCards.value;
                else if (!seat.folded) cards = [null, null];
            }
            let status: I18nKey | null = null;
            if (seat.occupied && !seat.connected) status = 'table.disconnected';
            else if (seat.occupied && playing && !seat.inHand && snapshot.street) status = 'table.waitingNextHand';

            view.render(seat, {
                marker: !snapshot.street ? null : index === snapshot.buttonSeat ? 'dealer' : index === snapshot.smallBlindSeat ? 'sb' : index === snapshot.bigBlindSeat ? 'bb' : null,
                cards,
                status,
                isMe: index === me,
            });
        });
    }

    private renderBoard(snapshot: TableSnapshot): void {
        // 新的一手：清空公共牌
        if (snapshot.board.length < this.boardShown) {
            this.boardShown = 0;
            for (const card of this.board) {
                card.node.active = false;
                card.setHighlight(false);
            }
        }
        // 新增的公共牌：從牌堆飛到位置後翻開
        for (let i = this.boardShown; i < snapshot.board.length; i++) {
            const card = this.board[i];
            const code = snapshot.board[i];
            const delay = (i - this.boardShown) * 0.12;
            card.node.active = false;
            card.show(null, false);
            void this.flyCard(this.deck?.worldPosition ?? card.node.worldPosition, card.node.worldPosition, delay, 0.32).then(() => {
                card.node.active = true;
                void card.flip(code, 0.26);
            });
        }
        this.boardShown = snapshot.board.length;
    }

    private renderPot(snapshot: TableSnapshot): void {
        const total = snapshot.pots.reduce((a, b) => a + b, 0);
        if (this.potRoot) this.potRoot.active = total > 0;
        if (this.potLabel) {
            const sides = snapshot.pots.filter((p) => p > 0).length;
            this.potLabel.string = `${t('table.pot')} ${t('common.bb', { value: toBB(total) })}${sides > 1 ? `  (+${sides - 1})` : ''}`;
        }
    }

    private renderSpectator(): void {
        const vm = this.vm;
        const snapshot = vm?.snapshot.value;
        if (!vm || !snapshot) return;
        const spectator = vm.isSpectator.value;
        const freeSeat = snapshot.seats.some((s) => !s.occupied);
        if (this.sitButton) this.sitButton.node.active = spectator && freeSeat;
        if (this.spectatingLabel) this.spectatingLabel.node.active = spectator;
    }

    // ---------------------------------------------------------------- 狀態差異動畫

    private animateDiff(prev: TableSnapshot, next: TableSnapshot): void {
        let collected = false;
        next.seats.forEach((seat, index) => {
            const before = prev.seats[index];
            const view = this.seatView(index);
            if (!view || !before) return;
            // 下注增加：籌碼從頭像飛到桌上
            if (seat.bet > before.bet && seat.occupied) {
                this.flyChips(seat.bet - before.bet, view.avatarWorldPosition, view.betWorldPosition, 0.32);
            }
            // 本輪結束、下注收進底池
            if (before.bet > 0 && seat.bet === 0 && next.pots.reduce((a, b) => a + b, 0) > 0 && this.potRoot) {
                this.flyChips(before.bet, view.betWorldPosition, this.potRoot.worldPosition, 0.4);
                collected = true;
            }
        });
        if (collected) void audio.playSfx('chip_collect');
    }

    private flyChips(amount: number, from: Vec3, to: Vec3, duration: number): void {
        if (!this.chipFlyer) return;
        chipsFor(amount).forEach((value, i) => {
            void this.chipFlyer!.fly(this.chipFrames.get(value) ?? null, from, to, { duration, delay: i * 0.04, arc: 0.18, fromScale: 0.9, toScale: 0.7 });
        });
    }

    /** toScale：目標牌相對於飛行範本（公共牌大小）的比例 */
    private flyCard(from: Vec3, to: Vec3, delay: number, duration = 0.28, toScale = 1): Promise<void> {
        if (!this.cardFlyer) return Promise.resolve();
        return this.cardFlyer.fly(cardFrames.back, from, to, { duration, delay, arc: 0.12, fromScale: 0.5, toScale, spin: 360 });
    }

    // ---------------------------------------------------------------- 牌局事件

    private onHandEvent(event: HandEventPayload): void {
        if (!this.ready || !this.vm) return;
        switch (event.type) {
            case 'handStarted':
                this.dealtHand = -1;
                for (const seat of this.seats) seat.clearHand();
                void audio.playSfx('card_shuffle');
                break;

            case 'holeCardsDealt':
                this.dealHoleCards(event.order, event.handNumber);
                break;

            case 'actionRequired':
                if (event.seat === this.vm.mySeat.value) void audio.playSfx('your_turn');
                break;

            case 'playerActed': {
                const view = this.seatView(event.seat);
                const seat = this.vm.seat(event.seat);
                if (!view) break;
                const key: I18nKey = event.allIn ? 'action.allIn' : (`action.${event.kind}` as I18nKey);
                view.showAction(event.timedOut ? `${t('table.timedOut')}・${t(key)}` : t(key));
                if (seat) void audio.playVoice(seat.avatarId, voiceActionFor(event.kind, event.allIn));
                if (event.allIn) {
                    view.showAllIn();
                    void audio.playSfx('all_in');
                    nativeBridge.vibrate('heavy');
                } else if (event.kind === 'fold') {
                    void audio.playSfx('fold');
                } else if (event.kind === 'check') {
                    void audio.playSfx('check');
                } else {
                    void audio.playSfx('chip_bet');
                }
                break;
            }

            case 'blindPosted':
                void audio.playSfx('chip_bet', 0.6);
                break;

            case 'handsRevealed':
                void audio.playSfx('card_reveal');
                for (const { seat, cards } of event.hands) void this.seatView(seat)?.reveal(cards);
                break;

            case 'potAwarded':
                this.awardPot(event);
                break;

            case 'handEnded':
                this.highlightWinningCards(event.showdown);
                break;

            default:
                break;
        }
    }

    /** 發底牌：從牌堆一次一張繞兩圈，落地後顯示；自己的牌翻成牌面 */
    private dealHoleCards(order: number[], handNumber: number): void {
        const deck = this.deck?.worldPosition;
        if (!deck) return;
        const stagger = Math.min(0.09, 1.0 / (order.length * 2));
        let landed = 0;
        const total = order.length * 2;
        for (let round = 0; round < 2; round++) {
            order.forEach((seat, i) => {
                const view = this.seatView(seat);
                if (!view) return;
                const delay = (round * order.length + i) * stagger;
                setTimeout(() => void audio.playSfx('card_deal', 0.7), delay * 1000);
                void this.flyCard(deck, view.cardWorldPosition(round), delay, 0.28, view.cardScale(this.board[0])).then(() => {
                    landed++;
                    if (landed === total) {
                        this.dealtHand = handNumber;
                        this.renderSeats(this.vm?.snapshot.value ?? null);
                        // 自己的底牌：先顯示牌背再翻開
                        const me = this.vm?.mySeat.value ?? -1;
                        const cards = this.vm?.holeCards.value ?? [];
                        if (me >= 0 && cards.length === 2) void this.seatView(me)?.reveal(cards);
                    }
                });
            });
        }
    }

    private awardPot(event: Extract<HandEventPayload, { type: 'potAwarded' }>): void {
        const pot = this.potRoot?.worldPosition;
        for (const { seat, amount } of event.winners) {
            const view = this.seatView(seat);
            if (!view || !pot) continue;
            this.flyChips(amount, pot, view.avatarWorldPosition, 0.6);
            let result: string | null = null;
            if (event.category !== null) {
                const royal = event.category === HandCategory.StraightFlush && this.isRoyal(seat);
                result = royal ? t('hand.royal') : t(`hand.${event.category}` as I18nKey);
            }
            view.showWinner(result);
            if (this.coinBurst) {
                this.coinBurst.node.setWorldPosition(view.avatarWorldPosition);
                this.coinBurst.resetSystem();
            }
            if (seat === this.vm?.mySeat.value) nativeBridge.vibrate('success');
        }
        void audio.playSfx('chip_win');
    }

    private highlightWinningCards(showdown: { seat: number; bestFive: Card[] }[]): void {
        // 只標亮贏家（有 winGlow 的座位）的最佳五張
        const snapshot = this.vm?.snapshot.value;
        if (!snapshot || !showdown.length) return;
        const best = new Set<Card>();
        for (const result of showdown) {
            const view = this.seatView(result.seat);
            if (view?.winGlow?.active) {
                result.bestFive.forEach((c) => best.add(c));
                view.highlightCards(result.bestFive);
            }
        }
        for (const card of this.board) card.setHighlight(!!card.code && best.has(card.code));
    }

    private isRoyal(seat: number): boolean {
        const s = this.vm?.snapshot.value;
        const cards = [...(s?.seats[seat]?.shownCards ?? []), ...(s?.board ?? [])];
        return ['A', 'K', 'Q', 'J', 'T'].every((rank) => cards.some((c) => c[0] === rank));
    }

    // ---------------------------------------------------------------- 離開、觀戰、分享

    private async confirmLeave(): Promise<void> {
        if (!this.confirmPopup || popups.count > 0) return;
        const ok = await popups.show<boolean, ConfirmPopup>(this.confirmPopup, (p) => p.setup({ message: 'table.leaveConfirm' }));
        if (!ok) return;
        await this.vm?.leave();
        this.backToLobby();
    }

    private async confirmSpectate(): Promise<void> {
        if (!this.confirmPopup || popups.count > 0) return;
        const ok = await popups.show<boolean, ConfirmPopup>(this.confirmPopup, (p) => p.setup({ message: 'table.spectateConfirm' }));
        if (ok) this.vm?.standUp();
    }

    /** 分享戰績（第 10 項加入截圖） */
    protected async share(): Promise<void> {}

    private backToLobby(): void {
        if (this.leavingScene) return;
        this.leavingScene = true;
        director.loadScene('Lobby');
    }

    private loadChipFrames(): Promise<void> {
        return new Promise((resolve) => {
            resources.loadDir('textures/chips', SpriteFrame, (_err, frames) => {
                for (const frame of frames ?? []) {
                    const value = Number(frame.name.replace(/^chip_/, ''));
                    if (value) this.chipFrames.set(value, frame);
                }
                resolve();
            });
        });
    }
}
