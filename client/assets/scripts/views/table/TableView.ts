import { _decorator, Button, Canvas, Color, director, easing, Label, Node, ParticleSystem2D, Prefab, resources, SpriteFrame, Vec3 } from 'cc';
import { audio, voiceActionFor } from '../../core/AudioManager';
import { backKey } from '../../core/BackKey';
import { eventBus } from '../../core/EventBus';
import { popups } from '../../core/PopupManager';
import { captureToPng } from '../../core/ScreenCapture';
import { ScreenFade } from '../../core/ScreenFade';
import { toast } from '../../core/Toast';
import { ViewBase } from '../../core/ViewBase';
import { i18n, t, type I18nKey } from '../../i18n/I18n';
import { LocalizedLabel } from '../../i18n/LocalizedLabel';
import type { TableSnapshot } from '../../models/TableSnapshot';
import { tableStore } from '../../models/TableStore';
import { nativeBridge } from '../../native/NativeBridge';
import type { Card } from '../../shared/cards';
import { categoryOf, evaluateBest, madeCards } from '../../shared/engine/HandEvaluator';
import { HandCategory } from '../../shared/poker';
import { RoomPhase } from '../../shared/protocol';
import { ACTION_TIMEOUT_MS, MAX_SEATS, toBB } from '../../shared/rules';
import { TableViewModel, type HandEventPayload } from '../../viewmodels/TableViewModel';
import { ConfirmPopup } from '../common/ConfirmPopup';
import { ActionPanel } from './ActionPanel';
import { cardFrames } from './CardFrames';
import { CardView } from './CardView';
import { Flyer } from './Flyer';
import { PauseMenuPopup, type PauseMenuChoice } from './PauseMenuPopup';
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

/** 牌型名稱（2～7 張）；A 高的同花順稱為皇家同花順 */
function handName(cards: readonly Card[]): string {
    const category = categoryOf(cards);
    if (category === HandCategory.StraightFlush) {
        const best = evaluateBest(cards).bestFive;
        if (best.some((c) => c[0] === 'A') && best.some((c) => c[0] === 'K')) return t('hand.royal');
    }
    return t(`hand.${category}` as I18nKey);
}

