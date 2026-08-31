import { describe, expect, it, vi, afterEach } from "vitest";
import { getMap } from "@/data/maps";
import { shortestDistance } from "@/lib/game/mapGraph";
import { createPlayer } from "@/lib/game/engine";
import {
  pickInitialTroubleCharacterOwner,
  checkTroubleCharacterHandoff,
  drawTroubleCharacterMischief,
  applyTroubleCharacterMischief,
  isTroubleCharacterFormId,
  getTroubleCharacterFormDef,
  decideTroubleCharacterTransform,
  TROUBLE_CHARACTER_SOURCE_ID,
  TROUBLE_CHARACTER_SOURCE_NAME,
  TROUBLE_CHARACTER_NEARBY_MAX_DISTANCE,
  pickRandomDistinct,
} from "@/lib/game/troubleCharacter";
import { troubleCharacterMischiefDefs } from "@/data/troubleCharacterMischief";
import { troubleCharacterMischiefSakeDefs } from "@/data/troubleCharacterMischiefSake";
import { troubleCharacterMischiefSeagullKingDefs } from "@/data/troubleCharacterMischiefSeagullKing";
import { propertyDefs, getPropertyDef } from "@/data/properties";
import { getCardDef } from "@/data/cards";
import type { TroubleCharacterFormDef, TroubleCharacterFormId, TroubleCharacterMischiefDef } from "@/types/game";

const MAP_ID = "shonan-full";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickInitialTroubleCharacterOwner()", () => {
  it("目的地から最も遠いプレイヤーを選ぶ", () => {
    const map = getMap(MAP_ID);
    const DESTINATION = "hub_kamakura";
    const NODE_A = "wp_komachi2";
    const NODE_B = "hub_fujisawa";

    const distA = shortestDistance(map, NODE_A, DESTINATION, []);
    const distB = shortestDistance(map, NODE_B, DESTINATION, []);
    if (distA === null || distB === null || distA === distB) {
      throw new Error(
        `テスト前提が崩れています: ${NODE_A}(${distA})と${NODE_B}(${distB})の距離が同じか到達不能です。マップデータが変更された可能性があります。`,
      );
    }
    const fartherNodeId = distA > distB ? NODE_A : NODE_B;
    const nearerNodeId = fartherNodeId === NODE_A ? NODE_B : NODE_A;
    const farPlayer = createPlayer("far", "遠い方", 0, fartherNodeId);
    const nearPlayer = createPlayer("near", "近い方", 1, nearerNodeId);

    const ownerId = pickInitialTroubleCharacterOwner(map, [farPlayer, nearPlayer], DESTINATION);

    expect(ownerId).toBe("far");
  });

  it("同距離の場合はその中からランダムに1人選ぶ(タイ以外は選ばれない)", () => {
    const map = getMap(MAP_ID);
    const DESTINATION = "hub_kamakura";
    const NODE_1 = "wp_komachi2";
    const NODE_2 = "hub_fujisawa";

    const dist1 = shortestDistance(map, NODE_1, DESTINATION, []);
    const dist2 = shortestDistance(map, NODE_2, DESTINATION, []);
    if (dist1 === null || dist2 === null || dist1 === dist2) {
      throw new Error(
        `テスト前提が崩れています: ${NODE_1}(${dist1})と${NODE_2}(${dist2})の距離が同じか到達不能です。マップデータが変更された可能性があります。`,
      );
    }
    // p1・p2は同じノード(=同距離・より遠い方)、p3だけ明確に近いノードに置く。
    const fartherNode = dist1 > dist2 ? NODE_1 : NODE_2;
    const nearerNode = dist1 > dist2 ? NODE_2 : NODE_1;
    const p1 = createPlayer("p1", "P1", 0, fartherNode);
    const p2 = createPlayer("p2", "P2", 1, fartherNode);
    const p3 = createPlayer("p3", "P3", 2, nearerNode);

    for (let i = 0; i < 20; i++) {
      const ownerId = pickInitialTroubleCharacterOwner(map, [p1, p2, p3], DESTINATION);
      expect(["p1", "p2"]).toContain(ownerId); // p3(近い方)は絶対に選ばれない
    }
  });
});

