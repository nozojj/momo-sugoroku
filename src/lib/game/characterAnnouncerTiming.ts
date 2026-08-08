/**
 * CharacterAnnouncerの演出タイミング(調整用定数)。ここの数値を書き換えるだけで
 * 登場/退場の速さやセリフの自動送り間隔を調整できる(状態遷移ロジック側には手を入れなくてよい)。
 */
export const CHARACTER_ANNOUNCER_TIMING = {
  /** 登場スライドインにかける時間(ms) */
  slideInMs: 380,
  /** 退場スライドアウトにかける時間(ms) */
  slideOutMs: 320,
  /** 1セリフあたり、タップされなかった場合に自動で次へ進むまでの表示時間(ms) */
  lineHoldMs: 2200,
};
