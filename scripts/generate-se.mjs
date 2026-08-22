// 効果音(SE)の手続き的生成スクリプト(Phase10/P10-4-1で新設、P10-4-2/P10-4-3で拡張)。
//
// 目的: 「出所不明の音源は使わない」方針のもと、高頻度SE(dice_roll/step_move/roulette_tick)、
// money_gain/money_loss、card_get/card_use/property_buy、monopoly_group/monopoly_region、
// destination_arrive/destination_revealを、外部素材に一切依存せずこのスクリプトだけで
// 再現可能な形で生成する。波形合成(矩形波/三角波+ホワイトノイズ、線形アタック+指数ディケイの
// エンベロープ、複数音を重ねる和音合成)のみで、外部ライブラリ・サンプル音源は使用していない。
// ライセンス上の扱いは public/sounds/LICENSES.md を参照(自作・パラメータ手続き生成のため
// 権利上の懸念なし)。
//
// 実行方法: `node scripts/generate-se.mjs`
// 出力: public/sounds/{dice_roll,step_move,roulette_tick,money_gain,money_loss,
//        card_get,card_use,property_buy,monopoly_group,monopoly_region,
//        destination_arrive,destination_reveal}.wav (44.1kHz, 16bit, mono PCM WAV)
//
// 各音のパラメータは下部のSOUND_DEFS内にすべて記述している。生成方式を変えずに音を調整したい
// 場合は、このファイルの数値(周波数/尺/音量/減衰)だけを編集して再実行すればよい。
// P10-4-1/P10-4-2で作成した既存8音の定義・生成コードは今回も一切変更していない
// (再実行してもバイト単位で同一の出力になることをP10-4-3でもSHA256ハッシュ比較により確認済み)。
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "sounds");
const SAMPLE_RATE = 44100;

function samplesFor(durationMs) {
  return Math.max(1, Math.round((SAMPLE_RATE * durationMs) / 1000));
}

// 波形: phase(0-1未満)を受け取り[-1,1]を返す純関数。
const WAVE = {
  square: (phase) => (phase < 0.5 ? 1 : -1),
  triangle: (phase) => (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase),
};

/**
 * 決定論的な擬似乱数(mulberry32)。Math.random()を使わないことで、同じパラメータなら
 * 常にバイト単位で同一のWAVが再生成される(再現性の担保)。
 */
function makePrng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 単音を生成する。freqStart→freqEnd を尺全体で線形に滑らせ(スイープ)、
 * アタック(attackMs、線形)→指数ディケイ(decayExp、大きいほど早く減衰)の
 * エンベロープを掛ける。8bit風の軽さを出すため矩形波/三角波のみを使う。
 */
function renderTone({ waveform, freqStart, freqEnd = freqStart, durationMs, peak, attackMs = 1, decayExp }) {
  const n = samplesFor(durationMs);
  const out = new Float32Array(n);
  const wave = WAVE[waveform];
  const attackSamples = samplesFor(attackMs);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    const freq = freqStart + (freqEnd - freqStart) * frac;
    phase += freq / SAMPLE_RATE;
    phase -= Math.floor(phase);
    const attackEnv = i < attackSamples ? i / attackSamples : 1;
    const decayEnv = Math.exp(-decayExp * frac);
    out[i] = wave(phase) * peak * attackEnv * decayEnv;
  }
  return out;
}

/** ホワイトノイズ(擬似乱数+指数ディケイ)。ダイスの「カラッ」という質感の onset にだけ使う。 */
function renderNoise({ durationMs, peak, decayExp, seed = 1 }) {
  const n = samplesFor(durationMs);
  const out = new Float32Array(n);
  const rand = makePrng(seed);
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    const decayEnv = Math.exp(-decayExp * frac);
    out[i] = (rand() * 2 - 1) * peak * decayEnv;
  }
  return out;
}

function silence(durationMs) {
  return new Float32Array(samplesFor(durationMs));
}

