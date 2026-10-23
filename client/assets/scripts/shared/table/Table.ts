// ⚠️ 自動產生的檔案，請勿直接修改。來源：shared/src/table/Table.ts，執行 pnpm sync:shared 更新。
import { ErrorCode } from '../errors';
import type { HandEvent, HandEventType } from '../events';
import { ActionType, type PlayerAction } from '../poker';
import {
    AVATAR_ID_PATTERN,
    ClientMessage,
    DEFAULT_AVATAR_IDS,
    NoticeCode,
    PLAYER_ID_PATTERN,
    RoomPhase,
    ServerMessage,
    normalizeNickname,
    type ClientPayloads,
    type RoomMetadata,
    type ServerPayloads,
} from '../protocol';
import { ACTION_TIMEOUT_MS, BIG_BLIND, MAX_SEATS, MIN_PLAYERS_TO_START, SMALL_BLIND, STARTING_STACK } from '../rules';
import { decideBotAction } from '../engine/BotAI';
import { Deck } from '../engine/Deck';
import { HandController } from '../engine/HandController';
import { nextButton } from '../engine/positions';
import type { Rng } from '../engine/rng';
import type { SeatData, TableState } from './state';

/** 輸出通道：伺服器由 PokerRoom 實作，離線模式由客戶端的 LocalTableSession 實作 */
export interface TableOutput {
    broadcast<T extends ServerMessage>(type: T, payload: ServerPayloads[T]): void;
    send<T extends ServerMessage>(sessionId: string, type: T, payload: ServerPayloads[T]): void;
    updateListing(metadata: RoomMetadata): void;
    /** 中斷所有連線並關閉房間 */
    dissolve(): void;
}

export interface Timer {
    clear(): void;
}

export interface Scheduler {
    now(): number;
    setTimeout(callback: () => void, ms: number): Timer;
}

/** 每種事件播放後，等待多久再處理下一個事件（給客戶端播動畫的時間） */
export type Pacing = Record<HandEventType, number> & { nextHand: number; gameOver: number };

export const DEFAULT_PACING: Pacing = {
    handStarted: 500,
    blindPosted: 300,
    holeCardsDealt: 1500,
    actionRequired: 0,
    playerActed: 500,
    uncalledReturned: 400,
    betsCollected: 600,
    boardDealt: 900,
    handsRevealed: 1500,
    potAwarded: 1800,
    handEnded: 2000,
    nextHand: 1000,
    // 勝利橫幅停留的時間（含分享戰績），之後回到房間大廳
    gameOver: 6000,
};

export interface TableOptions<S extends TableState = TableState> {
    /** 牌桌狀態：伺服器傳入 Colyseus Schema，離線模式傳入一般物件 */
    state: S;
    output: TableOutput;
    scheduler: Scheduler;
    rng: Rng;
    /** 測試可注入指定牌序 */
    createDeck?: () => Deck;
    pacing?: Pacing;
    /** 電腦思考時間範圍 [min, max] ms */
    botThinkMs?: [number, number];
    actionTimeoutMs?: number;
}

export type JoinResult = { ok: true } | { ok: false; error: ErrorCode };

interface Member {
    sessionId: string;
    playerId: string;
    nickname: string;
    avatarId: string;
    /** 參賽中的座位；觀戰者為 null */
    seat: number | null;
    connected: boolean;
    /** 加入或坐下的順序，房主轉移時依此決定下一位 */
    order: number;
}

const BOT_NAMES = ['Sakura', 'Yuki', 'Hana', 'Rin', 'Mio', 'Aoi', 'Kaede', 'Nana', 'Hikari', 'Momo'];

/**
 * 一張牌桌的完整邏輯：成員與座位、房主、電腦、一手接一手的牌局、行動計時與事件播放節奏。
 * 不依賴 Colyseus，狀態、排程、輸出與隨機來源由外部注入：伺服器與客戶端的離線模式共用，
 * 也可以在測試中以手動時鐘精確驅動。
 */
export class Table<S extends TableState = TableState> {
    readonly state: S;