describe("checkTroubleCharacterHandoff()", () => {
  it("所有者が別プレイヤーの現在地へ着地すると、そのプレイヤーへ所有者が移る", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");
    const mover = createPlayer("mover", "移動者", 1, "nodeX"); // 同じマスに着地済み

    const result = checkTroubleCharacterHandoff("owner", mover, [owner, mover]);

    expect(result).toEqual({ handedOff: true, newOwnerId: "mover", fromPlayerId: "owner", toPlayerId: "mover" });
  });

  it("別プレイヤーが所有者のマスへ着地しても同じ結果になる(所有者がその場に留まっているだけの対称なケース)", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");
    const mover = createPlayer("mover", "移動者", 1, "nodeX");

    const result = checkTroubleCharacterHandoff("owner", mover, [owner, mover]);

    expect(result.handedOff).toBe(true);
  });

  it("異なるマスにいる場合は交代しない", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");
    const mover = createPlayer("mover", "移動者", 1, "nodeY");

    const result = checkTroubleCharacterHandoff("owner", mover, [owner, mover]);

    expect(result).toEqual({ handedOff: false });
  });

  it("所有者がnull(未登場)なら交代しない", () => {
    const mover = createPlayer("mover", "移動者", 1, "nodeX");

    const result = checkTroubleCharacterHandoff(null, mover, [mover]);

    expect(result).toEqual({ handedOff: false });
  });

  it("moverが既に所有者本人なら交代しない", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");

    const result = checkTroubleCharacterHandoff("owner", owner, [owner]);

    expect(result).toEqual({ handedOff: false });
  });

  it("3人以上が同じマスにいても、その中に所有者が含まれていれば交代する", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");
    const other = createPlayer("other", "第三者", 1, "nodeX");
    const mover = createPlayer("mover", "移動者", 2, "nodeX");

    const result = checkTroubleCharacterHandoff("owner", mover, [owner, other, mover]);

    expect(result).toEqual({ handedOff: true, newOwnerId: "mover", fromPlayerId: "owner", toPlayerId: "mover" });
  });

  it("controlledBy(human/cpu)の組み合わせによらず同じ結果になる", () => {
    const combos: ["human" | "cpu", "human" | "cpu"][] = [
      ["human", "cpu"],
      ["cpu", "human"],
      ["cpu", "cpu"],
      ["human", "human"],
    ];
    for (const [ownerControl, moverControl] of combos) {
      const owner = createPlayer("owner", "所有者", 0, "nodeX", ownerControl);
      const mover = createPlayer("mover", "移動者", 1, "nodeX", moverControl);

      const result = checkTroubleCharacterHandoff("owner", mover, [owner, mover]);

      expect(result.handedOff).toBe(true);
    }
  });
});

describe("drawTroubleCharacterMischief()", () => {
  it("weightに応じて選ばれる(weight0の項目は選ばれない)", () => {
    const pool: TroubleCharacterMischiefDef[] = [
      { id: "always", kind: "money", weight: 100, amount: -10, message: "x" },
      { id: "never", kind: "money", weight: 0, amount: -10, message: "y" },
    ];
    for (let i = 0; i < 10; i++) {
      expect(drawTroubleCharacterMischief(pool).id).toBe("always");
    }
  });

  it("実データ(troubleCharacterMischiefDefs)から必ず1件返す", async () => {
    const { troubleCharacterMischiefDefs } = await import("@/data/troubleCharacterMischief");
    const picked = drawTroubleCharacterMischief(troubleCharacterMischiefDefs);
    expect(troubleCharacterMischiefDefs.map((m) => m.id)).toContain(picked.id);
  });
});

describe("isTroubleCharacterFormId()(S-3a/S-3d/S-3e)", () => {
  it("既知の形態id(\"normal\")はtrueを返す", () => {
    expect(isTroubleCharacterFormId("normal")).toBe(true);
  });

  // S-3d: "sake"を正式な形態idとして追加した。
  it("既知の形態id(\"sake\")もtrueを返す", () => {
    expect(isTroubleCharacterFormId("sake")).toBe(true);
  });

  // S-3e: "seagullKing"を正式な形態id(最終形態)として追加した。
  it("既知の形態id(\"seagullKing\")もtrueを返す", () => {
    expect(isTroubleCharacterFormId("seagullKing")).toBe(true);
  });

  it("未知の文字列・null・undefined・数値等はfalseを返す(旧セーブ/消えたidの安全な判定)", () => {
    expect(isTroubleCharacterFormId("phoenix")).toBe(false); // 存在しない架空の形態id
    expect(isTroubleCharacterFormId("no_such_form")).toBe(false);
    expect(isTroubleCharacterFormId(null)).toBe(false);
    expect(isTroubleCharacterFormId(undefined)).toBe(false);
    expect(isTroubleCharacterFormId(123)).toBe(false);
  });
});

describe("getTroubleCharacterFormDef()(S-3b)", () => {
  it("\"normal\"は必ず見つかり、S-3a未対応時のプレースホルダーcharacterId(\"troubleChar\")を維持する", () => {
    const formDef = getTroubleCharacterFormDef("normal");

    expect(formDef).toBeDefined();
    expect(formDef!.id).toBe("normal");
    expect(formDef!.characterId).toBe("troubleChar");
  });

  it("未知のformIdはundefinedを返す(将来形態を削除/リネームした場合の防御)", () => {
    const formDef = getTroubleCharacterFormDef("no_such_form" as TroubleCharacterFormId);

    expect(formDef).toBeUndefined();
  });

  it("\"normal\"のmischiefPoolは、既存のtroubleCharacterMischiefDefsと同一の配列参照である(複製していない)", () => {
    const formDef = getTroubleCharacterFormDef("normal");

    expect(formDef!.mischiefPool).toBe(troubleCharacterMischiefDefs);
  });

  it("\"normal\"のmischiefPoolは既存3種・weight 40/40/20を1件も変えずに維持している", () => {
    const formDef = getTroubleCharacterFormDef("normal");
    const pool = formDef!.mischiefPool;

    expect(pool).toHaveLength(3);
    expect(pool.map((m) => ({ id: m.id, weight: m.weight }))).toEqual([
      { id: "trouble_money_pinch", weight: 40 },
      { id: "trouble_debuff_halve", weight: 40 },
      { id: "trouble_debuff_skip", weight: 20 },
    ]);

    const money = pool.find((m) => m.id === "trouble_money_pinch");
    expect(money).toMatchObject({ kind: "money", amount: -50 });

    const halve = pool.find((m) => m.id === "trouble_debuff_halve");
    expect(halve).toMatchObject({ kind: "debuff", debuffKind: "halveDiceNextRoll" });

    const skip = pool.find((m) => m.id === "trouble_debuff_skip");
    expect(skip).toMatchObject({ kind: "debuff", debuffKind: "skipNextRoll" });
  });

  it("drawTroubleCharacterMischief()に\"normal\"のmischiefPoolを渡した抽選結果は、常にこの3種のいずれかになる", () => {
    const formDef = getTroubleCharacterFormDef("normal")!;
    for (let i = 0; i < 20; i++) {
      const picked = drawTroubleCharacterMischief(formDef.mischiefPool);
      expect(["trouble_money_pinch", "trouble_debuff_halve", "trouble_debuff_skip"]).toContain(picked.id);
    }
  });
});

