// 把背景音樂重新壓縮成較低的位元率，縮短 Web 版下載時間。
//
//   pnpm compress:bgm                  壓縮 resources/audio/bgm 底下位元率高於目標的 mp3
//   pnpm compress:bgm --bitrate 112    指定目標位元率（kbps，預設 96）
//
// 原地覆寫檔案（.meta 的 uuid 不變，場景與程式的引用不受影響），已在目標位元率以下的檔案略過，
// 因此重複執行不會一再劣化音質。替換 BGM 時，壓縮前請先保留原始檔。
import { spawnSync } from 'node:child_process';
import { readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { CLIENT_DIR, fail, info, parseArgs, run, success } from './lib/common.mjs';

const BGM_DIR = path.join(CLIENT_DIR, 'assets', 'resources', 'audio', 'bgm');
// 位元率在目標的這個範圍內就視為已壓縮過（VBR 與標頭會讓量到的值略有出入）
const TOLERANCE_KBPS = 8;

const { values } = parseArgs();
const target = Number(values.bitrate ?? 96);
if (!Number.isInteger(target) || target < 32 || target > 320) fail(`位元率需為 32～320 的整數：${values.bitrate}`);
if (!ffmpeg) fail('找不到 ffmpeg-static 的執行檔，請重新執行 pnpm install');

/** 由 ffmpeg -i 的輸出讀取整體平均位元率（kbps） */
function bitrateOf(file) {
    // 沒有指定輸出檔時 ffmpeg 會以 exit code 1 結束，檔案資訊印在 stderr
    const { stderr } = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
    const match = stderr?.match(/bitrate: (\d+) kb\/s/);
    return match ? Number(match[1]) : null;
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
let before = 0;
let after = 0;

for (const name of readdirSync(BGM_DIR).filter((f) => f.endsWith('.mp3'))) {
    const file = path.join(BGM_DIR, name);
    const size = statSync(file).size;
    const bitrate = bitrateOf(file);
    if (bitrate === null) fail(`無法讀取位元率：${name}`);
    before += size;
    if (bitrate <= target + TOLERANCE_KBPS) {
        info(`${name}：${bitrate} kbps，已在目標以下，略過`);
        after += size;
        continue;
    }

    const tmp = `${file}.tmp.mp3`;
    // 固定位元率、44.1 kHz 立體聲；去掉 ID3 等中繼資料
    const code = run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', file,
        '-map_metadata', '-1', '-vn',
        '-codec:a', 'libmp3lame', '-b:a', `${target}k`, '-ar', '44100', '-ac', '2',
        tmp,
    ]);
    if (code !== 0) fail(`壓縮失敗：${name}`);
    renameSync(tmp, file);
    const newSize = statSync(file).size;
    after += newSize;
    success(`${name}：${bitrate} → ${target} kbps，${kb(size)} → ${kb(newSize)}`);
}

info(`合計 ${kb(before)} → ${kb(after)}`);
