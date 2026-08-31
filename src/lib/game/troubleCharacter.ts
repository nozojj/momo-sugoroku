import type { ActiveDebuff, MapData, Player, TroubleCharacterFormId, TroubleCharacterMischiefDef } from "@/types/game";
import { shortestDistance } from "@/lib/game/mapGraph";
import { makeDebuffId } from "@/lib/game/engine";

/**
 * 妨害キャラ(仮称)まわりの判定・計算だけを集めた純関数ファイル。gameStore.ts本体
 * (get()/set())には一切依存しない。destinationArrival.tsと同じ役割分担: 「何が起きるか」を
 * ここで決め、実際にstateへ反映するのはgameStore.ts側の薄いラッパー。
 *
 * MVPでは仮名称のまま("妨害キャラ")。正式なキャラクター名・演出は別フェーズで扱う。
 */

/** ActiveDebuff.sourcePlayerId/sourceCardNameに使う、妨害キャラ由来であることを示す仮の値。
 *  実在プレイヤーIDと衝突しない固定文字列(既存プレイヤーIDは常に"p1"/"p2"...の形)。 */
export const TROUBLE_CHARACTER_SOURCE_ID = "troubleCharacter";
export const TROUBLE_CHARACTER_SOURCE_NAME = "妨害キャラ";

/** 既知の妨害キャラ形態idの一覧(S-3a時点では"normal"のみ)。新しい形態を追加するときは
 *  ここに1件足すだけでよく、isTroubleCharacterFormId()の呼び出し側(persistMigration.ts等)は
 *  変更不要。 */
const TROUBLE_CHARACTER_FORM_IDS: TroubleCharacterFormId[] = ["normal"];

/** 値が既知の妨害キャラ形態idかどうかを判定する型ガード。旧セーブ(このフィールド追加前、
 *  値がundefined)や、将来形態を削除/リネームした場合に消えたidが残っているケースを、
 *  呼び出し側(persistMigration.ts)が安全にfalse判定してフォールバックできるようにする。 */
export function isTroubleCharacterFormId(value: unknown): value is TroubleCharacterFormId {
  return typeof value === "string" && (TROUBLE_CHARACTER_FORM_IDS as string[]).includes(value);
}

/**
 * ゲーム最初の目的地到着時、新しく決定された次の目的地(destinationNodeId)から最も遠い
 * プレイヤーを初回所有者として選ぶ。距離は既存のshortestDistance()をそのまま使う
 * (目的地抽選ロジック・distanceの計算方法自体には一切手を入れない)。
 * 同距離(タイ)の場合はその中からランダムに1人選ぶ(pickRandomDestinationと同じMath.random()方式)。
 * 全員が目的地へ到達不能(理論上ほぼ発生しない)の場合は、距離をInfinity扱いにして
 * 「最も遠い」の判定から除外しない(到達不能=最も遠いとみなす)。
 */
export function pickInitialTroubleCharacterOwner(map: MapData, players: Player[], destinationNodeId: string): string {
  const distances = players.map((p) => ({
    id: p.id,
    distance: shortestDistance(map, p.currentNodeId, destinationNodeId, p.cardIds) ?? Infinity,
  }));
  const maxDistance = Math.max(...distances.map((d) => d.distance));
  const farthest = distances.filter((d) => d.distance === maxDistance);
  const picked = farthest[Math.floor(Math.random() * farthest.length)];
  return picked.id;
}

export type TroubleCharacterHandoffResult =
  | { handedOff: false }
  | { handedOff: true; newOwnerId: string; fromPlayerId: string; toPlayerId: string };

/**
 * 着地(exact landing)が確定したプレイヤー(mover)の位置に、現在の妨害キャラ所有者が既にいれば
 * moverへ所有者を移す。通過は判定しない(moveHistoryは見ない、finishLandingAndEndTurn()の
 * 「最終停止時のみ呼ばれる」という既存の呼び出しタイミングに乗るだけで実現する)。
 * 所有者が未登場(null)、moverが既に所有者本人、所有者がmoverと別マスにいる場合はhandedOff:falseを返す。
 */
export function checkTroubleCharacterHandoff(
  troubleCharacterOwnerId: string | null,
  mover: Player,
  players: Player[],
): TroubleCharacterHandoffResult {
  if (troubleCharacterOwnerId === null || troubleCharacterOwnerId === mover.id) return { handedOff: false };
  const owner = players.find((p) => p.id === troubleCharacterOwnerId);
  if (!owner || owner.currentNodeId !== mover.currentNodeId) return { handedOff: false };
  return { handedOff: true, newOwnerId: mover.id, fromPlayerId: owner.id, toPlayerId: mover.id };
}

/**
 * troubleCharacterMischiefDefsから、weight(合計100慣習)に基づく重み付きランダム抽選を行う。
 * drawYearEvent()(yearEvent.ts)と全く同じ式。悪さの追加・確率調整はデータ側(weight)だけで
 * 完結し、ここのロジックには手を入れなくてよい。
 */
export function drawTroubleCharacterMischief(pool: TroubleCharacterMischiefDef[]): TroubleCharacterMischiefDef {
  const totalWeight = pool.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * totalWeight;
  for (const mischief of pool) {
    r -= mischief.weight;
    if (r < 0) return mischief;
  }
  return pool[pool.length - 1];
}

export interface TroubleCharacterMischiefApplication {
  players: Player[];
  logMessage: string;
}

/**
 * 抽選済みの悪さ(mischief)を所有者(ownerId)へ適用する。money種別は既存のmoney加減算と
 * 同じ形でその場でplayer.moneyを増減し、debuff種別は既存のActiveDebuff/DebuffKindの形で
 * そのまま所有者自身へ付与する(新しいDebuffKindは増やさない)。所持金がマイナスになることは
 * 既存ルール(moneyRoulette等)と同様に許容する(フロア処理はしない)。
 */
export function applyTroubleCharacterMischief(
  players: Player[],
  ownerId: string,
  mischief: TroubleCharacterMischiefDef,
): TroubleCharacterMischiefApplication {
  const owner = players.find((p) => p.id === ownerId);
  const ownerName = owner?.name ?? "";

  if (mischief.kind === "money") {
    const updated = players.map((p) => (p.id === ownerId ? { ...p, money: p.money + mischief.amount } : p));
    return {
      players: updated,
      logMessage: `${ownerName}さん: ${mischief.message}(${mischief.amount}万円)`,
    };
  }

  const debuff: ActiveDebuff = {
    id: makeDebuffId(),
    kind: mischief.debuffKind,
    sourcePlayerId: TROUBLE_CHARACTER_SOURCE_ID,
    sourceCardName: TROUBLE_CHARACTER_SOURCE_NAME,
  };
  const updated = players.map((p) => (p.id === ownerId ? { ...p, activeDebuffs: [...p.activeDebuffs, debuff] } : p));
  return {
    players: updated,
    logMessage: `${ownerName}さん: ${mischief.message}`,
  };
}