describe("troubleCharacterFormDefs(実データ)(S-3d/S-3e)", () => {
  it("normalの正式transform設定がcount3=20%〜7=100%・targetFormId=\"sake\"・minProgressRatio無しになっている", () => {
    const normal = getTroubleCharacterFormDef("normal")!;
    expect(normal.transform).toEqual({
      targetFormId: "sake",
      probabilitySteps: [
        { atCount: 3, probability: 0.2 },
        { atCount: 4, probability: 0.4 },
        { atCount: 5, probability: 0.6 },
        { atCount: 6, probability: 0.8 },
        { atCount: 7, probability: 1 },
      ],
    });
  });

  it("sakeが正式に登録されており、mischiefPoolのweight合計が既存慣習通り100", () => {
    const sake = getTroubleCharacterFormDef("sake")!;
    expect(sake.id).toBe("sake");
    expect(sake.displayName).toBe("酒モンスター");
    expect(sake.mischiefPool.reduce((sum, m) => sum + m.weight, 0)).toBe(100);
  });

  // S-3e: sakeの正式transform設定がcount3=10%〜8=100%・targetFormId="seagullKing"・
  // minProgressRatio=0.7になっている(sakeはもはや進化の終点ではない)。
  it("sakeの正式transform設定がcount3=10%〜8=100%・targetFormId=\"seagullKing\"・minProgressRatio=0.7になっている", () => {
    const sake = getTroubleCharacterFormDef("sake")!;
    expect(sake.transform).toEqual({
      targetFormId: "seagullKing",
      minProgressRatio: 0.7,
      probabilitySteps: [
        { atCount: 3, probability: 0.1 },
        { atCount: 4, probability: 0.2 },
        { atCount: 5, probability: 0.35 },
        { atCount: 6, probability: 0.5 },
        { atCount: 7, probability: 0.75 },
        { atCount: 8, probability: 1 },
      ],
    });
  });

  it("sakeのmischiefPoolに、周囲巻き込み(kind: \"moneyNearby\")が1件以上含まれる", () => {
    const sake = getTroubleCharacterFormDef("sake")!;
    expect(sake.mischiefPool.some((m) => m.kind === "moneyNearby")).toBe(true);
  });

  it("sakeのmischiefPoolはtroubleCharacterMischiefSakeDefsと同一の配列参照である(複製していない)", () => {
    const sake = getTroubleCharacterFormDef("sake")!;
    expect(sake.mischiefPool).toBe(troubleCharacterMischiefSakeDefs);
  });

  it("seagullKingが正式に登録されており、mischiefPoolのweight合計が既存慣習通り100、次の進化先(transform)を持たない(最終形態)", () => {
    const seagullKing = getTroubleCharacterFormDef("seagullKing")!;
    expect(seagullKing.id).toBe("seagullKing");
    expect(seagullKing.displayName).toBe("カモメ魔王");
    expect(seagullKing.mischiefPool.reduce((sum, m) => sum + m.weight, 0)).toBe(100);
    expect(seagullKing.transform).toBeUndefined();
  });

  it("seagullKingのmischiefPoolに、propertyLoss/cardDestroyが1件ずつ含まれる", () => {
    const seagullKing = getTroubleCharacterFormDef("seagullKing")!;
    expect(seagullKing.mischiefPool.filter((m) => m.kind === "propertyLoss")).toHaveLength(1);
    expect(seagullKing.mischiefPool.filter((m) => m.kind === "cardDestroy")).toHaveLength(1);
  });

  it("seagullKingのmischiefPoolはtroubleCharacterMischiefSeagullKingDefsと同一の配列参照である(複製していない)", () => {
    const seagullKing = getTroubleCharacterFormDef("seagullKing")!;
    expect(seagullKing.mischiefPool).toBe(troubleCharacterMischiefSeagullKingDefs);
  });
});

// 正式仕様の変身確率段階表。normal→sake(count3=20%〜7=100%)はS-3dから、
// sake→seagullKing(進行度70%以上限定、count3=10%〜8=100%)はS-3eから、
// data/troubleCharacterForms.tsの実データにも反映済み(上のtroubleCharacterFormDefs(実データ)
// 参照)。decideTroubleCharacterTransform()自体は実データに依存しない純関数なので、
// ここでは既存通り合成データとして独立に検証する(実データとの整合はtroubleCharacterFormDefs
// (実データ)のテストが別途保証する)。
const NORMAL_TO_SAKE_STEPS = [
  { atCount: 3, probability: 0.2 },
  { atCount: 4, probability: 0.4 },
  { atCount: 5, probability: 0.6 },
  { atCount: 6, probability: 0.8 },
  { atCount: 7, probability: 1 },
];
const SAKE_TO_SEAGULL_KING_STEPS = [
  { atCount: 3, probability: 0.1 },
  { atCount: 4, probability: 0.2 },
  { atCount: 5, probability: 0.35 },
  { atCount: 6, probability: 0.5 },
  { atCount: 7, probability: 0.75 },
  { atCount: 8, probability: 1 },
];