/**
 * Table 場景。畫面以「狀態差異」驅動動畫：
 *   - 座位、籌碼、公共牌等持久狀態以伺服器快照為準（中途加入、斷線重連都能直接正確顯示）
 *   - 快照的變化觸發動畫：下注增加 → 籌碼飛到桌上；下注歸零且底池增加 → 收進底池；公共牌增加 → 發牌並翻牌
 *   - 牌局事件觸發一次性的效果：發底牌、行動氣泡與人聲、攤牌翻牌、贏家高亮與粒子、倒數
 * 比賽結束時房間隨即解散，畫面停在最後的牌局並顯示結算橫幅，由玩家自行返回大廳。
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

    @property({ type: Button, tooltip: '開啟暫停選單（鍵盤 Esc、Android 返回鍵同樣開啟）' })
    menuButton: Button | null = null;

    @property(Button)
    sitButton: Button | null = null;

    @property(Node)
    reconnecting: Node | null = null;

    @property(WinBanner)
    winBanner: WinBanner | null = null;

    @property(LocalizedLabel)
    spectatingLabel: LocalizedLabel | null = null;

    @property({ type: Label, tooltip: '自己目前湊成的牌型' })
    handHint: Label | null = null;

    @property(Prefab)
    confirmPopup: Prefab | null = null;

    @property(Prefab)
    pauseMenuPopup: Prefab | null = null;

    @property(Prefab)
    toastPrefab: Prefab | null = null;

    private vm: TableViewModel | null = null;
    private cardFlyer: Flyer | null = null;
    private chipFlyer: Flyer | null = null;
    private readonly chipFrames = new Map<number, SpriteFrame>();

    private previous: TableSnapshot | null = null;
    /** 已完成發牌動畫、可顯示底牌的那一手 */
    private dealtHand = -1;
    /** 發牌動畫進行中的那一手，以及各座位已落地的底牌張數 */
    private dealingHand = -1;
    private readonly landedCards = new Map<number, number>();
    /** 公共牌已顯示（含飛行中）的張數 */
    private boardShown = 0;
    private lastCountdownSecond = -1;
    private ready = false;
    private leavingScene = false;
    private sharing = false;
    /** 比賽已結束、房間已解散：畫面停住，不再因連線關閉而離開 */
    private gameOver = false;

    protected onLoad(): void {
        // 直接從 Table 場景開始預覽時沒有連線：回到 Lobby
        if (!tableStore.session) {
            this.scheduleOnce(() => director.loadScene('Lobby'), 0);
            return;
        }
        // 牌桌頂部中央有時間與電量 HUD，提示往下移
        toast.register(this.toastPrefab, 420);
        if (this.effects && this.cardTemplate) this.cardFlyer = new Flyer(this.effects, this.cardTemplate);
        if (this.effects && this.chipTemplate) this.chipFlyer = new Flyer(this.effects, this.chipTemplate);

        this.vm = new TableViewModel();
        this.bindings.add(this.vm);
        this.actionPanel?.bindViewModel(this.vm);

        this.menuButton?.node.on(Button.EventType.CLICK, () => void this.openMenu());
        this.sitButton?.node.on(Button.EventType.CLICK, () => this.vm?.sit());
        this.bindings.add(backKey.push(() => (void this.openMenu(), true)));
        if (this.winBanner) {
            this.winBanner.onShare = () => void this.share();
            this.winBanner.onLeave = () => void this.confirmLeave();
        }
        if (this.handHint) this.handHint.node.active = false;

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
        this.bind(vm.holeCards, () => {
            this.renderSeats(vm.snapshot.value);
            this.renderHandHint();
        });
        this.bind(vm.isSpectator, () => this.renderSpectator());
        this.bind(i18n.language, () => this.renderHandHint());
        this.bind(vm.connection, (state) => {
            if (this.reconnecting) this.reconnecting.active = state === 'reconnecting' && !this.gameOver;
            // 比賽結束時房間解散、連線關閉，但留在牌桌畫面
            if (state === 'closed' && !this.gameOver) this.backToLobby();
        });
        vm.onHandEvent((event) => this.onHandEvent(event));
        vm.onGameOver(({ winnerSeat, nickname }) => {
            // 連線隨即關閉、快照會被清空，先判斷贏家是不是自己
            const isMe = winnerSeat >= 0 && winnerSeat === vm.mySeat.value;
            this.gameOver = true;
            this.renderSpectator();
            this.renderHandHint();
            void audio.playSfx(isMe ? 'win' : 'lose');
            if (isMe) nativeBridge.vibrate('success');
            this.winBanner?.show(nickname, isMe, true);
        });
        vm.onNotice(({ code, nickname }) => toast.show(i18n.tCode('notice', code, { name: nickname ?? '' })));
        vm.onError(({ code }) => toast.show(i18n.tCode('error', code)));
        this.bindings.add(eventBus.on('networkChanged', (online) => !online && toast.show(t('common.offline'))));
    }

    private onSnapshot(snapshot: TableSnapshot | null): void {
        // 比賽結束後畫面停在最後的牌局
        if (!snapshot || this.gameOver) return;
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
        this.renderHandHint();
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
            } else if (seat.occupied && seat.inHand && snapshot.handNumber === this.dealingHand) {
                // 發牌中：只顯示已落地的牌
                const landed = this.landedCards.get(index) ?? 0;
                if (landed) cards = this.dealtCards(index, landed);
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
                card.clearEmphasis();
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
                // 牌翻開後才更新牌型提示，不會先透露牌面
                void card.flip(code, 0.26).then(() => this.renderHandHint());
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
        if (!vm) return;
        const spectator = vm.isSpectator.value;
        if (!snapshot || this.gameOver) {
            if (this.sitButton) this.sitButton.node.active = false;
            return;
        }
        const freeSeat = snapshot.seats.some((s) => !s.occupied);
        if (this.sitButton) this.sitButton.node.active = spectator && freeSeat;
        if (this.spectatingLabel) this.spectatingLabel.node.active = spectator;
    }

    /** 自己目前湊成的牌型：底牌加上已翻開的公共牌；棄牌、觀戰或比賽結束時隱藏 */
    private renderHandHint(): void {
        const label = this.handHint;
        const vm = this.vm;
        if (!label || !vm) return;
        const snapshot = vm.snapshot.value;
        const me = snapshot?.seats[vm.mySeat.value];
        const hole = vm.holeCards.value;
        const show = !this.gameOver && !!me && me.inHand && !me.folded && snapshot!.handNumber === this.dealtHand && hole.length === 2;
        label.node.active = show;
        if (!show) return;
        const board = this.board.filter((card) => card.node.active && card.isFaceUp && card.code).map((card) => card.code!);
        label.string = t('table.handHint', { hand: handName([...hole, ...board]) });
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
                this.renderHandHint();
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

            default:
                break;
        }
    }

    /** 發底牌：從牌堆一次一張繞兩圈，每張落地就顯示；自己的牌落地後隨即翻開 */
    private dealHoleCards(order: number[], handNumber: number): void {
        const deck = this.deck?.worldPosition;
        if (!deck) return;
        this.dealingHand = handNumber;
        this.landedCards.clear();
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
                    // 這一手已經結束（例如動畫期間收到下一手）時不再顯示
                    if (this.dealingHand !== handNumber) return;
                    this.landedCards.set(seat, round + 1);
                    this.seatView(seat)?.dealCard(round, this.dealtCards(seat, round + 1)[round]);
                    landed++;
                    if (landed === total) {
                        this.dealtHand = handNumber;
                        this.renderSeats(this.vm?.snapshot.value ?? null);
                        this.renderHandHint();
                    }
                });
            });
        }
    }

    /** 發牌中某座位已落地的牌：自己的牌（已收到底牌時）為牌面，其他人為牌背 */
    private dealtCards(seat: number, count: number): (Card | null)[] {
        const hole = this.vm?.holeCards.value ?? [];
        const mine = seat === this.vm?.mySeat.value && hole.length === 2;
        return Array.from({ length: count }, (_, i) => (mine ? hole[i] : null));
    }

    private awardPot(event: Extract<HandEventPayload, { type: 'potAwarded' }>): void {
        const pot = this.potRoot?.worldPosition;
        // 攤牌贏得的底池：凸顯這個底池贏家的牌型（有邊池時依序切換到各池的贏家）
        if (event.category !== null) this.highlightWinningHand(event.winners.map((w) => w.seat));
        for (const { seat, amount } of event.winners) {
            const view = this.seatView(seat);
            if (!view || !pot) continue;
            this.flyChips(amount, pot, view.avatarWorldPosition, 0.6);
            const cards = this.showdownCards(seat);
            view.showWinner(event.category !== null && cards.length >= 5 ? handName(cards) : null);
            if (this.coinBurst) {
                this.coinBurst.node.setWorldPosition(view.avatarWorldPosition);
                this.coinBurst.resetSystem();
            }
            if (seat === this.vm?.mySeat.value) nativeBridge.vibrate('success');
        }
        void audio.playSfx('chip_win');
    }

    /** 攤牌時某個座位的底牌加上公共牌 */
    private showdownCards(seat: number): Card[] {
        const s = this.vm?.snapshot.value;
        return [...(s?.seats[seat]?.shownCards ?? []), ...(s?.board ?? [])];
    }

    /**
     * 凸顯贏家的牌型：構成牌型的牌（例如一對的那兩張）加上金框，同屬最佳五張的 kicker 維持原樣，
     * 桌上其他亮出的牌（公共牌與所有攤牌者的底牌）變暗。
     */
    private highlightWinningHand(winners: number[]): void {
        const made = new Set<Card>();
        const best = new Set<Card>();
        for (const seat of winners) {
            const cards = this.showdownCards(seat);
            if (cards.length < 5) continue;
            const value = evaluateBest(cards);
            value.bestFive.forEach((c) => best.add(c));
            madeCards(value).forEach((c) => made.add(c));
        }
        if (!best.size) return;
        const apply = (card: CardView) => {
            const code = card.node.active && card.isFaceUp ? card.code : null;
            card.setHighlight(!!code && made.has(code));
            card.setDimmed(!!code && !best.has(code));
        };
        this.board.forEach(apply);
        for (const seat of this.seats) seat.cards.forEach(apply);
    }

    // ---------------------------------------------------------------- 選單、離開、觀戰、分享

    /** 暫停選單；離線模式在選單與接著的確認框開啟期間暫停牌局 */
    private async openMenu(): Promise<void> {
        const vm = this.vm;
        if (!vm || !this.pauseMenuPopup || popups.count > 0 || this.leavingScene) return;
        // 離線模式沒有觀戰；比賽結束後只能離開
        const canSpectate = !vm.offline && !vm.isSpectator.value && !this.gameOver;
        vm.setPaused(true);
        try {
            const choice = await popups.show<PauseMenuChoice, PauseMenuPopup>(this.pauseMenuPopup, (p) => p.setup({ paused: vm.offline, canSpectate }));
            if (choice === 'leave') await this.confirmLeave();
            else if (choice === 'spectate') await this.confirmSpectate();
        } finally {
            vm.setPaused(false);
        }
    }

    // 選單關閉後節點要到這一格結束才銷毀（popups.count 仍算著它），確認框直接開啟、不檢查 popups.count
    private async confirmLeave(): Promise<void> {
        // 比賽已結束、房間已解散：不會棄牌，直接返回
        if (this.gameOver) {
            void this.vm?.leave();
            this.backToLobby();
            return;
        }
        if (!this.confirmPopup) return;
        const ok = await popups.show<boolean, ConfirmPopup>(this.confirmPopup, (p) => p.setup({ message: 'table.leaveConfirm' }));
        if (!ok) return;
        await this.vm?.leave();
        this.backToLobby();
    }

    private async confirmSpectate(): Promise<void> {
        if (!this.confirmPopup) return;
        const ok = await popups.show<boolean, ConfirmPopup>(this.confirmPopup, (p) => p.setup({ message: 'table.spectateConfirm' }));
        if (ok) this.vm?.standUp();
    }

    /** 分享戰績：截圖（不含分享按鈕）→ 快門閃光 → 交給平台分享（Android 分享選單／Web Share／下載） */
    private async share(): Promise<void> {
        const camera = director.getScene()?.getComponentInChildren(Canvas)?.cameraComponent;
        if (this.sharing || !camera) return;
        this.sharing = true;
        // 截圖不含按鈕列（分享、返回大廳）
        const button = this.winBanner?.buttons ?? this.winBanner?.shareButton?.node;
        if (button) button.active = false;
        try {
            const png = await captureToPng(camera);
            this.cameraFlash();
            void audio.playSfx('card_flip');
            await nativeBridge.shareImage(png, t('table.shareText'));
        } catch (err) {
            console.warn('[Table] 分享失敗', err);
            toast.show(t('table.shareFailed'));
        } finally {
            if (button?.isValid) button.active = true;
            this.sharing = false;
        }
    }

    /** 全畫面白光淡出，讓截圖有拍照的回饋 */
    private cameraFlash(): void {
        void ScreenFade.show(Color.WHITE, 0.35, { from: 220, ease: easing.quadOut });
    }

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