    private readonly output: TableOutput;
    private readonly scheduler: Scheduler;
    private readonly rng: Rng;
    private readonly createDeck: () => Deck;
    private readonly pacing: Pacing;
    private readonly botThinkMs: [number, number];
    private readonly actionTimeoutMs: number;

    private readonly members = new Map<string, Member>();
    private orderCounter = 0;

    private hand: HandController | null = null;
    private previousButton: number | null = null;
    /** 這手牌結束後要清空的座位（牌局中離桌、改為觀戰） */
    private readonly vacateAfterHand = new Set<number>();

    private readonly queue: { event: HandEvent; timedOut: boolean }[] = [];
    private pumpTimer: Timer | null = null;
    private turnTimer: Timer | null = null;
    private botTimer: Timer | null = null;
    private stageTimer: Timer | null = null;
    private disposed = false;

    constructor(options: TableOptions<S>) {
        this.state = options.state;
        this.output = options.output;
        this.scheduler = options.scheduler;
        this.rng = options.rng;
        this.createDeck = options.createDeck ?? (() => Deck.shuffled(this.rng));
        this.pacing = options.pacing ?? DEFAULT_PACING;
        this.botThinkMs = options.botThinkMs ?? [1000, 2500];
        this.actionTimeoutMs = options.actionTimeoutMs ?? ACTION_TIMEOUT_MS;
    }

    // ================================================================ 成員

    join(sessionId: string, raw: unknown): JoinResult {
        const options = (raw ?? {}) as Record<string, unknown>;
        const nickname = normalizeNickname(options.nickname);
        const { playerId, avatarId } = options;
        if (
            !nickname ||
            typeof playerId !== 'string' ||
            !PLAYER_ID_PATTERN.test(playerId) ||
            typeof avatarId !== 'string' ||
            !AVATAR_ID_PATTERN.test(avatarId)
        ) {
            return { ok: false, error: ErrorCode.InvalidOptions };
        }

        // 同一位玩家關掉 App 後重新進入：寬限期內接回原本的身分與座位
        const existing = [...this.members.values()].find((m) => m.playerId === playerId);
        if (existing) {
            if (existing.connected) return { ok: false, error: ErrorCode.AlreadyInRoom };
            this.rebind(existing, sessionId);
            return { ok: true };
        }

        const isCreator = this.members.size === 0 && !this.state.hostSessionId;
        const member: Member = { sessionId, playerId, nickname, avatarId, seat: null, connected: true, order: this.orderCounter++ };
        this.members.set(sessionId, member);

        if (isCreator || options.asSpectator !== true) {
            const seat = this.freeSeat();
            if (seat === null) {
                this.output.send(sessionId, ServerMessage.Notice, { code: NoticeCode.SeatedAsSpectator });
            } else {
                this.seatMember(member, seat);
            }
        }

        if (isCreator) this.state.hostSessionId = sessionId;
        this.output.broadcast(ServerMessage.Notice, { code: NoticeCode.PlayerJoined, nickname });
        this.refreshListing();
        return { ok: true };
    }

    /** 真正離開房間（主動離開，或斷線寬限期已過） */
    leave(sessionId: string): void {
        const member = this.members.get(sessionId);
        if (!member) return;
        this.members.delete(sessionId);
        // 解散後 Colyseus 會對每個人觸發離開，此時不需要再處理
        if (this.disposed) return;

        if (member.seat !== null) this.releaseSeat(member);
        this.output.broadcast(ServerMessage.Notice, { code: NoticeCode.PlayerLeft, nickname: member.nickname });

        this.afterParticipantChange();
    }

    /** 非自願斷線：保留身分與座位，倒數與自動動作照常進行 */
    disconnect(sessionId: string): void {
        const member = this.members.get(sessionId);
        if (!member) return;
        member.connected = false;
        if (member.seat !== null) this.state.seats[member.seat].connected = false;
    }

    reconnect(sessionId: string): void {
        const member = this.members.get(sessionId);
        if (!member) return;
        member.connected = true;
        if (member.seat !== null) this.state.seats[member.seat].connected = true;
        this.resendPrivateState(member);
    }

    // ================================================================ 訊息