/** テスト用の合成TroubleCharacterFormDef。id/characterId/displayName自体は
 *  decideTroubleCharacterTransform()から一切参照されないため、実在するformId("normal")を
 *  そのまま流用する(sake/seagullKingはS-3d/S-3eで実データ化済みで、targetFormIdの
 *  `as TroubleCharacterFormId`キャストは技術的にはもう不要だが、この純関数のテストが実データに
 *  依存しない合成データのままであることを明示する目的で残している)。 */
function makeFormDef(overrides: Partial<TroubleCharacterFormDef> = {}): TroubleCharacterFormDef {
  return {
    id: "normal",
    displayName: "テスト形態",
    characterId: "test_form",
    mischiefPool: [],
    ...overrides,
  };
}

describe("decideTroubleCharacterTransform()(S-3c)", () => {
  it("formDef.transformが無い(進化の終点)場合は、count・randomに関わらず常にtransformed:falseを返す", () => {
    const formDef = makeFormDef(); // transform省略 = 進化の終点(seagullKing想定)
    for (const random of [0, 0.5, 0.999]) {
      const decision = decideTroubleCharacterTransform({
        formDef,
        possessionCount: 999,
        currentTurn: 999,
        totalTurns: 1000,
        random,
      });
      expect(decision).toEqual({ transformed: false });
    }
  });

  it("閾値未満(count<最初の段階のatCount)は、randomがどんなに小さくてもtransformed:falseを返す", () => {
    const formDef = makeFormDef({
      transform: { targetFormId: "sake" as TroubleCharacterFormId, probabilitySteps: NORMAL_TO_SAKE_STEPS },
    });
    const decision = decideTroubleCharacterTransform({
      formDef,
      possessionCount: 2, // 最初の段階(atCount:3)未満
      currentTurn: 1,
      totalTurns: 12,
      random: 0, // 最も成立しやすい値ですら不成立になるはず
    });
    expect(decision).toEqual({ transformed: false });
  });

  it("抽選成功: 閾値到達後、randomが確率を下回れば変身し、targetFormIdを返す", () => {
    const formDef = makeFormDef({
      transform: { targetFormId: "sake" as TroubleCharacterFormId, probabilitySteps: NORMAL_TO_SAKE_STEPS },
    });
    const decision = decideTroubleCharacterTransform({
      formDef,
      possessionCount: 3, // 20%段階
      currentTurn: 1,
      totalTurns: 12,
      random: 0.1, // 0.1 < 0.2 なので成立
    });
    expect(decision).toEqual({ transformed: true, nextFormId: "sake" });
  });

  it("抽選失敗: 閾値到達後でも、randomが確率以上なら変身しない", () => {
    const formDef = makeFormDef({
      transform: { targetFormId: "sake" as TroubleCharacterFormId, probabilitySteps: NORMAL_TO_SAKE_STEPS },
    });
    const decision = decideTroubleCharacterTransform({
      formDef,
      possessionCount: 3, // 20%段階
      currentTurn: 1,
      totalTurns: 12,
      random: 0.2, // 0.2 < 0.2 は偽なので不成立(境界値ちょうど)
    });
    expect(decision).toEqual({ transformed: false });
  });

  it("確率上昇: countが増えるほど、同じrandom値でも成立しやすくなる", () => {
    const formDef = makeFormDef({
      transform: { targetFormId: "sake" as TroubleCharacterFormId, probabilitySteps: NORMAL_TO_SAKE_STEPS },
    });
    const random = 0.5;
    // count3(20%)・count4(40%)ではrandom=0.5は上回るため不成立
    expect(decideTroubleCharacterTransform({ formDef, possessionCount: 3, currentTurn: 1, totalTurns: 12, random })).toEqual({
      transformed: false,
    });
    expect(decideTroubleCharacterTransform({ formDef, possessionCount: 4, currentTurn: 1, totalTurns: 12, random })).toEqual({
      transformed: false,
    });
    // count5(60%)以降はrandom=0.5を上回るため成立する
    expect(decideTroubleCharacterTransform({ formDef, possessionCount: 5, currentTurn: 1, totalTurns: 12, random })).toEqual({
      transformed: true,
      nextFormId: "sake",
    });
  });

  it("100%確定(pity相当): 最後の段階(probability:1)に到達すると、randomの値に関わらず必ず変身する", () => {
    const formDef = makeFormDef({
      transform: { targetFormId: "sake" as TroubleCharacterFormId, probabilitySteps: NORMAL_TO_SAKE_STEPS },
    });
    for (const random of [0, 0.5, 0.999999]) {
      const decision = decideTroubleCharacterTransform({ formDef, possessionCount: 7, currentTurn: 1, totalTurns: 12, random });
      expect(decision).toEqual({ transformed: true, nextFormId: "sake" });
    }
    // countが最後の段階(atCount:7)を超えても、上限の確率(1)が保たれる
    const decisionBeyond = decideTroubleCharacterTransform({ formDef, possessionCount: 20, currentTurn: 1, totalTurns: 12, random: 0.999999 });
    expect(decisionBeyond).toEqual({ transformed: true, nextFormId: "sake" });
  });

  it("進行度gate未達(minProgressRatio指定・現在の進行割合がそれ未満): 抽選条件を満たしていてもtransformed:falseを返す", () => {
    const formDef = makeFormDef({
      transform: {
        targetFormId: "seagullKing" as TroubleCharacterFormId,
        minProgressRatio: 0.7,
        probabilitySteps: SAKE_TO_SEAGULL_KING_STEPS,
      },
    });
    // count8=100%相当・random=0でも、進行度が70%未満なら不成立
    const decision = decideTroubleCharacterTransform({
      formDef,
      possessionCount: 8,
      currentTurn: 20, // 20/60 ≒ 33%
      totalTurns: 60,
      random: 0,
    });
    expect(decision).toEqual({ transformed: false });
  });

  it("進行度gate到達(currentTurn/totalTurnsがminProgressRatio以上): 通常通り抽選が行われる", () => {
    const formDef = makeFormDef({
      transform: {
        targetFormId: "seagullKing" as TroubleCharacterFormId,
        minProgressRatio: 0.7,
        probabilitySteps: SAKE_TO_SEAGULL_KING_STEPS,
      },
    });
    const decision = decideTroubleCharacterTransform({
      formDef,
      possessionCount: 8,
      currentTurn: 42, // 42/60 = 70%ちょうど
      totalTurns: 60,
      random: 0.999999,
    });
    expect(decision).toEqual({ transformed: true, nextFormId: "seagullKing" });
  });

  // fail-closed方針(設定ミスで強い形態を誤って解禁しない): minProgressRatioが
  // `Number.isFinite(x) && 0<=x<=1`を満たさない値は、例外を投げる代わりに常に
  // {transformed:false}(未解禁)として扱う。count8=100%相当・random=0という「他の条件は
  // すべて成立する」組み合わせでも、ratio自体が不正なら変身しないことを確認する。
  it.each([
    ["負数(-1)", -1],
    ["1超(1.5)", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("minProgressRatioが範囲外(%s)の場合、例外を投げずtransformed:falseを返す(fail-closed)", (_label, badRatio) => {
    const formDef = makeFormDef({
      transform: {
        targetFormId: "seagullKing" as TroubleCharacterFormId,
        minProgressRatio: badRatio,
        probabilitySteps: SAKE_TO_SEAGULL_KING_STEPS,
      },
    });
    const call = () => decideTroubleCharacterTransform({ formDef, possessionCount: 8, currentTurn: 999, totalTurns: 1000, random: 0 });
    expect(call).not.toThrow();
    expect(call()).toEqual({ transformed: false });
  });

  it("minProgressRatio: 0(下限)は有効な値として扱われ、進行度0からでも通常通り判定できる", () => {
    const formDef = makeFormDef({
      transform: {
        targetFormId: "sake" as TroubleCharacterFormId,
        minProgressRatio: 0,
        probabilitySteps: NORMAL_TO_SAKE_STEPS,
      },
    });
    // ゲーム開始直後(currentTurn=1)でも、ratio=0ならgate自体は通過し、あとは通常の確率判定に委ねられる。
    expect(decideTroubleCharacterTransform({ formDef, possessionCount: 7, currentTurn: 1, totalTurns: 12, random: 0.999999 })).toEqual({
      transformed: true,
      nextFormId: "sake",
    });
  });

  it("minProgressRatio: 1(上限)は有効な値として扱われ、進行度がちょうど100%(ゲーム最終ターン)に到達したときのみ判定される", () => {
    const formDef = makeFormDef({
      transform: {
        targetFormId: "seagullKing" as TroubleCharacterFormId,
        minProgressRatio: 1,
        probabilitySteps: SAKE_TO_SEAGULL_KING_STEPS,
      },
    });
    // 99%(未到達)ではgateを通過しない。
    expect(decideTroubleCharacterTransform({ formDef, possessionCount: 8, currentTurn: 59, totalTurns: 60, random: 0 })).toEqual({
      transformed: false,
    });
    // ちょうど100%に到達すればgateを通過し、通常の確率判定(count8=100%)で成立する。
    expect(decideTroubleCharacterTransform({ formDef, possessionCount: 8, currentTurn: 60, totalTurns: 60, random: 0.999999 })).toEqual({
      transformed: true,
      nextFormId: "seagullKing",
    });
  });

  it("totalTurns<=0という異常値でも例外を投げず、minProgressRatio指定時は常にtransformed:falseを返す", () => {
    const formDef = makeFormDef({
      transform: {
        targetFormId: "seagullKing" as TroubleCharacterFormId,
        minProgressRatio: 0.7,
        probabilitySteps: SAKE_TO_SEAGULL_KING_STEPS,
      },
    });
    const call = () => decideTroubleCharacterTransform({ formDef, possessionCount: 8, currentTurn: 0, totalTurns: 0, random: 0 });
    expect(call).not.toThrow();
    expect(call()).toEqual({ transformed: false });
  });
});

describe("applyTroubleCharacterMischief()", () => {
  it("money種別: 所持金が加算される(マイナス額なら減る)", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");
    const other = createPlayer("other", "他プレイヤー", 1, "nodeY");
    const mischief: TroubleCharacterMischiefDef = { id: "m", kind: "money", weight: 1, amount: -50, message: "テスト" };

    // money種別はmap引数を一切参照しないため、実マップをそのまま渡せば十分(nodeX/nodeYは
    // 実マップ上のノードではないが、findNearbyPlayerIds()はmoneyNearby種別でしか呼ばれない)。
    const result = applyTroubleCharacterMischief([owner, other], "owner", mischief, getMap(MAP_ID));

    const updatedOwner = result.players.find((p) => p.id === "owner")!;
    const updatedOther = result.players.find((p) => p.id === "other")!;
    expect(updatedOwner.money).toBe(owner.money - 50);
    expect(updatedOther.money).toBe(other.money); // 他プレイヤーは影響を受けない
    expect(result.logMessage).toContain("-50万円");
  });

  it("money種別: 所持金がマイナスになることを許容する(フロア処理をしない)", () => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), money: 10 };
    const mischief: TroubleCharacterMischiefDef = { id: "m", kind: "money", weight: 1, amount: -50, message: "テスト" };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, getMap(MAP_ID));

    expect(result.players[0].money).toBe(-40);
  });

  it("debuff種別: 既存のActiveDebuffと同じ形で所有者自身へ付与される", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "debuff",
      weight: 1,
      debuffKind: "halveDiceNextRoll",
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, getMap(MAP_ID));

    const updatedOwner = result.players.find((p) => p.id === "owner")!;
    expect(updatedOwner.activeDebuffs).toHaveLength(1);
    expect(updatedOwner.activeDebuffs[0]).toMatchObject({
      kind: "halveDiceNextRoll",
      sourcePlayerId: TROUBLE_CHARACTER_SOURCE_ID,
      sourceCardName: TROUBLE_CHARACTER_SOURCE_NAME,
    });
    expect(typeof updatedOwner.activeDebuffs[0].id).toBe("string");
  });
});

