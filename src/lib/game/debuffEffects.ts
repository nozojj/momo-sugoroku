import type { DebuffKind, GameState, Player, TargetSelectOption } from "@/types/game";

/**
 * 妨害系カード(RivalDebuffEffect)まわりの純粋関数・表示設定をまとめたファイル。
 *
 * TARGET_SELECT_HANDLERS(targetSelectEffects.ts)には入れない: あちらの契約は
 * 「選んだ結果をノードIDへ解決する」ことだが、妨害系カードは選んだ結果が「デバフを与える対象
 * プレイヤー」であってノードではないため。選択肢の生成(listRivalPlayerOptions)だけをここに置き、
 * 「選んだ後どうするか」(対象のactiveDebuffsへ追加する処理)はgameStore.tsのconfirmTargetSelection()
 * が直接行う(warp系のようにノード解決を挟まない、最も単純な帰結のため)。
 */

export interface RivalPlayerOptionContext {
  state: GameState;
  player: Player;
}

/** 自分以外の全プレイヤーを選択肢にする。TargetSelectOverlayは既存のまま(optionId/label/iconしか
 *  見ない)ため、carIconをそのままアイコンとして使い回せる。 */
export function listRivalPlayerOptions(ctx: RivalPlayerOptionContext): TargetSelectOption[] {
  return ctx.state.players
    .filter((p) => p.id !== ctx.player.id)
    .map((p) => ({ optionId: p.id, label: p.name, icon: p.carIcon }));
}

export interface DebuffDef {
  label: string;
  icon: string;
  /**
   * デバフ付与時のログメッセージ。今回はこの文字列をそのままpushLog()に渡すだけの軽量な演出
   * (TargetSelectOverlay→カード消費→デバフ付与→ログ→手番終了)に留める。将来「naviが
   * CharacterAnnouncerで発表する」演出を足す場合も、この関数の戻り値(セリフの元テキスト)を
   * そのままCharacterAnnouncement.linesの1行として使い回せる形にしてある。
   */
  describeGrant: (casterName: string, targetName: string, cardName: string) => string;
}

/** 妨害系カードの種類ごとの表示設定。新しいdebuffKindを増やすときはここに1エントリ足すだけでよい
 *  (characterAnnouncerTheme.tsのCHARACTER_ANNOUNCER_THEME_STYLEと同じ形)。 */
export const DEBUFF_DEFS: Record<DebuffKind, DebuffDef> = {
  skipNextRoll: {
    label: "お休み",
    icon: "😴",
    describeGrant: (caster, target, card) => `${caster}さんが「${card}」で${target}さんを次の手番お休みにした!`,
  },
  halveDiceNextRoll: {
    label: "出目半減",
    icon: "🐌",
    describeGrant: (caster, target, card) => `${caster}さんが「${card}」で${target}さんの次の出目を半分にした!`,
  },
};