    handleMessage(sessionId: string, type: string, payload: unknown): void {
        const member = this.members.get(sessionId);
        if (!member) return;

        const error = this.dispatch(member, type, payload);
        if (error) this.output.send(sessionId, ServerMessage.Error, { code: error });
    }

    private dispatch(member: Member, type: string, payload: unknown): ErrorCode | null {
        const data = (payload ?? {}) as Record<string, unknown>;
        switch (type) {
            case ClientMessage.Action:
                return this.onAction(member, data);
            case ClientMessage.AddBot:
                return this.onAddBot(member, data as ClientPayloads['addBot']);
            case ClientMessage.RemoveBot:
                return this.onRemoveBot(member, data as ClientPayloads['removeBot']);
            case ClientMessage.StartGame:
                return this.onStartGame(member);
            case ClientMessage.Sit:
                return this.onSit(member, data as ClientPayloads['sit']);
            case ClientMessage.StandUp:
                return this.onStandUp(member);
            case ClientMessage.TimeSync:
                if (typeof data.clientTime !== 'number') return ErrorCode.InvalidMessage;
                this.output.send(member.sessionId, ServerMessage.TimeSync, { clientTime: data.clientTime, serverTime: this.scheduler.now() });
                return null;
            default:
                return ErrorCode.InvalidMessage;
        }
    }

    private onAction(member: Member, data: Record<string, unknown>): ErrorCode | null {
        const action = parseAction(data);
        if (!action) return ErrorCode.InvalidMessage;
        if (!this.hand || member.seat === null || !this.state.seats[member.seat].inHand) return ErrorCode.NotInHand;
        if (this.state.turnSeat !== member.seat) return ErrorCode.NotYourTurn;
        return this.applyAction(member.seat, action, false);
    }

    private onAddBot(member: Member, data: ClientPayloads['addBot']): ErrorCode | null {
        if (member.sessionId !== this.state.hostSessionId) return ErrorCode.NotHost;
        if (this.state.phase !== RoomPhase.Lobby) return ErrorCode.InvalidPhase;

        const seat = data.seat === undefined ? this.freeSeat() : validSeat(data.seat);
        if (seat === null) return data.seat === undefined ? ErrorCode.TableFull : ErrorCode.InvalidMessage;
        if (this.state.seats[seat].occupied) return ErrorCode.SeatTaken;

        const seated = this.state.seats.filter((s) => s.occupied);
        const usedNames = new Set(seated.map((s) => s.nickname));
        const names = BOT_NAMES.filter((n) => !usedNames.has(n));
        // 頭像優先挑牌桌上（真人與電腦）還沒有人用的，全部都有人用時才重複
        const usedAvatars = new Set(seated.map((s) => s.avatarId));
        const freshAvatars = DEFAULT_AVATAR_IDS.filter((id) => !usedAvatars.has(id));
        const avatars = freshAvatars.length ? freshAvatars : DEFAULT_AVATAR_IDS;
        this.occupySeat(seat, {
            sessionId: '',
            isBot: true,
            nickname: names[this.rng(names.length)] ?? `Bot ${seat + 1}`,
            avatarId: avatars[this.rng(avatars.length)],
        });
        this.refreshListing();
        return null;
    }

    private onRemoveBot(member: Member, data: ClientPayloads['removeBot']): ErrorCode | null {
        if (member.sessionId !== this.state.hostSessionId) return ErrorCode.NotHost;
        if (this.state.phase !== RoomPhase.Lobby) return ErrorCode.InvalidPhase;
        const seat = validSeat(data.seat);
        if (seat === null || !this.state.seats[seat].isBot) return ErrorCode.InvalidMessage;
        this.clearSeat(seat);
        this.refreshListing();
        return null;
    }

    private onStartGame(member: Member): ErrorCode | null {
        if (member.sessionId !== this.state.hostSessionId) return ErrorCode.NotHost;
        if (this.state.phase !== RoomPhase.Lobby) return ErrorCode.InvalidPhase;
        const seated = this.state.seats.filter((s) => s.occupied);
        if (seated.length < MIN_PLAYERS_TO_START) return ErrorCode.NotEnoughPlayers;

        // 練習房：每次開局所有參賽者籌碼重置
        for (const seat of seated) seat.stack = STARTING_STACK;
        this.state.phase = RoomPhase.Playing;
        this.state.handNumber = 0;
        this.previousButton = null;
        this.refreshListing();
        this.startHand();
        return null;
    }

