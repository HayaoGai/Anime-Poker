import { describe, expect, it, vi } from 'vitest';
import { computed, Observable } from '../../client/assets/scripts/core/Observable';
import { DisposeBag } from '../../client/assets/scripts/core/ViewModel';
import { resolveLanguage } from '../../client/assets/scripts/i18n/language';
import { TimeSync } from '../../client/assets/scripts/net/TimeSync';

// 客戶端中不依賴 Cocos 引擎的純邏輯模組

describe('Observable', () => {
    it('訂閱時立即收到目前值，值改變時通知新舊值', () => {
        const value = new Observable(1);
        const listener = vi.fn();
        value.subscribe(listener);
        value.value = 2;
        expect(listener.mock.calls).toEqual([[1, 1], [2, 1]]);
    });

    it('相同的值不重複通知；取消訂閱後不再收到', () => {
        const value = new Observable('a');
        const listener = vi.fn();
        const unsubscribe = value.subscribe(listener, false);
        value.value = 'a';
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
        value.value = 'b';
        expect(listener).not.toHaveBeenCalled();
    });

    it('notify 可在物件內容改變時手動通知', () => {
        const list = new Observable<number[]>([]);
        const listener = vi.fn();
        list.subscribe(listener, false);
        list.value.push(1);
        list.notify();
        expect(listener).toHaveBeenCalledWith([1], [1]);
    });

    it('回呼中取消訂閱不影響同一輪的其他訂閱者', () => {
        const value = new Observable(0);
        const second = vi.fn();
        const unsubscribe = value.subscribe(() => unsubscribe(), false);
        value.subscribe(second, false);
        value.value = 1;
        expect(second).toHaveBeenCalledOnce();
    });
});

describe('computed', () => {
    it('任一來源改變時重新計算，dispose 後停止', () => {
        const a = new Observable(1);
        const b = new Observable(2);
        const sum = computed([a, b], () => a.value + b.value);
        expect(sum.value).toBe(3);
        a.value = 10;
        expect(sum.value).toBe(12);
        sum.dispose();
        b.value = 100;
        expect(sum.value).toBe(12);
    });
});

describe('DisposeBag', () => {
    it('依建立的相反順序釋放', () => {
        const order: number[] = [];
        const bag = new DisposeBag();
        bag.add(() => order.push(1));
        bag.add({ dispose: () => order.push(2) });
        bag.dispose();
        bag.dispose();
        expect(order).toEqual([2, 1]);
    });
});

describe('resolveLanguage', () => {
    it.each([
        [['zh-TW'], 'zh-Hant'],
        [['zh-hk'], 'zh-Hant'],
        [['zh_MO'], 'zh-Hant'],
        [['zh-Hant-TW'], 'zh-Hant'],
        [['zh-CN'], 'zh-Hans'],
        [['zh-Hans'], 'zh-Hans'],
        [['zh'], 'zh-Hans'],
        [['ja-JP', 'zh-TW'], 'en'],
        [[undefined, '', 'zh-tw'], 'zh-Hant'],
        [['en-US'], 'en'],
        [[], 'en'],
    ] as const)('%j → %s', (codes, expected) => {
        expect(resolveLanguage(codes)).toBe(expected);
    });
});

describe('TimeSync', () => {
    it('以往返延遲最短的樣本估算伺服器時間差', () => {
        const sync = new TimeSync();
        expect(sync.serverNow(1000)).toBe(1000);

        // 伺服器比本機快 5000ms：延遲 200ms 的樣本誤差較大，延遲 20ms 的較準
        sync.addSample(0, 5150, 200);
        sync.addSample(1000, 6010, 1020);
        expect(sync.offset).toBe(5000);
        expect(sync.serverNow(2000)).toBe(7000);
        expect(sync.remaining(7500, 2000)).toBe(500);
        expect(sync.remaining(6000, 2000)).toBe(0);
    });

    it('只保留最近的樣本', () => {
        const sync = new TimeSync(2);
        sync.addSample(0, 100, 0); // rtt 0、offset 100：最準，但會被擠出
        sync.addSample(0, 200, 10); // rtt 10、offset 195
        sync.addSample(0, 300, 10); // rtt 10、offset 295
        // 延遲 0 的樣本已移除（否則結果會是 100）；剩下的延遲相同時取較早者
        expect(sync.offset).toBe(195);
    });
});
