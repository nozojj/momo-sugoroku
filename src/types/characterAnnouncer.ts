/**
 * キャラクターアナウンスシステムの型定義。
 *
 * GameState(types/game.ts)とは独立させている: これは純粋に見た目(演出)の設定であり、
 * ゲームの状態遷移には一切関与しない。各イベント用モーダル(ArrivalModal等)が既存の
 * xxxInfo(ArrivalInfo/SettlementInfo等)からCharacterAnnouncementを組み立てて
 * CharacterAnnouncerへ渡すアダプター役を担う。
 */

/** 表情の一覧。ここに追加するだけで新しい表情に対応できる(絵柄はcharacterStyle.ts側)。 */
export type CharacterExpression = "normal" | "happy" | "surprised" | "troubled";

/** キャラクターが画面外のどちらから登場するか(スライドインの起点)。 */
export type CharacterEnterDirection = "left" | "right" | "bottom";

/** キャラクターが最終的に画面の左右どちらに配置されるか。enterDirectionとは独立して指定できる
 *  (例: 下からせり上がって右側に着地、右から左側まで滑り込む、なども構成可能)。 */
export type CharacterSide = "left" | "right";

/** 登場/退場のアニメーション種別。今回はslideのみ実装。将来pop/fade等を追加する拡張余地。 */
export type CharacterAnimationType = "slide";

/** 演出テーマ。省略時は"normal"。今後の決算・地域独占・レアカード・特殊イベント・大収入/大損失などは
 *  このテーマを切り替えるだけで見た目のトーンを再利用できる想定(テーマ自体の追加はここに1件足すだけ)。 */
export type CharacterAnnouncementTheme = "normal" | "celebratory" | "warning" | "negative";

/** テーマに紐づく周辺演出の有無。characterAnnouncerTheme.tsのテーマ既定値と
 *  CharacterAnnouncement.effectをマージして最終的な演出を決める(個別フラグ単位で上書き可能)。
 *  例: celebratoryテーマのまま「紙吹雪はなしでキラキラだけ」にしたい場合は
 *  effect: { confetti: false } を指定する。 */
export interface AnnouncerEffectConfig {
  confetti?: boolean;
  sparkle?: boolean;
  warnRing?: boolean;
  /** highlight表示時にキャラクターを軽くshakeさせる(negativeテーマの既定演出) */
  shakeOnHighlight?: boolean;
  /** キャラクター周辺で一瞬だけ強く光ってすぐ消える「衝撃」演出。どのテーマにも既定値は
   *  持たせず(Polish Phase P1 S-3f-3時点では妨害キャラの最終形態変身のみが明示的に指定する)、
   *  必ずCharacterAnnouncement.effectでの個別指定を必要とする。 */
  impactFlash?: boolean;
}

/** セリフ1行の強調表示(highlight)。金額(kind:"money")とテキスト(kind:"text")の2種類を
 *  型安全に区別するunion(Polish Phase P1 S-3f-5で、妨害キャラのpropertyLoss/cardDestroyの
 *  ような非金額の実被害("○○を失った!"等)も表示できるよう拡張)。既存の金額highlight
 *  (kind:"money")の挙動・フィールド(label/amount/holdExtraMs)は1つも変更していない。
 *  holdExtraMsはどちらの種類でも共通に使える(CharacterAnnouncer.tsxの保持時間延長ロジックは
 *  kindを判別しない)。 */
export type CharacterLineHighlight =
  | {
      kind: "money";
      label?: string;
      amount: number;
      /** この行の強調表示にどれだけ余分に時間を割くか(ms)。省略時はCHARACTER_ANNOUNCER_TIMING.highlightHoldExtraMsを使う。
       *  金額が大きい/特殊イベントなど、行ごとに強調時間を変えたい場合にここを指定する。 */
      holdExtraMs?: number;
    }
  | {
      kind: "text";
      /** 金額に変換できない実被害結果(例: "○○物件を失った!"、"カードを3枚失った!")を
       *  そのまま表示する。 */
      text: string;
      holdExtraMs?: number;
    };

export interface CharacterLine {
  text: string;
  /** この行から表情を切り替えたい場合のみ指定(省略時は直前の表情を維持) */
  expression?: CharacterExpression;
  /** 到着ボーナス・決算額・妨害キャラの実被害結果のような、強調表示したい行に使う */
  highlight?: CharacterLineHighlight;
}

export interface CharacterAnnouncement {
  characterId: string;
  /** 登場時点の初期表情 */
  expression: CharacterExpression;
  enterDirection: CharacterEnterDirection;
  side: CharacterSide;
  animationType: CharacterAnimationType;
  /** 1件以上。順番に表示する(自動送り+タップ早送りの両対応) */
  lines: CharacterLine[];
  /** 演出テーマ。省略時は"normal"(既存の到着演出相当の見た目) */
  theme?: CharacterAnnouncementTheme;
  /** テーマ既定の周辺演出を部分的に上書きしたい場合に指定。指定しなければテーマの既定値をそのまま使う。 */
  effect?: AnnouncerEffectConfig;
}