    private onSit(member: Member, data: ClientPayloads['sit']): ErrorCode | null {
        if (member.seat !== null) return ErrorCode.NotSpectator;
        const seat = data.seat === undefined ? this.freeSeat() : validSeat(data.seat);
        if (seat === null) return data.seat === undefined ? ErrorCode.TableFull : ErrorCode.InvalidMessage;
        if (this.state.seats[seat].occupied) return ErrorCode.SeatTaken;

        member.order = this.orderCounter++;
        this.seatMember(member, seat);
        this.refreshListing();
        return null;
    }

    private onStandUp(member: Member): ErrorCode | null {
        if (member.seat === null) return ErrorCode.NotParticipant;
        this.releaseSeat(member);
        this.afterParticipantChange();
        return null;
    }

    // ================================================================ 座位

    private freeSeat(): number | null {
        const index = this.state.seats.findIndex((s) => !s.occupied);
        return index === -1 ? null : index;
    }

    private seatMember(member: Member, seat: number): void {
        member.seat = seat;
        this.occupySeat(seat, { sessionId: member.sessionId, isBot: false, nickname: member.nickname, avatarId: member.avatarId });
        // 遊戲中坐下：拿到起始籌碼，從下一手開始
        if (this.state.phase === RoomPhase.Playing) {
            this.output.send(member.sessionId, ServerMessage.Notice, { code: NoticeCode.WaitingNextHand });
        }
    }

    private occupySeat(seat: number, who: Pick<SeatData, 'sessionId' | 'isBot' | 'nickname' | 'avatarId'>): void {
        const s = this.state.seats[seat];
        s.occupied = true;
        s.sessionId = who.sessionId;
        s.isBot = who.isBot;
        s.nickname = who.nickname;
        s.avatarId = who.avatarId;
        s.stack = STARTING_STACK;
        s.bet = 0;
        s.inHand = false;
        s.folded = false;
        s.allIn = false;
        s.connected = true;
        s.shownCards.clear();
    }

    private clearSeat(seat: number): void {
        const s = this.state.seats[seat];
        s.occupied = false;
        s.sessionId = '';
        s.isBot = false;
        s.nickname = '';
        s.avatarId = '';
        s.stack = 0;
        s.bet = 0;
        s.inHand = false;
        s.folded = false;
        s.allIn = false;
        s.connected = true;
        s.shownCards.clear();
        this.vacateAfterHand.delete(seat);
    }

    /** 參賽者離開座位（離桌或改為觀戰）：牌局中視為棄牌，座位等這手牌結束才清空 */
    private releaseSeat(member: Member): void {
        const seat = member.seat!;
        member.seat = null;

        const s = this.state.seats[seat];
        if (this.hand && s.inHand) {
            s.sessionId = '';
            s.connected = false;
            this.vacateAfterHand.add(seat);
            this.forceFold(seat);
        } else {
            this.clearSeat(seat);
        }
    }

    private get humanParticipants(): Member[] {
        return [...this.members.values()].filter((m) => m.seat !== null).sort((a, b) => a.order - b.order);
    }

    /** 參賽者變動後：轉移房主、檢查是否解散、更新列表 */
    private afterParticipantChange(): void {
        if (this.disposed) return;
        const participants = this.humanParticipants;
        if (participants.length === 0) {
            this.dissolve();
            return;
        }

        const host = this.members.get(this.state.hostSessionId);
        if (!host || host.seat === null) {
            const next = participants[0];
            this.state.hostSessionId = next.sessionId;
            this.output.broadcast(ServerMessage.Notice, { code: NoticeCode.HostChanged, nickname: next.nickname });
        }
        this.refreshListing();
    }

