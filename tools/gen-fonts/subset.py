"""
產生遊戲內文字用的字型子集（Resource Han Rounded，SIL OFL 1.1）。

    pnpm gen:fonts <字型資料夾>

字型資料夾需包含 ResourceHanRoundedTW-Medium.ttf 與 ResourceHanRoundedCN-Medium.ttf，
下載自 https://github.com/CyanoHao/Resource-Han-Rounded/releases/tag/v0.990（RHR-TW、RHR-CN）。
需要 Python 3 與 fontTools（pip install fonttools）。

系統字型（Arial）沒有中文字，瀏覽器會逐字改用其他字型，部分字沒有粗體而粗細不一，
因此改為內建字型：簡體用 CN 字形、繁體與英文用 TW 字形。收錄的字：
  - ASCII、常用全形標點
  - 客戶端程式與場景產生器裡出現的所有字（含三個語系的文字）
  - 常用字：GB2312 一級字（3755 字）與 Big5 常用字（5401 字），涵蓋大部分暱稱
TW 版本沒有的字（簡體字）從 CN 版本補入，繁體介面下的簡體暱稱也能以同一字型顯示。
修改語系文字後請重新執行；server/test 會檢查語系文字是否都已收錄。
"""

import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'client' / 'assets' / 'resources' / 'fonts'
COVERAGE_FILE = Path(__file__).resolve().parent / 'coverage.json'
# 檔名（不含副檔名）即 Cocos 的字型名稱；donor：缺字時補字的來源
FONTS = {
    'tw': {'file': 'ResourceHanRoundedTW-Medium.ttf', 'donor': 'cn'},
    'cn': {'file': 'ResourceHanRoundedCN-Medium.ttf', 'donor': None},
}
SOURCE_GLOBS = [('client/assets/scripts', '*.ts'), ('tools/gen-scenes', '*.mjs')]
PUNCTUATION = '，。、！？：；「」『』（）《》〈〉…・—～＋－％＄＃＆＊　'


def gb2312_level1() -> set[str]:
    chars = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return chars


def big5_common() -> set[str]:
    chars = set()
    for hi in range(0xA4, 0xC7):
        for lo in [*range(0x40, 0x7F), *range(0xA1, 0xFF)]:
            if hi == 0xC6 and lo > 0x7E:
                break
            try:
                chars.add(bytes([hi, lo]).decode('big5'))
            except UnicodeDecodeError:
                pass
    return chars


def source_chars() -> set[str]:
    chars = set()
    for folder, pattern in SOURCE_GLOBS:
        for file in (ROOT / folder).rglob(pattern):
            chars.update(c for c in file.read_text(encoding='utf-8') if ord(c) > 0x7F)
    return chars


def make_subset(font: TTFont, unicodes: list[int], layout: bool) -> None:
    options = subset.Options()
    options.layout_features = ['*'] if layout else []
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.hinting = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)


def add_glyphs(base: TTFont, donor: TTFont) -> None:
    """把 donor 的字（不含 .notdef）加入 base；兩者同為 glyf 輪廓、UPM 相同且沒有複合字"""
    donor_cmap = donor.getBestCmap()
    renamed = {name: f'donor.{name}' for name in donor.getGlyphOrder() if name != '.notdef'}
    order = base.getGlyphOrder() + list(renamed.values())
    for old, new in renamed.items():
        base['glyf'].glyphs[new] = donor['glyf'][old]
        base['hmtx'].metrics[new] = donor['hmtx'].metrics[old]
        if 'vmtx' in base and 'vmtx' in donor:
            base['vmtx'].metrics[new] = donor['vmtx'].metrics[old]
    base.setGlyphOrder(order)
    base['glyf'].glyphOrder = order
    for table in base['cmap'].tables:
        for code, name in donor_cmap.items():
            if name in renamed and (table.format != 4 or code <= 0xFFFF):
                table.cmap[code] = renamed[name]


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit('用法：pnpm gen:fonts <字型資料夾>')
    source_dir = Path(sys.argv[1])
    wanted = {chr(c) for c in range(0x20, 0x7F)} | set(PUNCTUATION) | source_chars() | gb2312_level1() | big5_common()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    coverage = {}
    for name, info in FONTS.items():
        font = TTFont(source_dir / info['file'])
        available = font.getBestCmap()
        make_subset(font, sorted(ord(c) for c in wanted if ord(c) in available), layout=True)

        if info['donor']:
            donor = TTFont(source_dir / FONTS[info['donor']]['file'])
            donor_available = donor.getBestCmap()
            missing = sorted(ord(c) for c in wanted if ord(c) not in available and ord(c) in donor_available)
            if missing:
                make_subset(donor, missing, layout=False)
                add_glyphs(font, donor)
                print(f'  rounded_{name} 從 rounded_{info["donor"]} 補入 {len(missing)} 字')

        out = OUT_DIR / f'rounded_{name}.ttf'
        font.save(out)
        unicodes = sorted(TTFont(out).getBestCmap())
        coverage[name] = ''.join(chr(u) for u in unicodes if u > 0x7F)
        print(f'{out.relative_to(ROOT)}：{len(unicodes)} 字，{out.stat().st_size / 1024 / 1024:.1f} MB')

    COVERAGE_FILE.write_text(json.dumps(coverage, ensure_ascii=False, indent=0) + '\n', encoding='utf-8', newline='\n')
    print(f'{COVERAGE_FILE.relative_to(ROOT)}：收錄字清單（供測試檢查）')


if __name__ == '__main__':
    main()
