import type { TroubleCharacterMischiefDef } from "@/types/game";

/**
 * 酒モンスター形態(sake)専用の「悪さ」プール(Polish Phase P1 S-3d)。
 *
 * 既存normal形態の3種(data/troubleCharacterMischief.tsのtrouble_money_pinch/
 * trouble_debuff_halve/trouble_debuff_skip、weight 40/40/20)と全く同じ効果(amount/
 * debuffKind)を、酒モンスターの口調に合わせたメッセージへ差し替えた別データとして
 * 「通常系」に含める(normal側のtroubleCharacterMischiefDefsは1件も変更していない)。
 * 3種の元のweight比40:40:20を保ったまま、合計が70になるよう0.7倍して28/28/14に
 * スケールし、酒モンスター専用の「周囲巻き込み」(trouble_sake_nearby_splash)を
 * weight30で追加することで、既存の「weight合計100」慣習を維持している(28+28+14+30=100)。
 *
 * trouble_sake_nearby_splash: 所有者本人はownerAmount(-30万円)、所有者から見て
 * TROUBLE_CHARACTER_NEARBY_MAX_DISTANCE(=1、道路グラフ上で同じマスまたは隣接1マス)以内に
 * いる他プレイヤーは1人につきnearbyAmount(-10万円)を同時に受ける(troubleCharacter.tsの
 * findNearbyPlayerIds()/applyTroubleCharacterMischief()参照)。
 *
 * 金額根拠: 初期案として提示された「所有者-300,000円/周囲-100,000円」を、このゲームの
 * 金額単位(万円、STARTING_MONEY=1500万円)にそのまま換算すると-30万円/-10万円になる。
 * 既存のtrouble_money_pinch(-50万円、所有者のみ)より所有者本人への被害額は小さいが、
 * 「巻き込まれた側は痛いが理不尽すぎない」を優先し、初期実装として提示された値をそのまま
 * 採用した(=1人あたりの被害は既存より軽いが、複数人を同時に巻き込みうる点が酒モンスター
 * らしい脅威、という設計判断)。将来のバランス調整候補として、この初期値のまま据え置く。
 */
export const troubleCharacterMischiefSakeDefs: TroubleCharacterMischiefDef[] = [
  {
    id: "trouble_sake_money_pinch",
    kind: "money",
    weight: 28,
    amount: -50,
    message: "酔っ払った妨害キャラに絡まれ、財布から少しお金が抜き取られた…",
  },
  {
    id: "trouble_sake_debuff_halve",
    kind: "debuff",
    weight: 28,
    debuffKind: "halveDiceNextRoll",
    message: "千鳥足の妨害キャラにぶつかられて、次のサイコロの出目が半分になりそう…",
  },
  {
    id: "trouble_sake_debuff_skip",
    kind: "debuff",
    weight: 14,
    debuffKind: "skipNextRoll",
    message: "妨害キャラの悪酔いに付き合わされて、次の手番はお休みになりそう…",
  },
  {
    id: "trouble_sake_nearby_splash",
    kind: "moneyNearby",
    weight: 30,
    ownerAmount: -30,
    nearbyAmount: -10,
    message: "酔っ払った妨害キャラが暴れ、周りにいたプレイヤーまで巻き込んでしまった…",
  },
];
