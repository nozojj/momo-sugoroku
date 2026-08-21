import { describe, expect, it } from "vitest";
import { LABEL_DECLUTTER_MIN_DIST, resolveVisibleLabelIds, type LabelCandidate } from "@/lib/game/boardLabels";
import { shonanFullMap } from "@/data/maps";

describe("resolveVisibleLabelIds", () => {
  it("優先度0(駅)は互いに近くても常に表示する", () => {
    const candidates: LabelCandidate[] = [
      { id: "hub_a", x: 0, y: 0, priority: 0 },
      { id: "hub_b", x: 5, y: 0, priority: 0 },
    ];
    const visible = resolveVisibleLabelIds(candidates);
    expect(visible.has("hub_a")).toBe(true);
    expect(visible.has("hub_b")).toBe(true);
  });

  it("優先度0(駅)に近い優先度1(物件)は間引かれる", () => {
    const candidates: LabelCandidate[] = [
      { id: "hub_a", x: 0, y: 0, priority: 0 },
      { id: "prop_near", x: 10, y: 0, priority: 1 }, // 距離10 < 閾値
    ];
    const visible = resolveVisibleLabelIds(candidates);
    expect(visible.has("hub_a")).toBe(true);
    expect(visible.has("prop_near")).toBe(false);
  });

  it("閾値以上離れた物件同士はどちらも表示される", () => {
    const candidates: LabelCandidate[] = [
      { id: "prop_a", x: 0, y: 0, priority: 1 },
      { id: "prop_b", x: LABEL_DECLUTTER_MIN_DIST + 1, y: 0, priority: 1 },
    ];
    const visible = resolveVisibleLabelIds(candidates);
    expect(visible.has("prop_a")).toBe(true);
    expect(visible.has("prop_b")).toBe(true);
  });

  it("閾値未満で近接する物件同士は決定的にid昇順の一方だけが残る", () => {
    const candidates: LabelCandidate[] = [
      { id: "prop_z", x: 0, y: 0, priority: 1 },
      { id: "prop_a", x: 5, y: 0, priority: 1 },
    ];
    const visible = resolveVisibleLabelIds(candidates);
    expect(visible.has("prop_a")).toBe(true);
    expect(visible.has("prop_z")).toBe(false);
  });

  it("入力配列の並び順を変えても結果は変わらない(順序非依存)", () => {
    const a: LabelCandidate[] = [
      { id: "prop_a", x: 0, y: 0, priority: 1 },
      { id: "prop_b", x: 5, y: 0, priority: 1 },
      { id: "hub_x", x: 100, y: 100, priority: 0 },
    ];
    const b = [a[2], a[0], a[1]];
    const visibleA = resolveVisibleLabelIds(a);
    const visibleB = resolveVisibleLabelIds(b);
    expect([...visibleA].sort()).toEqual([...visibleB].sort());
  });

  it("同じ入力を複数回呼んでも常に同じ結果になる(決定的)", () => {
    const candidates: LabelCandidate[] = [
      { id: "prop_c", x: 0, y: 0, priority: 1 },
      { id: "prop_a", x: 8, y: 0, priority: 1 },
      { id: "prop_b", x: 16, y: 0, priority: 1 },
      { id: "hub_x", x: 500, y: 500, priority: 0 },
    ];
    const first = resolveVisibleLabelIds(candidates);
    const second = resolveVisibleLabelIds(candidates);
    expect([...first].sort()).toEqual([...second].sort());
  });

  it("疎らな物件(閾値より十分離れている)は従来通りすべて表示される", () => {
    const candidates: LabelCandidate[] = [
      { id: "prop_1", x: 0, y: 0, priority: 1 },
      { id: "prop_2", x: 200, y: 0, priority: 1 },
      { id: "prop_3", x: 400, y: 0, priority: 1 },
      { id: "prop_4", x: 0, y: 300, priority: 1 },
    ];
    const visible = resolveVisibleLabelIds(candidates);
    expect(visible.size).toBe(4);
  });

  describe("実データ(shonan-full + overrides)での密集区画", () => {
    function candidatesFor(nodeIds: string[]): LabelCandidate[] {
      const byId = new Map(shonanFullMap.nodes.map((n) => [n.id, n]));
      return nodeIds.map((id) => {
        const node = byId.get(id);
        if (!node) throw new Error(`fixture node not found: ${id}`);
        return { id: node.id, x: node.x, y: node.y, priority: node.isMajorHub || node.isDestinationCandidate ? 0 : 1 };
      });
    }

    it("藤沢ロータリー周辺: 藤沢駅ラベルは必ず残る", () => {
      const ids = ["hub_fujisawa", "r_fj_kg_1", "r_fj_kg_2", "r_rk_fj_4", "r_fjrt_ring4_1"];
      const visible = resolveVisibleLabelIds(candidatesFor(ids));
      expect(visible.has("hub_fujisawa")).toBe(true);
    });

    it("鎌倉小路周辺: 鎌倉駅ラベルは必ず残る", () => {
      const ids = ["hub_kamakura", "r_kmlp_gate_kmlp_n_1"];
      const visible = resolveVisibleLabelIds(candidatesFor(ids));
      expect(visible.has("hub_kamakura")).toBe(true);
    });

    it("江の島参道周辺: 江の島駅ラベルは必ず残る", () => {
      const ids = ["hub_enoshima", "enlp_se", "enlp_sw"];
      const visible = resolveVisibleLabelIds(candidatesFor(ids));
      expect(visible.has("hub_enoshima")).toBe(true);
    });

    it("田村北周辺: 近接する2件のうち1件だけが残る", () => {
      const ids = ["wp_tamura_kado", "tmlp_w"];
      const visible = resolveVisibleLabelIds(candidatesFor(ids));
      expect(visible.size).toBe(1);
    });

    it("辻堂緑ヶ浜周辺: 近接する2件のうち1件だけが残る", () => {
      const ids = ["tssp_sw", "tsmd_nw"];
      const visible = resolveVisibleLabelIds(candidatesFor(ids));
      expect(visible.size).toBe(1);
    });
  });
});
