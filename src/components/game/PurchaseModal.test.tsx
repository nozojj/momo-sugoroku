// @vitest-environment jsdom
//
// PurchaseModal.tsx(Phase10/P10-2で効果音を追加)の自動テスト。
// マウント時点のownedPropertyIds件数を基準に、増えた瞬間だけproperty_buyが鳴ることを検証する。
// CPUのbuyProperty()直接呼び出しもこのコンポーネントが受け取るplayer propの変化として
// 観測できるため、ここではクリックイベントではなくprops(player)の変化で購入を模す。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { PurchaseModal } from "./PurchaseModal";
import type { Player } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

const GROUP_ID = "grp_fujisawa_ekimae";

function buildPlayer(ownedPropertyIds: string[]): Player {
  return {
    id: "p1",
    name: "テストP1",
    color: "#000",
    controlledBy: "human",
    carIcon: "🚗",
    currentNodeId: "hub_fujisawa",
    moveHistory: ["hub_fujisawa"],
    money: 5000,
    ownedPropertyIds,
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
  };
}

afterEach(() => {
  cleanup();
  playSEMock.mockClear();
});

describe("PurchaseModal", () => {
  it("マウント直後は鳴らない(基準値取得のみ)", () => {
    const player = buildPlayer([]);
    render(<PurchaseModal groupId={GROUP_ID} player={player} players={[player]} onBuy={() => {}} onFinish={() => {}} />);

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("ownedPropertyIdsが1件増える再レンダーでproperty_buyが1回鳴る", () => {
    const player = buildPlayer([]);
    const { rerender } = render(
      <PurchaseModal groupId={GROUP_ID} player={player} players={[player]} onBuy={() => {}} onFinish={() => {}} />,
    );

    const boughtOne = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    rerender(
      <PurchaseModal groupId={GROUP_ID} player={boughtOne} players={[boughtOne]} onBuy={() => {}} onFinish={() => {}} />,
    );

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("property_buy");
  });

  it("CPUのまとめ買い(2件同時増加)でもproperty_buyは1回だけ鳴る", () => {
    const player = buildPlayer([]);
    const { rerender } = render(
      <PurchaseModal groupId={GROUP_ID} player={player} players={[player]} onBuy={() => {}} onFinish={() => {}} />,
    );

    const boughtTwo = buildPlayer(["wp_fj_nw_rk_bend_prop", "r_fj_kg_1_prop"]);
    rerender(
      <PurchaseModal groupId={GROUP_ID} player={boughtTwo} players={[boughtTwo]} onBuy={() => {}} onFinish={() => {}} />,
    );

    expect(playSEMock).toHaveBeenCalledTimes(1);
  });

  it("ownedPropertyIdsが変化しない再レンダー(所持金など無関係な変化)では鳴らない", () => {
    const player = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    const { rerender } = render(
      <PurchaseModal groupId={GROUP_ID} player={player} players={[player]} onBuy={() => {}} onFinish={() => {}} />,
    );

    const moneyChanged = { ...player, money: 4000 };
    rerender(
      <PurchaseModal groupId={GROUP_ID} player={moneyChanged} players={[moneyChanged]} onBuy={() => {}} onFinish={() => {}} />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });
});