    private rebind(member: Member, sessionId: string): void {
        this.members.delete(member.sessionId);
        if (this.state.hostSessionId === member.sessionId) this.state.hostSessionId = sessionId;
        member.sessionId = sessionId;
        member.connected = true;
        this.members.set(sessionId, member);
        if (member.seat !== null) {
            this.state.seats[member.seat].sessionId = sessionId;
            this.state.seats[member.seat].connected = true;
        }
        this.resendPrivateState(member);
    }

    private resendPrivateState(member: Member): void {
        if (member.seat === null || !this.hand || !this.state.seats[member.seat].inHand) return;
        const cards = this.hand.holeCards(member.seat);
        if (cards) this.output.send(member.sessionId, ServerMessage.HoleCards, { handNumber: this.state.handNumber, cards: [...cards] });
        if (this.state.turnSeat === member.seat) this.sendYourTurn(member.seat);
    }

    private refreshListing(): void {
        const host = this.members.get(this.state.hostSessionId);
        const members = [...this.members.values()];
        this.state.spectatorCount = members.filter((m) => m.seat === null).length;
        this.output.updateListing({
            hostNickname: host?.nickname ?? '',
            phase: this.state.phase as RoomPhase,
            players: this.state.seats.filter((s) => s.occupied).length,
            maxPlayers: MAX_SEATS,
            spectators: this.state.spectatorCount,
        });
    }

    private dissolve(): void {
        this.output.broadcast(ServerMessage.Notice, { code: NoticeCode.RoomDissolved });
        this.dispose();
        this.output.dissolve();
    }

    dispose(): void {
        this.disposed = true;
        for (const timer of [this.pumpTimer, this.turnTimer, this.botTimer, this.stageTimer]) timer?.clear();
        this.pumpTimer = this.turnTimer = this.botTimer = this.stageTimer = null;
        this.queue.length = 0;
    }

    // ================================================================ 牌局

    private startHand(): void {
        if (this.disposed) return;
        const playable = this.state.seats
            .map((s, seat) => ({ s, seat }))
            .filter(({ s, seat }) => s.occupied && s.stack > 0 && !this.vacateAfterHand.has(seat));

        if (playable.length < 2) {
            this.endGame();
            return;
        }

        const seats = playable.map(({ seat }) => seat);
        const button = nextButton(seats, this.previousButton, this.rng);
        this.previousButton = button;

        this.state.handNumber++;
        this.state.board.clear();
        this.state.pots.clear();
        this.state.currentBet = 0;
        this.state.street = 'preflop';
        for (const [seat, s] of this.state.seats.entries()) {
            s.inHand = seats.includes(seat);
            s.folded = false;
            s.allIn = false;
            s.bet = 0;
            s.shownCards.clear();
        }

        this.hand = new HandController({
            seats: playable.map(({ s, seat }) => ({ seat, stack: s.stack })),
            button,
            smallBlind: SMALL_BLIND,
            bigBlind: BIG_BLIND,
            deck: this.createDeck(),
        });
        this.enqueue(this.hand.start(), false);
    }

    private applyAction(seat: number, action: PlayerAction, timedOut: boolean): ErrorCode | null {
        const result = this.hand!.act(seat, action);
        if (!result.ok) return result.error;
        this.endTurn();
        this.enqueue(result.events, timedOut);
        return null;
    }

    private forceFold(seat: number): void {
        if (!this.hand) return;
        if (this.state.turnSeat === seat) this.endTurn();
        this.enqueue(this.hand.forceFold(seat), false);
    }

    private endTurn(): void {
        this.turnTimer?.clear();
        this.botTimer?.clear();
        this.turnTimer = this.botTimer = null;
        this.state.turnSeat = -1;
        this.state.turnDeadline = 0;
    }

    /** 排入事件並依序播放；播放期間不接受玩家動作（turnSeat 為 -1） */
    private enqueue(events: HandEvent[], timedOut: boolean): void {
        for (const event of events) this.queue.push({ event, timedOut: timedOut && event.type === 'playerActed' });
        if (!this.pumpTimer) this.pump();
    }

