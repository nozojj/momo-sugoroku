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
 * 詳細はpublic/sounds/LICENSES.md参照)。gameOverはP11-4-1時点でもまだ楽曲が未決定のため、
 * 意図的に未登録のまま維持する(決定後にP11-4-2として追加予定。他シーンの音源を
 * 代用しない)。
 *
 * soundEffects.tsは「音源が無いidを先に登録してもよい(soundManager.tsのplaySE()が404を
 * 静かに無視するため)」という方針だが、BGMは1トラックあたりの再生時間が長く、シーン切替の
 * たびに存在しないパスへ毎回リクエストが飛ぶことになるため、より安全側に倒す。
 * BGM_TRACK_SRCをPartial<Record<...>>にして「実際に登録されているsceneだけ再生を試みる」
 * 設計を採用し、未登録のsceneはbgmManager.ts側で何も読み込まず無音のまま待機する。
 * gameOverの実音源が決まり次第、このファイルへエントリを1行追加するだけでよい
 * (bgmManager.ts側の変更は不要)。
 */
export type BgmSceneId = "title" | "gameplay" | "destinationCelebration" | "settlement" | "gameOver";

export const BGM_TRACK_SRC: Partial<Record<BgmSceneId, string>> = {
  title: "/sounds/bgm_title.mp3",
  gameplay: "/sounds/bgm_gameplay.mp3",
  destinationCelebration: "/sounds/bgm_destination.mp3",
  settlement: "/sounds/bgm_settlement.mp3",
  // gameOverは楽曲が未決定のため、P11-4-2で決まるまで意図的に空(他シーンの音源は流用しない)。
};
