import type { TroubleCharacterMischiefDef } from "@/types/game";

/**
 * 妨害キャラ(仮称)が所有者のターン開始時に発生させる「悪さ」の定義。
 * yearEventDefs(src/data/yearEvents.ts)と同じ「weight合計100」の重み付き抽選プールで、
 * 新しい悪さを増やすときはここに1エントリ足すだけでよい(troubleCharacter.tsのロジックは
 * 変更不要)。
 *
 * MVPでは2種類のみ:
 * - money: 所持金を-50万円する(既存data/events.tsの軽量money系イベント -40〜-80万円と
 *   同じレンジ。moneyRoulette(数百〜千万円規模)より明確に軽い「嫌がらせ」程度の値)。
 * - debuff: 既存のActiveDebuff/DebuffKindをそのまま所有者自身へ付与する。新しいDebuffKindは
 *   追加しない。skipNextRoll(手番お休み、影響が大きい)はhalveDiceNextRoll(出目半減)より
 *   出現率を下げ、MVPでは過度に強くしすぎない。
 */
export const troubleCharacterMischiefDefs: TroubleCharacterMischiefDef[] = [
  {
    id: "trouble_money_pinch",
    kind: "money",
    weight: 40,
    amount: -50,
    message: "妨害キャラのいたずらで財布から少しお金が消えた…",
  },
  {
    id: "trouble_debuff_halve",
    kind: "debuff",
    weight: 40,
    debuffKind: "halveDiceNextRoll",
    message: "妨害キャラに足を引っ張られて、次のサイコロの出目が半分になりそう…",
  },
  {
    id: "trouble_debuff_skip",
    kind: "debuff",
    weight: 20,
    debuffKind: "skipNextRoll",
    message: "妨害キャラに眠らされて、次の手番はお休みになりそう…",
  },
];