describe("applyTroubleCharacterMischief(): moneyNearby種別(S-3d、酒モンスターの周囲巻き込み)", () => {
  const map = getMap(MAP_ID);
  const OWNER_NODE = "wp_komachi2";
  // 実マップ上、OWNER_NODEから直結(道路グラフ上1 edge)のノードを動的に取得する
  // (座標や特定ノードIDをハードコードせず、既存テストと同じ「都度計算する」方針に揃える)。
  const NEARBY_NODE = map.nodes.find((n) => n.id === OWNER_NODE)!.connections[0].to;
  // gameStore.troubleCharacter.test.tsで検証済み: wp_komachi2からhub_kamakuraまでは3マス
  // (TROUBLE_CHARACTER_NEARBY_MAX_DISTANCE=1を明確に超える「範囲外」の例として使う)。
  const FAR_NODE = "hub_kamakura";

  it("TROUBLE_CHARACTER_NEARBY_MAX_DISTANCEは1(同じマス/隣接1マスまでが対象)である", () => {
    expect(TROUBLE_CHARACTER_NEARBY_MAX_DISTANCE).toBe(1);
  });

  it("所有者からグラフ距離1以内(隣接1マス)のプレイヤーはnearbyAmountの影響を受け、範囲外(距離3)のプレイヤーは影響を受けない", () => {
    const owner = createPlayer("owner", "所有者", 0, OWNER_NODE);
    const nearby = createPlayer("nearby", "近くの人", 1, NEARBY_NODE);
    const far = createPlayer("far", "遠くの人", 2, FAR_NODE);
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "moneyNearby",
      weight: 1,
      ownerAmount: -30,
      nearbyAmount: -10,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner, nearby, far], "owner", mischief, map);

    const updatedOwner = result.players.find((p) => p.id === "owner")!;
    const updatedNearby = result.players.find((p) => p.id === "nearby")!;
    const updatedFar = result.players.find((p) => p.id === "far")!;
    expect(updatedOwner.money).toBe(owner.money - 30);
    expect(updatedNearby.money).toBe(nearby.money - 10);
    expect(updatedFar.money).toBe(far.money); // 範囲外は影響を受けない
    expect(result.logMessage).toContain("近くの人");
    expect(result.logMessage).not.toContain("遠くの人");
  });

  it("所有者と同じマス(距離0)にいるプレイヤーも巻き込み対象になる", () => {
    const owner = createPlayer("owner", "所有者", 0, OWNER_NODE);
    const sameSpot = createPlayer("sameSpot", "同じマスの人", 1, OWNER_NODE);
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "moneyNearby",
      weight: 1,
      ownerAmount: -30,
      nearbyAmount: -10,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner, sameSpot], "owner", mischief, map);

    expect(result.players.find((p) => p.id === "sameSpot")!.money).toBe(sameSpot.money - 10);
  });

  it("巻き添えが0人でも所有者への効果は適用され、例外にならない", () => {
    const owner = createPlayer("owner", "所有者", 0, OWNER_NODE);
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "moneyNearby",
      weight: 1,
      ownerAmount: -30,
      nearbyAmount: -10,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].money).toBe(owner.money - 30);
    expect(result.logMessage).toContain("幸い巻き添えは出なかった");
  });
});

