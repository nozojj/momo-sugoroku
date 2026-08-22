// @vitest-environment jsdom
//
// PurchaseModal.tsx(Phase10/P10-2で効果音を追加、P10-4-5でmonopolyAchievementによる
// property_buy抑制を追加)の自動テスト。
// マウント時点のownedPropertyIds件数を基準に、増えた瞬間だけproperty_buyが鳴ることを検証する。
// CPUのbuyProperty()直接呼び出しもこのコンポーネントが受け取るplayer propの変化として
// 観測できるため、ここではクリックイベントではなくprops(player)の変化で購入を模す。
//
// P10-4-5: monopolyAchievementが同時に真の場合はproperty_buyを鳴らさない(monopoly_group/
// monopoly_regionはMonopolyToast/MonopolyAnnounceModal側が鳴らすため、ここでは検証しない)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { PurchaseModal } from "./PurchaseModal";
import type { MonopolyAchievement, Player } from "@/types/game";

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

const GROUP_ACHIEVEMENT: MonopolyAchievement = { kind: "group", name: "藤沢駅前", multiplier: 2 };
const REGION_ACHIEVEMENT: MonopolyAchievement = { kind: "region", name: "藤沢", multiplier: 3 };

describe("PurchaseModal", () => {
  it("マウント直後は鳴らない(基準値取得のみ)", () => {
    const player = buildPlayer([]);
    render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("ownedPropertyIdsが1件増える再レンダーでproperty_buyが1回鳴る(通常購入)", () => {
    const player = buildPlayer([]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    const boughtOne = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtOne}
        players={[boughtOne]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("property_buy");
  });

  it("CPUのまとめ買い(2件同時増加、独占なし)でもproperty_buyは1回だけ鳴る", () => {
    const player = buildPlayer([]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    const boughtTwo = buildPlayer(["wp_fj_nw_rk_bend_prop", "r_fj_kg_1_prop"]);
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtTwo}
        players={[boughtTwo]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("property_buy");
  });

  it("ownedPropertyIdsが変化しない再レンダー(所持金など無関係な変化)では鳴らない", () => {
    const player = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    const moneyChanged = { ...player, money: 4000 };
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={moneyChanged}
        players={[moneyChanged]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });

  // --- Phase10/P10-4-5: property_buyとmonopoly_group/monopoly_regionの排他化 ---

  it("グループ独占達成と同時のownedPropertyIds増加ではproperty_buyを鳴らさない", () => {
    const player = buildPlayer([]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    const boughtOne = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtOne}
        players={[boughtOne]}
        monopolyAchievement={GROUP_ACHIEVEMENT}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("地域独占達成と同時のownedPropertyIds増加でもproperty_buyを鳴らさない", () => {
    const player = buildPlayer([]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    const boughtOne = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtOne}
        players={[boughtOne]}
        monopolyAchievement={REGION_ACHIEVEMENT}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("独占達成の直後、別セッションでの通常購入ではproperty_buyが再び正常に鳴る", () => {
    // 「独占トーストがまだ画面に残っている(表示上のライフサイクル)」ことと、
    // 「monopolyAchievementの値そのもの」は独立している。buyProperty()は呼び出しごとに
    // 必ずmonopolyAchievementを上書きするため、直前の達成が残留して次の通常購入を
    // 誤って抑制することはない、という前提をロックする回帰テスト。
    const player = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={GROUP_ACHIEVEMENT}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );
    expect(playSEMock).not.toHaveBeenCalled();

    const boughtAnother = buildPlayer(["wp_fj_nw_rk_bend_prop", "r_fj_kg_1_prop"]);
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtAnother}
        players={[boughtAnother]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).toHaveBeenCalledTimes(1);
    expect(playSEMock).toHaveBeenCalledWith("property_buy");
  });

  it("CPUのまとめ買いで最終購入が独占達成になるケースでもproperty_buyは鳴らない", () => {
    const player = buildPlayer([]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={player}
        players={[player]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    // Reactの自動バッチングにより、複数件の購入(buyProperty()の複数回呼び出し)が
    // 1回の再レンダーにまとまるケースを模す。ownedPropertyIdsは2件増え、
    // monopolyAchievementはそのバッチ内最後の呼び出し(=独占達成)の結果を反映する。
    const boughtTwoWithMonopoly = buildPlayer(["wp_fj_nw_rk_bend_prop", "r_fj_kg_1_prop"]);
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtTwoWithMonopoly}
        players={[boughtTwoWithMonopoly]}
        monopolyAchievement={GROUP_ACHIEVEMENT}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("monopolyAchievementだけが変化してownedPropertyIdsが変化しない場合は再発火しない(依存配列の確認)", () => {
    // MonopolyToast/MonopolyAnnounceModal側のdismiss(monopolyAchievement: null化)は
    // 独占購入から時間差で起きる。ownedPropertyIdsの増加を伴わないmonopolyAchievementの
    // 変化だけでこのeffectが誤ってplaySEを呼ばない(=depsにmonopolyAchievementを含めても
    // 不要な再発火が起きない)ことを保証する。
    const boughtOne = buildPlayer(["wp_fj_nw_rk_bend_prop"]);
    const { rerender } = render(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtOne}
        players={[boughtOne]}
        monopolyAchievement={GROUP_ACHIEVEMENT}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );
    expect(playSEMock).not.toHaveBeenCalled();

    // ownedPropertyIdsはそのまま、monopolyAchievementだけがdismiss相当でnullに戻る。
    rerender(
      <PurchaseModal
        groupId={GROUP_ID}
        player={boughtOne}
        players={[boughtOne]}
        monopolyAchievement={null}
        onBuy={() => {}}
        onFinish={() => {}}
      />,
    );

    expect(playSEMock).not.toHaveBeenCalled();
  });
});
