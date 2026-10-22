/**
 * MVVM 的資料綁定核心：可觀察的值。
 * ViewModel 以 Observable 對外提供 UI 需要的資料，View 訂閱後在值改變時更新畫面。
 */

export type Listener<T> = (value: T, previous: T) => void;
export type Unsubscribe = () => void;

export interface ReadonlyObservable<T> {
    readonly value: T;
    /** @param immediate 是否立即以目前的值呼叫一次（預設 true，方便初始化畫面） */
    subscribe(listener: Listener<T>, immediate?: boolean): Unsubscribe;
}

export class Observable<T> implements ReadonlyObservable<T> {
    private current: T;
    private readonly listeners = new Set<Listener<T>>();

    constructor(initial: T) {
        this.current = initial;
    }

    get value(): T {
        return this.current;
    }

    set value(next: T) {
        if (Object.is(next, this.current)) return;
        const previous = this.current;
        this.current = next;
        this.emit(previous);
    }

    /** 物件或陣列內容被修改、但參考不變時，手動通知訂閱者 */
    notify(): void {
        this.emit(this.current);
    }

    subscribe(listener: Listener<T>, immediate = true): Unsubscribe {
        this.listeners.add(listener);
        if (immediate) listener(this.current, this.current);
        return () => this.listeners.delete(listener);
    }

    private emit(previous: T): void {
        // 複製一份，避免回呼中訂閱或取消訂閱影響本次迭代
        for (const listener of [...this.listeners]) listener(this.current, previous);
    }
}

/** 由其他 Observable 推導出的唯讀值；任一來源改變時重新計算 */
export class Computed<T> implements ReadonlyObservable<T> {
    private readonly inner: Observable<T>;
    private readonly unsubscribes: Unsubscribe[];

    constructor(sources: ReadonlyObservable<unknown>[], compute: () => T) {
        this.inner = new Observable(compute());
        this.unsubscribes = sources.map((s) => s.subscribe(() => (this.inner.value = compute()), false));
    }

    get value(): T {
        return this.inner.value;
    }

    subscribe(listener: Listener<T>, immediate = true): Unsubscribe {
        return this.inner.subscribe(listener, immediate);
    }

    dispose(): void {
        for (const unsubscribe of this.unsubscribes) unsubscribe();
    }
}

export function computed<T>(sources: ReadonlyObservable<unknown>[], compute: () => T): Computed<T> {
    return new Computed(sources, compute);
}
