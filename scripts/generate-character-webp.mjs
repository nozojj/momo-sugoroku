// 妨害キャラ3形態(troubleChar/troubleChar_sake/troubleChar_seagullKing)の本番アセットを
// 配信用WebPへ変換するスクリプト(Polish Phase P1 S-3f-1)。
//
// 元PNG(public/characters/troubleChar/{normal,sake,seagullKing}.png)をマスターとして保持し、
// このスクリプトはWebPを生成するだけで元PNGには一切書き込まない。
//
// リサイズ・crop・アスペクト比変更は行わない(=入力と出力の幅/高さは常に一致する)。
// alphaチャンネルは維持したまま、視覚劣化が目立たない範囲の高品質圧縮(quality:90,
// alphaQuality:100)のみを適用する。sharpは本スクリプト実行時にのみ使うビルド時ツールで、
// package.jsonのdependenciesには追加していない(node_modules内に既存の推移的依存として
// 存在するものをそのまま利用する。実行できない環境ではPNGをそのまま本番配信する方針に切り替える)。
//
// 実行方法: `node scripts/generate-character-webp.mjs`
// 出力: public/characters/troubleChar/{normal,sake,seagullKing}.webp
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "..", "public", "characters", "troubleChar");

const FORMS = ["normal", "sake", "seagullKing"];

async function main() {
  for (const form of FORMS) {
    const src = path.join(DIR, `${form}.png`);
    const dst = path.join(DIR, `${form}.webp`);
    if (!existsSync(src)) {
      throw new Error(`missing source PNG: ${src}`);
    }

    const srcMeta = await sharp(src).metadata();
    await sharp(src).webp({ quality: 90, alphaQuality: 100, lossless: false }).toFile(dst);
    const dstMeta = await sharp(dst).metadata();

    if (srcMeta.width !== dstMeta.width || srcMeta.height !== dstMeta.height) {
      throw new Error(
        `dimension mismatch for ${form}: src ${srcMeta.width}x${srcMeta.height} vs dst ${dstMeta.width}x${dstMeta.height}`
      );
    }

    console.log(
      `${form}: ${srcMeta.width}x${srcMeta.height}, PNG ${statSync(src).size}B -> WebP ${statSync(dst).size}B (alpha kept: ${dstMeta.hasAlpha})`
    );
  }
}

main();
