// calculateSettlement()の自動テスト。
//
// calculateSettlement()はpropertyRevenue.ts/propertyOwnership.ts経由で@/data/properties・
// @/data/propertyGroupsを直接importしており(propertyMonopoly.tsのdetectMonopolyAchievement()
// と違って引数注入されていない)、架空の物件IDでは正しく動作しない。そのため実データの中から
// 小さい地域(region:"茅ヶ崎"、grp_kagawa 3件・grp_chigasaki_chuo 5件の2グループのみ)を
// フィクスチャに使う。
//
// beforeAllで「使うグループ・件数・地域名」が前提通りかを検証し、崩れていればテスト前提が
//崩れている旨を明示するエラーで即座に失敗させる(他の既存テストファイルと同じ方針)。
// 期待値は本番のcalculateAnnualRevenue()を呼ばず、テスト側で独立に
// `Math.round(price * revenueRate * 倍率)` を計算して比較する(本番ロジックへの結果の
// 丸投げにならないようにするため)。
import { beforeAll, describe, expect, it } from "vitest";
import type { NetWorthHistoryEntry, Player, PropertyDef } from "@/types/game";
import { calculateSettlement } from "@/lib/game/settlement";
import { propertyDefs } from "@/data/properties";
import { propertyGroupDefs, getPropertyGroupDef } from "@/data/propertyGroups";
import { PROPERTY_REVENUE_CONFIG } from "@/lib/game/propertyBalance";
import { STARTING_MONEY } from "@/lib/game/engine";
import { yearEventDefs } from "@/data/yearEvents";
import { propertyGenreOf } from "@/lib/game/propertyDisplay";

const KAGAWA_GROUP_ID = "grp_kagawa";
const CHIGASAKI_GROUP_ID = "grp_chigasaki_chuo";
const EXPECTED_REGION = "茅ヶ崎";
const EXPECTED_KAGAWA_COUNT = 3;
const EXPECTED_CHIGASAKI_COUNT = 6;
const TAMURA_GROUP_ID = "grp_tamura";

let kagawaProps: PropertyDef[];
let chigasakiProps: PropertyDef[];
let tamuraProp: PropertyDef;

beforeAll(() => {
  const kagawaGroup = getPropertyGroupDef(KAGAWA_GROUP_ID);
  const chigasakiGroup = getPropertyGroupDef(CHIGASAKI_GROUP_ID);
  if (!kagawaGroup || !chigasakiGroup) {
    throw new Error(
      `テスト前提が崩れています: ${KAGAWA_GROUP_ID}/${CHIGASAKI_GROUP_ID} のいずれかがpropertyGroupDefsから見つかりません。物件グループデータが変更された可能性があります。`,
    );
  }
  if (kagawaGroup.region !== EXPECTED_REGION || chigasakiGroup.region !== EXPECTED_REGION) {
    throw new Error(
      `テスト前提が崩れています: ${KAGAWA_GROUP_ID}/${CHIGASAKI_GROUP_ID} のregionが両方とも"${EXPECTED_REGION}"である前提だが、` +
        `実際は"${kagawaGroup.region}"/"${chigasakiGroup.region}"だった。region:"${EXPECTED_REGION}"に他のグループが追加/削除された可能性があります。`,
    );
  }

  kagawaProps = propertyDefs.filter((p) => p.groupId === KAGAWA_GROUP_ID);
  chigasakiProps = propertyDefs.filter((p) => p.groupId === CHIGASAKI_GROUP_ID);
  if (kagawaProps.length !== EXPECTED_KAGAWA_COUNT) {
    throw new Error(
      `テスト前提が崩れています: ${KAGAWA_GROUP_ID}の物件数は${EXPECTED_KAGAWA_COUNT}件の前提だが実際は${kagawaProps.length}件でした。properties.tsが変更された可能性があります。`,
    );
  }
  if (chigasakiProps.length !== EXPECTED_CHIGASAKI_COUNT) {
    throw new Error(
      `テスト前提が崩れています: ${CHIGASAKI_GROUP_ID}の物件数は${EXPECTED_CHIGASAKI_COUNT}件の前提だが実際は${chigasakiProps.length}件でした。properties.tsが変更された可能性があります。`,
    );
  }

  // region:"茅ヶ崎"がこの2グループだけで構成されている前提(そうでないと「2グループ全所有=地域独占」
  // というこのテストの組み立てが崩れる)。
  const otherGroupsInRegion = propertyGroupDefs.filter(
    (g) => g.region === EXPECTED_REGION && g.id !== KAGAWA_GROUP_ID && g.id !== CHIGASAKI_GROUP_ID,
  );
  if (otherGroupsInRegion.length > 0) {
    throw new Error(
      `テスト前提が崩れています: region:"${EXPECTED_REGION}"に${KAGAWA_GROUP_ID}/${CHIGASAKI_GROUP_ID}以外のグループ` +
        `(${otherGroupsInRegion.map((g) => g.id).join(", ")})が追加されています。地域独占フィクスチャの組み立てが前提と合いません。`,
    );
  }

  const tamuraProps = propertyDefs.filter((p) => p.groupId === TAMURA_GROUP_ID);
  if (tamuraProps.length === 0) {
    throw new Error(`テスト前提が崩れています: ${TAMURA_GROUP_ID}の物件が見つかりません。`);
  }
  tamuraProp = tamuraProps[0];
});