describe("applyTroubleCharacterMischief(): propertyLoss種別(S-3e、カモメ魔王の物件被害)", () => {
  const map = getMap(MAP_ID);
  // 実データ(data/properties.ts)から動的に2件借用する(idをハードコードせず、既存テストと
  // 同じ「都度計算する」方針に揃える)。
  const [PROPERTY_A, PROPERTY_B] = propertyDefs.slice(0, 2).map((def) => def.id);

  it("所有物件がある場合、そのうち1件がownedPropertyIdsから除去され未所有へ戻る(所持金は変化しない)", () => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), ownedPropertyIds: [PROPERTY_A, PROPERTY_B] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "propertyLoss",
      weight: 1,
      fallbackAmount: -100,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    const updatedOwner = result.players[0];
    expect(updatedOwner.ownedPropertyIds).toHaveLength(1); // 2件のうち1件だけ失う
    expect([PROPERTY_A, PROPERTY_B]).toContain(updatedOwner.ownedPropertyIds[0]); // 残った方も既存2件のいずれか
    expect(updatedOwner.money).toBe(owner.money); // 所持金には影響しない
  });

  // S-3e QA: Math.floor(Math.random() * length)によるindex選択を、固定random値でdeterministicに
  // 検証する。random=0 -> floor(0*2)=index0(PROPERTY_A)、random=0.6 -> floor(1.2)=index1
  // (PROPERTY_B)を狙い撃ちし、「狙った1件だけが消え、もう1件は残る」ことを確認する。
  it("random=0(先頭寄り)のとき、必ず配列先頭(PROPERTY_A)が選ばれ、PROPERTY_Bは残る", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), ownedPropertyIds: [PROPERTY_A, PROPERTY_B] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "propertyLoss",
      weight: 1,
      fallbackAmount: -100,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].ownedPropertyIds).toEqual([PROPERTY_B]);
  });

  it("random=0.6(末尾寄り)のとき、必ず配列末尾(PROPERTY_B)が選ばれ、PROPERTY_Aは残る", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.6); // floor(0.6 * 2) = 1(末尾index)
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), ownedPropertyIds: [PROPERTY_A, PROPERTY_B] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "propertyLoss",
      weight: 1,
      fallbackAmount: -100,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].ownedPropertyIds).toEqual([PROPERTY_A]);
  });

  it("所有物件が1件だけの場合、その1件を失いownedPropertyIdsが空になる", () => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), ownedPropertyIds: [PROPERTY_A] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "propertyLoss",
      weight: 1,
      fallbackAmount: -100,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].ownedPropertyIds).toEqual([]);
    expect(result.logMessage).toContain(getPropertyDef(PROPERTY_A)!.name);
  });

  it("所有物件が0件の場合、物件は失わずfallbackAmountが所持金に適用される", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX"); // ownedPropertyIds: []
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "propertyLoss",
      weight: 1,
      fallbackAmount: -100,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].ownedPropertyIds).toEqual([]);
    expect(result.players[0].money).toBe(owner.money - 100);
    expect(result.logMessage).toContain("-100万円");
  });

  it("所有者以外のプレイヤーの物件には影響しない", () => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), ownedPropertyIds: [PROPERTY_A] };
    const other = { ...createPlayer("other", "他プレイヤー", 1, "nodeY"), ownedPropertyIds: [PROPERTY_B] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "propertyLoss",
      weight: 1,
      fallbackAmount: -100,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner, other], "owner", mischief, map);

    expect(result.players.find((p) => p.id === "other")!.ownedPropertyIds).toEqual([PROPERTY_B]);
  });
});

