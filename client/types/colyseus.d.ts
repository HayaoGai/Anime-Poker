/**
 * Colyseus SDK（assets/plugins/colyseus.js，以外掛腳本載入為全域 Colyseus）的型別宣告。
 * 只宣告客戶端用到的部分；版本見 tools/sync-vendor.mjs。
 */
declare namespace Colyseus {
    /** SDK 的事件 signal：直接呼叫即註冊，另有 once / remove / clear */
    interface Signal<T extends (...args: any[]) => void> {
        (callback: T): void;
        once(callback: T): void;
        remove(callback: T): void;
        clear(): void;
    }

    interface ReconnectionOptions {
        enabled: boolean;
        maxRetries: number;
        minDelay: number;
        maxDelay: number;
        isReconnecting: boolean;
    }

    interface EndpointSettings {
        hostname: string;
        secure: boolean;
        port?: number;
        pathname?: string;
    }

    interface RoomAvailable<Metadata = any> {
        roomId: string;
        name: string;
        clients: number;
        maxClients: number;
        metadata?: Metadata;
    }

    class Room<State = any> {
        roomId: string;
        sessionId: string;
        reconnectionToken: string;
        name: string;
        readonly state: State;
        reconnection: ReconnectionOptions;

        onStateChange: Signal<(state: State) => void>;
        onError: Signal<(code: number, message?: string) => void>;
        onLeave: Signal<(code: number, reason?: string) => void>;
        /** 非自願斷線，SDK 開始自動重連 */
        onDrop: Signal<(code: number, reason?: string) => void>;
        onReconnect: Signal<() => void>;

        onMessage<T = any>(type: string | number, callback: (payload: T) => void): () => void;
        onMessage(type: '*', callback: (type: string | number, payload: any) => void): () => void;
        send(type: string | number, payload?: unknown): void;
        leave(consented?: boolean): Promise<number>;
        removeAllListeners(): void;
    }

    class Client {
        constructor(endpoint: string | EndpointSettings);
        joinOrCreate<State = any>(roomName: string, options?: object): Promise<Room<State>>;
        create<State = any>(roomName: string, options?: object): Promise<Room<State>>;
        join<State = any>(roomName: string, options?: object): Promise<Room<State>>;
        joinById<State = any>(roomId: string, options?: object): Promise<Room<State>>;
        reconnect<State = any>(reconnectionToken: string): Promise<Room<State>>;
    }

    class ServerError extends Error {
        code: number;
    }

    class MatchMakeError extends Error {
        code: number;
    }
}