function makePlayer(id: string, money: number, ownedPropertyIds: string[]): Player {
  return {
    id,
    name: id,
    color: "#000000",
    carIcon: "🚗",
    currentNodeId: "n",
    moveHistory: ["n"],
    money,
    ownedPropertyIds,
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
    controlledBy: "human",
  };
}

function expectedRevenueOf(defs: PropertyDef[], multiplier: number): number {
  return defs.reduce((sum, d) => sum + Math.round(d.price * d.revenueRate * multiplier), 0);
}

/** 年度イベントのジャンル別倍率を反映した期待値。tierMultiplier(独占倍率等)と
 *  yearEventのgenreMultipliers(該当ジャンルの物件だけ)を両方掛け合わせる。 */
function expectedRevenueWithYearEvent(defs: PropertyDef[], tierMultiplier: number, yearEventId: string): number {
  const event = yearEventDefs.find((e) => e.id === yearEventId);
  if (!event) {
    throw new Error(`テスト前提が崩れています: yearEventDefsに"${yearEventId}"が見つかりません。`);
  }
  return defs.reduce((sum, d) => {
    const genreMultiplier = event.genreMultipliers[propertyGenreOf(d)] ?? 1;
    return sum + Math.round(d.price * d.revenueRate * tierMultiplier * genreMultiplier);
  }, 0);
}

describe("calculateSettlement()", () => {
  it("通常1倍: 所有グループが未独占なら基準倍率(baseMultiplier)が適用される", () => {
    const player = makePlayer("p1", 1500, [tamuraProp.id]);
    const { entries } = calculateSettlement([player], 1, []);

    const entry = entries[0];
    expect(entry.propertyBreakdown).toHaveLength(1);
    expect(entry.propertyBreakdown[0].tier).toBe("normal");
    expect(entry.propertyRevenue).toBe(Math.round(tamuraProp.price * tamuraProp.revenueRate * PROPERTY_REVENUE_CONFIG.baseMultiplier));
  });

  it("グループ独占1.5倍: grp_kagawaの全3件を所有(grp_chigasaki_chuoは未所有)", () => {
    const player = makePlayer("p1", 1500, kagawaProps.map((p) => p.id));
    const { entries } = calculateSettlement([player], 1, []);

    const entry = entries[0];
    expect(entry.propertyBreakdown).toHaveLength(EXPECTED_KAGAWA_COUNT);
    for (const item of entry.propertyBreakdown) {
      expect(item.tier).toBe("groupMonopoly");
    }
    expect(entry.propertyRevenue).toBe(expectedRevenueOf(kagawaProps, PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier));
  });

  it("地域独占2倍・二重加算防止: grp_kagawa+grp_chigasaki_chuoの計8件を全所有しても倍率は重ね掛けされない", () => {
    const ownedIds = [...kagawaProps, ...chigasakiProps].map((p) => p.id);
    const player = makePlayer("p1", 1500, ownedIds);
    const { entries } = calculateSettlement([player], 1, []);

    const entry = entries[0];
    expect(entry.propertyBreakdown).toHaveLength(EXPECTED_KAGAWA_COUNT + EXPECTED_CHIGASAKI_COUNT);
    for (const item of entry.propertyBreakdown) {
      expect(item.tier).toBe("regionMonopoly");
    }

    const allProps = [...kagawaProps, ...chigasakiProps];
    const correctRevenue = expectedRevenueOf(allProps, PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier);
    const stackedRevenue = expectedRevenueOf(
      allProps,
      PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier * PROPERTY_REVENUE_CONFIG.regionMonopolyMultiplier,
    );

    expect(entry.propertyRevenue).toBe(correctRevenue);
    expect(entry.propertyRevenue).not.toBe(stackedRevenue); // ×1.5×2の二重加算になっていないことの明示的な確認
  });

  it("netWorthBefore: historyが空(1年目)ならSTARTING_MONEY固定になる", () => {
    // 実際の所持金(2000)とは無関係に、1年目のnetWorthBeforeは常にSTARTING_MONEYになる
    // (createInitialState()が全員STARTING_MONEY・所有物件0でスタートする前提に基づく仕様)。
    const player = makePlayer("p1", 2000, []);
    const { entries } = calculateSettlement([player], 1, []);

    expect(entries[0].netWorthBefore).toBe(STARTING_MONEY);
  });

  it("netWorthBefore/netWorthDelta: historyがあれば前回決算時点のnetWorthから引き継ぐ", () => {
    const player = makePlayer("p1", 2000, []);
    const history: NetWorthHistoryEntry[] = [{ year: 1, values: [{ playerId: "p1", netWorth: 1800 }] }];

    const { entries } = calculateSettlement([player], 2, history);
    const entry = entries[0];

    expect(entry.netWorthBefore).toBe(1800);
    expect(entry.netWorthAfter).toBe(entry.cash + entry.propertyValue);
    expect(entry.netWorthDelta).toBe(entry.netWorthAfter - 1800);
  });

  it("所有物件が無い(収益0)プレイヤーはmoneyが変化しない", () => {
    const player = makePlayer("p1", 2000, []);
    const { entries, updatedPlayers } = calculateSettlement([player], 1, []);

    expect(entries[0].propertyRevenue).toBe(0);
    expect(updatedPlayers[0].money).toBe(2000);
  });

  it("収益があるプレイヤーはmoneyに今年度の物件収益が加算される", () => {
    const player = makePlayer("p1", 2000, [tamuraProp.id]);
    const { entries, updatedPlayers } = calculateSettlement([player], 1, []);

    expect(updatedPlayers[0].money).toBe(2000 + entries[0].propertyRevenue);
    expect(entries[0].cash).toBe(updatedPlayers[0].money);
  });
});