    private pump(): void {
        this.pumpTimer = null;
        while (this.queue.length && !this.disposed) {
            const { event, timedOut } = this.queue.shift()!;

            if (event.type === 'actionRequired') {
                // 強制棄牌可能讓同一位玩家重複出現 actionRequired，只處理最新且尚未開始的那一個
                const superseded = this.queue.some((q) => q.event.type === 'actionRequired');
                if (superseded || this.hand?.actorSeat !== event.seat || this.state.turnSeat === event.seat) continue;
            }

            this.applyEvent(event);
            this.output.broadcast(ServerMessage.HandEvent, { ...event, handNumber: this.state.handNumber, ...(timedOut ? { timedOut } : {}) });

            if (event.type === 'actionRequired') this.beginTurn(event.seat);
            if (event.type === 'handEnded') {
                this.stageTimer = this.scheduler.setTimeout(() => this.finishHand(), this.pacing.handEnded);
                return;
            }

            const delay = this.pacing[event.type];
            if (delay > 0 && this.queue.length) {
                this.pumpTimer = this.scheduler.setTimeout(() => this.pump(), delay);
                return;
            }
        }
    }

    private applyEvent(event: HandEvent): void {
        const seats = this.state.seats;
        switch (event.type) {
            case 'handStarted':
                this.state.buttonSeat = event.button;
                this.state.smallBlindSeat = event.smallBlindSeat;
                this.state.bigBlindSeat = event.bigBlindSeat;
                break;
            case 'blindPosted':
                seats[event.seat].stack -= event.amount;
                seats[event.seat].bet += event.amount;
                seats[event.seat].allIn = event.allIn;
                this.state.currentBet = Math.max(this.state.currentBet, BIG_BLIND);
                break;
            case 'holeCardsDealt':
                for (const seat of event.order) {
                    const sessionId = seats[seat].sessionId;
                    const cards = this.hand!.holeCards(seat);
                    if (sessionId && cards) {
                        this.output.send(sessionId, ServerMessage.HoleCards, { handNumber: this.state.handNumber, cards: [...cards] });
                    }
                }
                break;
            case 'playerActed':
                seats[event.seat].stack = event.stack;
                seats[event.seat].bet = event.committed;
                seats[event.seat].allIn = event.allIn;
                if (event.kind === 'fold') seats[event.seat].folded = true;
                this.state.currentBet = Math.max(this.state.currentBet, event.committed);
                break;
            case 'uncalledReturned':
                seats[event.seat].stack += event.amount;
                seats[event.seat].bet -= event.amount;
                if (seats[event.seat].stack > 0) seats[event.seat].allIn = false;
                break;
            case 'betsCollected':
                for (const s of seats) s.bet = 0;
                this.state.pots.clear();
                this.state.pots.push(...event.pots);
                this.state.currentBet = 0;
                break;
            case 'boardDealt':
                this.state.board.push(...event.cards);
                this.state.street = event.street;
                this.state.currentBet = 0;
                break;
            case 'handsRevealed':
                for (const { seat, cards } of event.hands) {
                    seats[seat].shownCards.clear();
                    seats[seat].shownCards.push(...cards);
                }
                break;
            case 'potAwarded':
                for (const { seat, amount } of event.winners) seats[seat].stack += amount;
                if (event.potIndex < this.state.pots.length) this.state.pots[event.potIndex] = 0;
                break;
            case 'handEnded':
                // 以引擎的最終結果為準，避免逐步套用時的任何誤差
                for (const p of this.hand!.playerStates) seats[p.seat].stack = p.stack;
                this.state.pots.clear();
                this.state.street = '';
                break;
        }
    }

    private beginTurn(seat: number): void {
        this.state.turnSeat = seat;
        this.state.turnDeadline = this.scheduler.now() + this.actionTimeoutMs;
        this.turnTimer = this.scheduler.setTimeout(() => this.onTurnTimeout(seat), this.actionTimeoutMs);

        const s = this.state.seats[seat];
        if (s.isBot) {
            const [min, max] = this.botThinkMs;
            this.botTimer = this.scheduler.setTimeout(() => this.botAct(seat), min + this.rng(Math.max(1, max - min + 1)));
        } else {
            this.sendYourTurn(seat);
        }
    }

