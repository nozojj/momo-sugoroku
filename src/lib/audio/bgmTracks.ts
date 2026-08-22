/**
 * BGMのシーンidと音源pathのレジストリ。soundEffects.ts(SE用)と対になる構造だが、
 * BGMはbgmManager.ts(再生方式そのものがSEと異なるloop/フェード管理)専用に参照される。
 *
 * Phase11の推奨構成は5シーン。
 *   title(タイトル画面) / gameplay(盤面操作全般) / destinationCelebration(目的地到着演出) /
 *   settlement(決算画面) / gameOver(ゲーム終了画面)
 *
 * P11-1の時点では実際のBGM WAVファイルをまだ生成していない(P11-2/P11-4で追加予定)ため、
 * BGM_TRACK_SRCは意図的に空にしている。
 *
 * soundEffects.tsは「音源が無いidを先に登録してもよい(soundManager.tsのplaySE()が404を
 * 静かに無視するため)」という方針だが、BGMは1トラックあたりの再生時間が長く、シーン切替の
 * たびに存在しないパスへ毎回リクエストが飛ぶことになるため、より安全側に倒す。
 * BGM_TRACK_SRCをPartial<Record<...>>にして「実際に登録されているsceneだけ再生を試みる」
 * 設計を採用し、未登録のsceneはbgmManager.ts側で何も読み込まず無音のまま待機する。
 * P11-2/P11-4で実音源が揃ったタイミングで、このファイルへエントリを追加するだけでよい
 * (bgmManager.ts側の変更は不要)。
 */
export type BgmSceneId = "title" | "gameplay" | "destinationCelebration" | "settlement" | "gameOver";

export const BGM_TRACK_SRC: Partial<Record<BgmSceneId, string>> = {
  // P11-2/P11-4で実音源を追加するまでは意図的に空。
};