describe("calculateSettlement(): 年度イベント倍率", () => {
  it("yearEventIdを省略すると倍率1(補正なし)扱いになり、既存の期待値と一致する", () => {
    const player = makePlayer("p1", 1500, [tamuraProp.id]);
    const { entries } = calculateSettlement([player], 1, []);
    const entry = entries[0];

    expect(entry.propertyBreakdown[0].yearEventMultiplier).toBe(1);
    expect(entry.propertyRevenue).toBe(Math.round(tamuraProp.price * tamuraProp.revenueRate * PROPERTY_REVENUE_CONFIG.baseMultiplier));
  });

  it('"normal"(平年)は全ジャンル倍率1で、省略時と同じ結果になる', () => {
    const player = makePlayer("p1", 1500, [tamuraProp.id]);
    const { entries } = calculateSettlement([player], 1, [], "normal");

    expect(entries[0].propertyBreakdown[0].yearEventMultiplier).toBe(1);
  });

  it("存在しないyearEventIdは補正なし(倍率1)へ安全にフォールバックする(旧セーブ相当)", () => {
    const player = makePlayer("p1", 1500, [tamuraProp.id]);
    const { entries } = calculateSettlement([player], 1, [], "no_such_event_id");

    expect(entries[0].propertyBreakdown[0].yearEventMultiplier).toBe(1);
  });

  it('"heatwave": 該当ジャンル(food)の物件だけ倍率1.05が掛かる(tamuraProp = food genre)', () => {
    expect(propertyGenreOf(tamuraProp)).toBe("food");
    const player = makePlayer("p1", 1500, [tamuraProp.id]);
    const { entries } = calculateSettlement([player], 1, [], "heatwave");
    const entry = entries[0];

    expect(entry.propertyBreakdown[0].yearEventMultiplier).toBe(1.05);
    expect(entry.propertyRevenue).toBe(
      Math.round(tamuraProp.price * tamuraProp.revenueRate * PROPERTY_REVENUE_CONFIG.baseMultiplier * 1.05),
    );
  });

  it("独占倍率と年度イベント倍率は両方乗算される(grp_kagawaグループ独占 × coolSummerのagricultureブースト)", () => {
    const player = makePlayer("p1", 1500, kagawaProps.map((p) => p.id));
    const { entries } = calculateSettlement([player], 1, [], "coolSummer");
    const entry = entries[0];

    expect(entry.propertyRevenue).toBe(
      expectedRevenueWithYearEvent(kagawaProps, PROPERTY_REVENUE_CONFIG.groupMonopolyMultiplier, "coolSummer"),
    );
  });
});