describe("applyTroubleCharacterMischief(): cardDestroy種別(S-3e、カモメ魔王のカード大量破壊)", () => {
  const map = getMap(MAP_ID);
  // 実データ(data/cards.ts)から、usable種別(card_dice_again)とkey種別(card_shortcut)を
  // それぞれ1つ実際の定義を確認した上で使う(文字列を推測しない)。
  const USABLE_CARD_A = "card_dice_again";
  const USABLE_CARD_B = "card_double_move";
  const USABLE_CARD_C = "card_warp_anywhere";
  const KEY_CARD = "card_shortcut";

  it("破壊可能なカードが3枚を超える場合、ランダムに最大3枚(maxCount)だけ破壊され残りは維持される", () => {
    const owner = {
      ...createPlayer("owner", "所有者", 0, "nodeX"),
      cardIds: [USABLE_CARD_A, USABLE_CARD_B, USABLE_CARD_C, USABLE_CARD_A],
    };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "cardDestroy",
      weight: 1,
      maxCount: 3,
      excludeKeyCards: true,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].cardIds).toHaveLength(1); // 4枚のうち3枚だけ破壊される
  });

  it("破壊可能なカードがmaxCount未満の場合、持っている分だけ全て破壊される", () => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), cardIds: [USABLE_CARD_A] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "cardDestroy",
      weight: 1,
      maxCount: 3,
      excludeKeyCards: true,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].cardIds).toEqual([]);
    expect(result.logMessage).toContain(getCardDef(USABLE_CARD_A)!.name);
  });

  it("手札が0枚の場合、実害なく安全に完了する", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX"); // cardIds: []
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "cardDestroy",
      weight: 1,
      maxCount: 3,
      excludeKeyCards: true,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].cardIds).toEqual([]);
    expect(result.logMessage).toContain("実害は無かった");
  });

  it("excludeKeyCards: trueの場合、CardDef.kind===\"key\"のカード(裏道パス等)はrandom値に関わらず破壊対象に選ばれない(候補そのものから除外されるため)", () => {
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "cardDestroy",
      weight: 1,
      maxCount: 3,
      excludeKeyCards: true,
      message: "テスト",
    };
    expect(getCardDef(KEY_CARD)!.kind).toBe("key"); // 前提: 実データでkey種別であることを確認

    // keyカードはpickRandomDistinct()へ渡す候補配列を作る時点(excludeKeyCardsフィルタ)で
    // 除外されるため、random値がどうであれ結果に影響しないはず、という前提を実Math.random()の
    // 反復ではなく固定値(0/中間/1直前)でdeterministicに裏付ける。
    for (const randomValue of [0, 0.5, 0.999999]) {
      vi.spyOn(Math, "random").mockReturnValue(randomValue);
      const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), cardIds: [KEY_CARD, USABLE_CARD_A] };
      const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);
      expect(result.players[0].cardIds).toContain(KEY_CARD); // keyカードは常に生き残る
      expect(result.players[0].cardIds).not.toContain(USABLE_CARD_A); // usableは破壊される
    }
  });

  it("破壊可能なカードがkeyカードのみの場合(excludeKeyCards: true)、破壊対象が無く実害なしで完了する", () => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), cardIds: [KEY_CARD] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "cardDestroy",
      weight: 1,
      maxCount: 3,
      excludeKeyCards: true,
      message: "テスト",
    };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].cardIds).toEqual([KEY_CARD]); // keyカードは維持される
    expect(result.logMessage).toContain("実害は無かった");
  });

  it("excludeKeyCards: falseの場合、keyカードも破壊対象に含まれうる", () => {
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "cardDestroy",
      weight: 1,
      maxCount: 1,
      excludeKeyCards: false,
      message: "テスト",
    };

    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), cardIds: [KEY_CARD] };
    const result = applyTroubleCharacterMischief([owner], "owner", mischief, map);

    expect(result.players[0].cardIds).toEqual([]); // 唯一のkeyカードも破壊される
  });

  // S-3e QA: TroubleCharacterMischiefDef.cardDestroy.maxCountはnumber型のため、データ側の
  // 異常値(小数・NaN等)が混入しても、pickRandomDistinct()のfail-closed処理により
  // 意図しない大量削除・例外が起きず「0枚破壊(実害なし)」に安全に倒れることを確認する。
  it.each([
    ["非整数(2.5)", 2.5],
    ["NaN", NaN],
  ])("maxCountが異常値(%s)の場合、例外を投げず0枚破壊(実害なし)に倒れる", (_label, badMaxCount) => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), cardIds: [USABLE_CARD_A, USABLE_CARD_B, USABLE_CARD_C] };
    const mischief: TroubleCharacterMischiefDef = {
      id: "m",
      kind: "cardDestroy",
      weight: 1,
      maxCount: badMaxCount,
      excludeKeyCards: true,
      message: "テスト",
    };

    const call = () => applyTroubleCharacterMischief([owner], "owner", mischief, map);
    expect(call).not.toThrow();
    const result = call();
    expect(result.players[0].cardIds).toEqual([USABLE_CARD_A, USABLE_CARD_B, USABLE_CARD_C]); // 1枚も減らない
  });
});

