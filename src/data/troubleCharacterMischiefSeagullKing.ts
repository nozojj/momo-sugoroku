import type { TroubleCharacterMischiefDef } from "@/types/game";

/**
 * カモメ魔王形態(seagullKing)専用の「悪さ」プール(Polish Phase P1 S-3e)。
 *
 * 最終形態らしく、ユーザーが重視した4テーマ(物件被害・カード大量破壊・所有者本人への金銭
 * 被害・周囲巻き込み)を、それぞれ独立したプールエントリとして1つずつ表現する
 * (normal/sakeと同じ「1回の悪さ=1つの効果」という設計を踏襲し、複数効果を1エントリに
 * 詰め込まない)。合計weightは既存慣習通り100。
 *
 * - trouble_seagullking_property_seize(kind: propertyLoss、weight35): カモメ魔王の代表能力。
 *   所有物件をランダムに1件、ownedPropertyIdsから除去して未所有へ戻す(他プレイヤーへの
 *   転移は行わない。所有者の損失+他者の利益という二重スイングを避けるため)。所有物件が
 *   0件のときのみ、fallbackAmount(-100万円)を所持金から差し引く代替効果に切り替わる。
 * - trouble_seagullking_money_smash(kind: money、weight25): 所有者本人へ-150万円
 *   (normal/sakeの-50万円の3倍)。
 * - trouble_seagullking_nearby_storm(kind: moneyNearby、weight20): 所有者-80万円+
 *   グラフ距離1以内(TROUBLE_CHARACTER_NEARBY_MAX_DISTANCE)の他プレイヤー1人につき-30万円
 *   (sakeの-30/-10のおよそ2.7倍)。
 * - trouble_seagullking_card_annihilate(kind: cardDestroy、weight20): 破壊可能なカード
 *   (excludeKeyCards: true、CardDef.kind==="key"の裏道パス等は対象外)からランダムに最大3枚
 *   (maxCount: 3)を破壊する。所持数が3枚未満ならその枚数だけ、0枚なら実害なしで完了する
 *   (全8枚消滅のような極端な運ゲー化は避け、将来さらに強い専用ギミックを追加する余地を残す)。
 */
export const troubleCharacterMischiefSeagullKingDefs: TroubleCharacterMischiefDef[] = [
  {
    id: "trouble_seagullking_property_seize",
    kind: "propertyLoss",
    weight: 35,
    fallbackAmount: -100,
    message: "カモメ魔王が羽を広げ、所有物件の1つを丸ごと奪い去ってしまった…",
  },
  {
    id: "trouble_seagullking_money_smash",
    kind: "money",
    weight: 25,
    amount: -150,
    message: "カモメ魔王の一撃で、財布ごと吹き飛ばされてしまった…",
  },
  {
    id: "trouble_seagullking_nearby_storm",
    kind: "moneyNearby",
    weight: 20,
    ownerAmount: -80,
    nearbyAmount: -30,
    message: "カモメ魔王が巻き起こす嵐に、周りにいたプレイヤーまで巻き込まれた…",
  },
  {
    id: "trouble_seagullking_card_annihilate",
    kind: "cardDestroy",
    weight: 20,
    maxCount: 3,
    excludeKeyCards: true,
    message: "カモメ魔王の強烈な一睨みで、手札の一部が粉々に破壊されてしまった…",
  },
];