function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * 複数の音を同時に重ねて和音を作る(Phase10/P10-4-3、monopoly_regionのフィナーレ和音用に追加)。
 * 長さが異なる場合は短い方を末尾無音として扱い(加算しないだけで自動的にそうなる)、
 * 単純にサンプルごと加算するだけの純関数。クリッピングしないよう合成後の振幅が概ね[-1,1]に
 * 収まるかは呼び出し側で各音のpeakを調整して担保する(writeWav()側の最終クランプは保険)。
 */
function mix(parts) {
  const maxLen = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(maxLen);
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      out[i] += p[i];
    }
  }
  return out;
}

/** 16bit PCM モノラルWAVとして書き出す。samplesは[-1,1]のFloat32Array。 */
function writeWav(filePath, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate (mono, 16bit)
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(filePath, buffer);
  return buffer.length;
}

// --- 各SEの定義 ------------------------------------------------------------
// 方向性(ユーザー指定): 明るい・軽い・コミカル・少しレトロゲーム感。
// roulette_tickは最短約30ms間隔で再トリガーされるため、それ自体を30ms以内に収める
// (soundManager.tsは1id=1つのHTMLAudioElementを使い回し、currentTime=0;play()で頭出しする
// 実装のため、尺が短いほど「頭から鳴り直す」ときの違和感が出ない)。
// step_moveは460ms間隔で1ターンに最大12回程度繰り返されるため、軽い三角波+低めの音量にする。
const SOUND_DEFS = {
  roulette_tick: () =>
    renderTone({ waveform: "square", freqStart: 1800, durationMs: 26, peak: 0.32, attackMs: 0.5, decayExp: 9 }),

  step_move: () =>
    renderTone({ waveform: "triangle", freqStart: 520, freqEnd: 360, durationMs: 70, peak: 0.28, attackMs: 1, decayExp: 5 }),

  dice_roll: () =>
    concat([
      renderTone({ waveform: "square", freqStart: 300, durationMs: 35, peak: 0.4, attackMs: 1, decayExp: 6 }),
      silence(15),
      renderTone({ waveform: "square", freqStart: 420, durationMs: 32, peak: 0.4, attackMs: 1, decayExp: 6 }),
      silence(12),
      renderTone({ waveform: "square", freqStart: 340, durationMs: 35, peak: 0.42, attackMs: 1, decayExp: 6 }),
      silence(10),
      renderTone({ waveform: "square", freqStart: 460, durationMs: 32, peak: 0.42, attackMs: 1, decayExp: 6 }),
      silence(8),
      renderTone({ waveform: "square", freqStart: 600, durationMs: 45, peak: 0.45, attackMs: 1, decayExp: 3.5 }),
    ]),

  money_gain: () =>
    concat([
      renderTone({ waveform: "square", freqStart: 523.25, durationMs: 70, peak: 0.4, attackMs: 1, decayExp: 4 }), // C5
      silence(5),
      renderTone({ waveform: "square", freqStart: 659.25, durationMs: 70, peak: 0.4, attackMs: 1, decayExp: 4 }), // E5
      silence(5),
      renderTone({ waveform: "square", freqStart: 783.99, durationMs: 70, peak: 0.42, attackMs: 1, decayExp: 4 }), // G5
      silence(5),
      renderTone({ waveform: "square", freqStart: 1046.5, durationMs: 110, peak: 0.45, attackMs: 1, decayExp: 3 }), // C6(伸ばして着地)
    ]),

  money_loss: () =>
    concat([
      renderNoise({ durationMs: 8, peak: 0.22, decayExp: 10, seed: 7 }), // 小さな「コトッ」onset
      renderTone({ waveform: "triangle", freqStart: 600, freqEnd: 280, durationMs: 320, peak: 0.32, attackMs: 2, decayExp: 4 }),
    ]),

  // Phase10/P10-4-2: card_get/card_use/property_buyの3音は互いに聞き分けやすいよう、
  // 波形・音の作りそのものを変えている(card_get=三角波の2音ベル、card_use=矩形波の単発
  // 上昇スイープ、property_buy=ノイズクリック+矩形波の2音コイン)。money_gain(上昇4音
  // アルペジオ)とも混同しないよう、card_getは音数・波形の両方を変えて差別化した。

  // card_get: カードを獲得した嬉しさが伝わる短いベル風チャイム。三角波(money_gainの矩形波
  // アルペジオより柔らかい音色)で2音、後の音を長めに伸ばして「キラッ」とした余韻を残す。
  card_get: () =>
    concat([
      renderTone({ waveform: "triangle", freqStart: 880, durationMs: 90, peak: 0.38, attackMs: 1, decayExp: 3 }), // A5
      silence(15),
      renderTone({ waveform: "triangle", freqStart: 1174.66, durationMs: 190, peak: 0.4, attackMs: 1, decayExp: 2.5 }), // D6(伸ばして着地)
    ]),

  // card_use: カードを発動した瞬間の短い「ズシャッ」という発動音。矩形波の急な上昇スイープ+
  // 頭のノイズクリックで、card_get(ベル)・money_gain(アルペジオ)のどちらとも違う質感にする。
  card_use: () =>
    concat([
      renderNoise({ durationMs: 6, peak: 0.2, decayExp: 8, seed: 3 }),
      renderTone({ waveform: "square", freqStart: 500, freqEnd: 900, durationMs: 220, peak: 0.38, attackMs: 1, decayExp: 3.5 }),
    ]),

  // property_buy: 物件購入確定のレジ/コイン音。頭の小さなノイズクリック(レジのキー/コイン
  // 投入音)+矩形波2音(コインが弾む音、後の音ほど高く短く)。
  property_buy: () =>
    concat([
      renderNoise({ durationMs: 10, peak: 0.3, decayExp: 9, seed: 5 }),
      silence(8),
      renderTone({ waveform: "square", freqStart: 1046.5, durationMs: 60, peak: 0.35, attackMs: 1, decayExp: 5 }), // C6
      silence(4),
      renderTone({ waveform: "square", freqStart: 1568, durationMs: 130, peak: 0.4, attackMs: 1, decayExp: 4 }), // G6(高く着地)
    ]),

  // Phase10/P10-4-3: monopoly_group/monopoly_regionは冒頭の「ソ・ソ・ド」(G5-G5-C6、矩形波)を
  // 完全に同じ周波数で共有し、「同じファミリーの音」であることを示すモチーフにする。
  // money_gain(なめらかな順次上行アルペジオ)とは違い、同音連打→跳躍という呼びかけ型リズムに
  // することで意図的にリズムから区別している。

  // monopoly_group: 短い単声(モノフォニック)のファンファーレ。ソ・ソ・ドの3音だけで完結する。
  monopoly_group: () =>
    concat([
      renderTone({ waveform: "square", freqStart: 784, durationMs: 80, peak: 0.42, attackMs: 1, decayExp: 5 }), // G5
      silence(15),
      renderTone({ waveform: "square", freqStart: 784, durationMs: 80, peak: 0.42, attackMs: 1, decayExp: 5 }), // G5
      silence(15),
      renderTone({ waveform: "square", freqStart: 1046.5, durationMs: 260, peak: 0.48, attackMs: 1, decayExp: 3 }), // C6(伸ばして着地)
    ]),

  // monopoly_region: monopoly_groupと同じG5-G5-C6のモチーフから始まる(ただしC6は継続用に
  // 短め)。そこからE6-G6-C7へさらに駆け上がり、最後はC7(矩形波)+G6(三角波)の2声和音で
  // 締める。groupとの格差は「尺(約2倍)」「音域(C6止まり→C7まで)」「声部の厚み(単声→2声)」
  // の3点すべてで表現している。2声の合成はmix()で行い、各声のpeakは合成後にクリップしない
  // よう0.4前後に抑えている(フィナーレ実測ピークはP10-4-3のクリッピング確認で検証)。
  monopoly_region: () =>
    concat([
      // 共有モチーフ(monopoly_groupと同一周波数・同一波形。C6だけ継続するため短め)。
      renderTone({ waveform: "square", freqStart: 784, durationMs: 80, peak: 0.42, attackMs: 1, decayExp: 5 }), // G5
      silence(15),
      renderTone({ waveform: "square", freqStart: 784, durationMs: 80, peak: 0.42, attackMs: 1, decayExp: 5 }), // G5
      silence(15),
      renderTone({ waveform: "square", freqStart: 1046.5, durationMs: 140, peak: 0.44, attackMs: 1, decayExp: 4 }), // C6(継続)
      // 発展フレーズ: さらに駆け上がる。
      renderTone({ waveform: "square", freqStart: 1318.5, durationMs: 70, peak: 0.44, attackMs: 1, decayExp: 4 }), // E6
      silence(8),
      renderTone({ waveform: "square", freqStart: 1568, durationMs: 70, peak: 0.46, attackMs: 1, decayExp: 4 }), // G6
      silence(8),
      renderTone({ waveform: "square", freqStart: 2093, durationMs: 90, peak: 0.48, attackMs: 1, decayExp: 3.5 }), // C7
      silence(8),
      // フィナーレ: C7(矩形波)+G6(三角波)の2声和音で締める(groupには無い厚み)。
      mix([
        renderTone({ waveform: "square", freqStart: 2093, durationMs: 280, peak: 0.4, attackMs: 1, decayExp: 2.5 }), // C7
        renderTone({ waveform: "triangle", freqStart: 1568, durationMs: 280, peak: 0.4, attackMs: 1, decayExp: 2.5 }), // G6
      ]),
    ]),

  // Phase10/P10-4-3: destination_arrive/destination_revealは完全な共通モチーフ(同一音列)を
  // 持たせず、「必ず上へ抜ける音の動き」だけを共通言語にする(理由: 同一画面内で約10秒空けて
  // 連続再生されるため、音列まで一致させると"同じ音がもう一度鳴った"ように聞こえて紛らわしい)。
  // 波形も変える(arrive=三角波の柔らかい到着、reveal=矩形波の明瞭な決定)ことで、鳴った瞬間に
  // どちらの意味か即座に区別できるようにしている。

  // destination_arrive: 「到着・祝福」の明るく柔らかいジングル。三角波でミ・ソ・ドと上行し、
  // 最後だけ長く伸ばして鐘のような余韻を残す(card_get(A5→D6の2音ベル)より1音多く、
  // 音域も下から始めることで「より大きな達成」の違いを出す)。
  destination_arrive: () =>
    concat([
      renderTone({ waveform: "triangle", freqStart: 659.25, durationMs: 90, peak: 0.4, attackMs: 1, decayExp: 4 }), // E5
      silence(10),
      renderTone({ waveform: "triangle", freqStart: 784, durationMs: 90, peak: 0.42, attackMs: 1, decayExp: 4 }), // G5
      silence(10),
      renderTone({ waveform: "triangle", freqStart: 1046.5, durationMs: 200, peak: 0.45, attackMs: 1, decayExp: 2.5 }), // C6(伸ばして着地)
    ]),

  // destination_reveal: 「次の目的地決定」の短く明瞭な確定音。矩形波でシ→ミの完全4度跳躍のみ、
  // 4音の中で最短にして即断の感覚を出す。card_get/monopoly系/arriveのいずれとも異なる音高を
  // 選び、他のどのSEとも音列が被らないようにしている。
  destination_reveal: () =>
    concat([
      renderTone({ waveform: "square", freqStart: 987.77, durationMs: 40, peak: 0.4, attackMs: 1, decayExp: 5 }), // B5
      silence(5),
      renderTone({ waveform: "square", freqStart: 1318.51, durationMs: 85, peak: 0.42, attackMs: 1, decayExp: 4 }), // E6
    ]),
};

let totalBytes = 0;
for (const [id, generate] of Object.entries(SOUND_DEFS)) {
  const samples = generate();
  const outPath = path.join(OUT_DIR, `${id}.wav`);
  const bytes = writeWav(outPath, samples);
  const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);
  totalBytes += bytes;
  console.log(`${id}.wav: ${durationMs}ms, ${bytes}bytes -> ${outPath}`);
}
console.log(`合計: ${totalBytes}bytes`);
