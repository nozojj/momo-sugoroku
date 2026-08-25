/**
 * BGMのシーンidと音源pathのレジストリ。soundEffects.ts(SE用)と対になる構造だが、
 * BGMはbgmManager.ts(再生方式そのものがSEと異なるloop/フェード管理)専用に参照される。
 *
 * Phase11の推奨構成は5シーン。
 *   title(タイトル画面) / gameplay(盤面操作全般) / destinationCelebration(目的地到着演出) /
 *   settlement(決算画面) / gameOver(ゲーム終了画面)
 *
 * P11-2でtitle/gameplayの実音源を追加した。当初はscripts/generate-bgm.mjsによる自作生成
 * (WAV)を使っていたが、方針変更によりDOVA-SYNDROME配布のMP3(第三者作品、利用規約に
 * 従って組み込み利用)へ差し替えている。出典・ライセンスの詳細はpublic/sounds/LICENSES.md
 * を参照(自作生成のscripts/generate-bgm.mjsはこの差し替えに伴い削除済み)。
 *
 * P11-4-1でdestinationCelebration/settlementの実音源を追加した(destinationCelebrationは
 * DOVA-SYNDROME配布、settlementはPeriTune配布。いずれも第三者作品で、出典・ライセンスの
 * 詳細はpublic/sounds/LICENSES.md参照)。
 *
 * P11-4-2でgameOverの実音源を追加し、5シーン全てが揃った。採用曲「どうぶつ大運動会」
 * (DOVA-SYNDROME配布、作曲者MAKOOTO、ループ仕様のTrack2)は、公式試聴ページで複数候補
 * (壮大・感動的な優勝ファンファーレ系/ポップでコミカルなレース・運動会系)を比較した上で、
 * 明るくコミカルで湘南すごろく全体の親しみやすい雰囲気に合う後者の方向性から選定した。
 * 出典・ライセンスの詳細はpublic/sounds/LICENSES.md参照。
 *
 * soundEffects.tsは「音源が無いidを先に登録してもよい(soundManager.tsのplaySE()が404を
 * 静かに無視するため)」という方針だが、BGMは1トラックあたりの再生時間が長く、シーン切替の
 * たびに存在しないパスへ毎回リクエストが飛ぶことになるため、より安全側に倒す。
 * BGM_TRACK_SRCをPartial<Record<...>>にして「実際に登録されているsceneだけ再生を試みる」
 * 設計を採用している(現時点では5シーン全て登録済みだが、将来シーンが増えた場合も同じ設計を
 * 維持する)。
 */
export type BgmSceneId = "title" | "gameplay" | "destinationCelebration" | "settlement" | "gameOver";

export const BGM_TRACK_SRC: Partial<Record<BgmSceneId, string>> = {
  title: "/sounds/bgm_title.mp3",
  gameplay: "/sounds/bgm_gameplay.mp3",
  destinationCelebration: "/sounds/bgm_destination.mp3",
  settlement: "/sounds/bgm_settlement.mp3",
  gameOver: "/sounds/bgm_gameover.mp3",
};