    private sendYourTurn(seat: number): void {
        const sessionId = this.state.seats[seat].sessionId;
        const legal = this.hand?.legalActions(seat);
        if (sessionId && legal) this.output.send(sessionId, ServerMessage.YourTurn, { legal, deadline: this.state.turnDeadline });
    }

    private onTurnTimeout(seat: number): void {
        this.turnTimer = null;
        if (!this.hand || this.state.turnSeat !== seat) return;
        this.applyAction(seat, this.hand.timeoutAction(), true);
    }

    private botAct(seat: number): void {
        this.botTimer = null;
        const hand = this.hand;
        if (!hand || this.state.turnSeat !== seat) return;
        const legal = hand.legalActions(seat);
        if (!legal) return;

        const table = hand.playerStates;
        const action = decideBotAction(
            {
                hole: hand.holeCards(seat)!,
                board: hand.communityCards,
                legal,
                pot: hand.potAmounts.reduce((a, b) => a + b, 0) + table.reduce((sum, p) => sum + p.committed, 0),
                currentBet: hand.currentBet,
                opponents: table.filter((p) => p.seat !== seat && !p.folded).length,
                bigBlind: BIG_BLIND,
            },
            this.rng,
        );
        // 決策一定合法；保險起見失敗時改用逾時預設動作
        if (this.applyAction(seat, action, false)) this.applyAction(seat, hand.timeoutAction(), false);
    }

    /** 一手牌結束：處理離桌與輸光的玩家，再決定開下一手或結束比賽 */
    private finishHand(): void {
        this.stageTimer = null;
        if (this.disposed) return;
        this.hand = null;

        for (const seat of this.vacateAfterHand) this.clearSeat(seat);
        this.vacateAfterHand.clear();

        for (const [seat, s] of this.state.seats.entries()) {
            s.inHand = false;
            if (!s.occupied || s.stack > 0) continue;
            if (s.isBot) {
                this.output.broadcast(ServerMessage.Notice, { code: NoticeCode.BotBusted, nickname: s.nickname });
                this.clearSeat(seat);
            } else {
                const member = this.members.get(s.sessionId);
                if (member) {
                    member.seat = null;
                    this.output.send(member.sessionId, ServerMessage.Notice, { code: NoticeCode.Eliminated });
                }
                this.clearSeat(seat);
            }
        }

        this.afterParticipantChange();
        if (this.disposed) return;

        const withChips = this.state.seats.filter((s) => s.occupied && s.stack > 0);
        if (withChips.length < 2) {
            this.endGame();
            return;
        }
        this.stageTimer = this.scheduler.setTimeout(() => this.startHand(), this.pacing.nextHand);
    }

    private endGame(): void {
        this.hand = null;
        const winnerSeat = this.state.seats.findIndex((s) => s.occupied && s.stack > 0);
        this.output.broadcast(ServerMessage.GameOver, {
            winnerSeat,
            nickname: winnerSeat >= 0 ? this.state.seats[winnerSeat].nickname : '',
        });

        this.stageTimer = this.scheduler.setTimeout(() => {
            this.stageTimer = null;
            this.state.phase = RoomPhase.Lobby;
            this.state.street = '';
            this.state.buttonSeat = this.state.smallBlindSeat = this.state.bigBlindSeat = -1;
            this.state.board.clear();
            this.state.pots.clear();
            for (const s of this.state.seats) {
                s.inHand = s.folded = s.allIn = false;
                s.bet = 0;
                s.shownCards.clear();
            }
            this.refreshListing();
        }, this.pacing.gameOver);
    }
}

function validSeat(value: unknown): number | null {
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_SEATS ? (value as number) : null;
}

function parseAction(data: Record<string, unknown>): PlayerAction | null {
    switch (data.type) {
        case ActionType.Fold:
        case ActionType.Check:
        case ActionType.Call:
        case ActionType.AllIn:
            return { type: data.type };
        case ActionType.Raise:
            return typeof data.amount === 'number' ? { type: ActionType.Raise, amount: data.amount } : null;
        default:
            return null;
    }
}