// S-3e QA: pickRandomDistinct()の境界値監査。cardDestroy種別のmaxCountに異常なデータ
// (非有限・非整数・負数等)が入っても、無限ループ・例外・意図しない大量削除が起きないことを
// 直接検証する(applyTroubleCharacterMischief経由の間接検証だけでなく、この汎用ヘルパー自体を
// 単体でも保証する)。
describe("pickRandomDistinct()の境界値(S-3e QA)", () => {
  it("items=[]なら、countがどんな値でも空配列を返す(例外・無限ループにならない)", () => {
    expect(pickRandomDistinct([], 3)).toEqual([]);
    expect(pickRandomDistinct([], 0)).toEqual([]);
    expect(pickRandomDistinct([], -1)).toEqual([]);
    expect(pickRandomDistinct([], Infinity)).toEqual([]);
  });

  it("count=0なら、items件数に関わらず空配列を返す", () => {
    expect(pickRandomDistinct(["a", "b", "c"], 0)).toEqual([]);
  });

  it("count<0(負数)なら、fail-closedで0件選択になる", () => {
    expect(pickRandomDistinct(["a", "b", "c"], -1)).toEqual([]);
    expect(pickRandomDistinct(["a", "b", "c"], -100)).toEqual([]);
  });

  it("count>items.lengthなら、items.lengthへclampされ全件(順序はシャッフルされうる)を返す", () => {
    const result = pickRandomDistinct(["a", "b", "c"], 10);
    expect(result).toHaveLength(3);
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("countが整数でない(小数)場合、fail-closedで0件選択になる(修正前は切り上げ相当で意図しない件数を返す不具合があった)", () => {
    expect(pickRandomDistinct(["a", "b", "c", "d", "e"], 2.5)).toEqual([]);
    expect(pickRandomDistinct(["a", "b", "c", "d", "e"], 2.1)).toEqual([]);
    expect(pickRandomDistinct(["a", "b", "c", "d", "e"], 2.9)).toEqual([]);
  });

  it("countがNaNなら、fail-closedで0件選択になる", () => {
    expect(pickRandomDistinct(["a", "b", "c"], NaN)).toEqual([]);
  });

  // Infinityは「有限な正の整数」ではない(Number.isInteger(Infinity)はfalse)ため、
  // items.lengthへのclamp対象にはならず、fail-closedで0件選択になる(無限ループにはならない)。
  it("countがInfinityなら、fail-closedで0件選択になる(無限ループにならない)", () => {
    expect(pickRandomDistinct(["a", "b", "c"], Infinity)).toEqual([]);
  });

  it("countが-Infinityなら、fail-closedで0件選択になる", () => {
    expect(pickRandomDistinct(["a", "b", "c"], -Infinity)).toEqual([]);
  });

  it("正常値(count=3、正の整数)の挙動は変更されていない: 3件の配列から重複無く3件全て選ばれる", () => {
    const result = pickRandomDistinct(["a", "b", "c"], 3);
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("正常値(count=2、items=5件)の挙動は変更されていない: 重複無く2件選ばれる", () => {
    const result = pickRandomDistinct(["a", "b", "c", "d", "e"], 2);
    expect(result).toHaveLength(2);
    expect(new Set(result).size).toBe(2); // 重複が無い
  });
});
