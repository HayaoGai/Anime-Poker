import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../../client/assets/scripts/i18n/locales/en';
import { zhHans } from '../../client/assets/scripts/i18n/locales/zhHans';
import { zhHant } from '../../client/assets/scripts/i18n/locales/zhHant';

// tools/gen-fonts 產生的字型子集必須收錄所有語系文字，否則缺字會改用系統字型而粗細不一。
// 介面字型（_ui）是進入標題畫面前唯一載入的字型，同樣要收錄所有語系文字
type FontKey = 'tw' | 'cn' | 'tw_ui' | 'cn_ui';
const coverage = JSON.parse(readFileSync(new URL('../../tools/gen-fonts/coverage.json', import.meta.url), 'utf8')) as Record<FontKey, string>;

function missing(table: Record<string, string>, font: FontKey): string {
    const covered = new Set(coverage[font]);
    const chars = new Set([...Object.values(table).join('')].filter((c) => c.codePointAt(0)! > 0x7f));
    return [...chars].filter((c) => !covered.has(c)).join('');
}

describe('內建字型', () => {
    it.each([
        ['繁體中文', zhHant, 'tw'],
        ['English', en, 'tw'],
        ['简体中文', zhHans, 'cn'],
    ] as const)('%s 的文字都已收錄（缺字時請執行 pnpm gen:fonts）', (_name, table, font) => {
        expect(missing(table, font)).toBe('');
        expect(missing(table, `${font}_ui`)).toBe('');
    });
});
