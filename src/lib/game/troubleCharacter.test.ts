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
  TROUBLE_CHARACTER_SOURCE_ID,
  TROUBLE_CHARACTER_SOURCE_NAME,
} from "@/lib/game/troubleCharacter";
import { troubleCharacterMischiefDefs } from "@/data/troubleCharacterMischief";
import type { TroubleCharacterFormId, TroubleCharacterMischiefDef } from "@/types/game";

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

describe("isTroubleCharacterFormId()(S-3a)", () => {
  it("既知の形態id(\"normal\")はtrueを返す", () => {
    expect(isTroubleCharacterFormId("normal")).toBe(true);
  });

  it("未知の文字列・null・undefined・数値等はfalseを返す(旧セーブ/消えたidの安全な判定)", () => {
    expect(isTroubleCharacterFormId("sake")).toBe(false); // まだ存在しない将来の形態id
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

describe("applyTroubleCharacterMischief()", () => {
  it("money種別: 所持金が加算される(マイナス額なら減る)", () => {
    const owner = createPlayer("owner", "所有者", 0, "nodeX");
    const other = createPlayer("other", "他プレイヤー", 1, "nodeY");
    const mischief: TroubleCharacterMischiefDef = { id: "m", kind: "money", weight: 1, amount: -50, message: "テスト" };

    const result = applyTroubleCharacterMischief([owner, other], "owner", mischief);

    const updatedOwner = result.players.find((p) => p.id === "owner")!;
    const updatedOther = result.players.find((p) => p.id === "other")!;
    expect(updatedOwner.money).toBe(owner.money - 50);
    expect(updatedOther.money).toBe(other.money); // 他プレイヤーは影響を受けない
    expect(result.logMessage).toContain("-50万円");
  });

  it("money種別: 所持金がマイナスになることを許容する(フロア処理をしない)", () => {
    const owner = { ...createPlayer("owner", "所有者", 0, "nodeX"), money: 10 };
    const mischief: TroubleCharacterMischiefDef = { id: "m", kind: "money", weight: 1, amount: -50, message: "テスト" };

    const result = applyTroubleCharacterMischief([owner], "owner", mischief);

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

    const result = applyTroubleCharacterMischief([owner], "owner", mischief);

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
