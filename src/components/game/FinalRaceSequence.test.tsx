// @vitest-environment jsdom
//
// FinalRaceSequence.tsx(P11-3-A: 最終順位発表演出のphase/state machine基盤)の自動テスト。
// 重点: (1) 順位を一切再計算せず、渡されたranked/winnerIdsの順序をそのまま使うこと、
// (2) 2/3/4人プレイと同着1位で正しいフェーズ数・脱落順になること、(3) onFinish()が
// ちょうど1回だけ呼ばれること、(4) unmount時にタイマーが残らないこと、(5) reduced-motion時に
// 大幅短縮されること、(6) game_over_fanfareがGameOverModalからここへ移設されていること。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { playSE } from "@/lib/audio/soundManager";
import { computeWinnerIds, rankPlayers } from "@/lib/game/engine";
import { FinalRaceSequence } from "./FinalRaceSequence";
import type { Player } from "@/types/game";

vi.mock("@/lib/audio/soundManager", () => ({
  playSE: vi.fn(),
}));

const playSEMock = vi.mocked(playSE);

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function buildPlayer(id: string, name: string, money: number): Player {
  return {
    id,
    name,
    color: "#000",
    controlledBy: "human",
    carIcon: "🚗",
    currentNodeId: "hub_fujisawa",
    moveHistory: ["hub_fujisawa"],
    money,
    ownedPropertyIds: [],
    cardIds: [],
    destinationsReached: 0,
    activeDebuffs: [],
  };
}

/** ownedPropertyIds:[]なのでnetWorth=moneyになる(engine.tsのnetWorth()仕様)。moneyを
 *  直接指定するだけで、rankPlayers()/computeWinnerIds()が返す実際の順位・同着判定を
 *  そのままテストに使える(このテストファイル側で順位ロジックを再実装しない)。 */
function buildRanked(moneys: number[]) {
  const players = moneys.map((m, i) => buildPlayer(`p${i + 1}`, `プレイヤー${i + 1}`, m));
  return { players, ranked: rankPlayers(players), winnerIds: computeWinnerIds(players) };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** 複数フェーズ分をまとめて進めたい場合は、必ず1フェーズ分ずつ個別にadvance()する。
 *  1回のvi.advanceTimersByTimeAsync(合計ms)にまとめると、直前のタイマーが呼んだ
 *  setPhase()に対するReactの再レンダー・useEffect登録(=次のsetTimeout予約)が
 *  間に合わず、後続フェーズのタイマーが「まだ存在しないまま」時間だけ進んでしまい
 *  待ち漏れる(実測で確認済み)。 */
async function advanceSteps(steps: number[]): Promise<void> {
  for (const ms of steps) await advance(ms);
}

describe("FinalRaceSequence", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("マウント(introフェーズ開始)時にgame_over_fanfareが1回だけ再生される(GameOverModalから移設された発火)", () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    expect(playSEMock.mock.calls.filter((c) => c[0] === "game_over_fanfare")).toHaveLength(1);
  });

  it("4人: intro→running→eliminating(4位→3位)→finalTwo→winnerSprint→finish→celebrationの順に自動進行する", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p1=4位, p2=3位, p3=2位, p4=1位(優勝)
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    expect(document.querySelector('[data-race-phase="intro"]')).not.toBeNull();

    await advance(1200); // intro → running
    expect(document.querySelector('[data-race-phase="running"]')).not.toBeNull();

    await advance(900); // running → eliminating(1人目=4位=p1)
    expect(document.querySelector('[data-race-phase="eliminating"]')).not.toBeNull();
    expect(screen.getByText("4位! プレイヤー1さん")).not.toBeNull();

    await advance(700); // eliminating 2人目=3位=p2
    expect(screen.getByText("3位! プレイヤー2さん")).not.toBeNull();

    await advance(700); // eliminating完了 → finalTwo
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();

    await advance(1500); // finalTwo → winnerSprint
    expect(document.querySelector('[data-race-phase="winnerSprint"]')).not.toBeNull();
    expect(screen.getByText("プレイヤー4さん、加速!")).not.toBeNull();

    await advance(800); // winnerSprint → finish
    expect(document.querySelector('[data-race-phase="finish"]')).not.toBeNull();

    await advance(400); // finish → celebration
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();
    expect(screen.getByText("優勝 プレイヤー4さん!")).not.toBeNull();
  });

  it("3人: eliminatingは1回(3位)だけでfinalTwoへ進む", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000]); // p1=3位, p2=2位, p3=1位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // intro→running→eliminating開始
    expect(screen.getByText("3位! プレイヤー1さん")).not.toBeNull();

    await advance(700); // eliminating完了(1回だけ)→finalTwo
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
  });

  it("2人: eliminatingフェーズを経由せず、runningから直接finalTwoへ進む", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]); // p1=2位, p2=1位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advance(1200); // intro → running
    expect(document.querySelector('[data-race-phase="running"]')).not.toBeNull();

    await advance(900); // running → (eliminatingを経由せず)finalTwo
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
  });

  it("同着1位(tie)の場合、celebrationで「引き分け」表示になる", async () => {
    const { ranked, winnerIds } = buildRanked([3000, 3000, 1000]); // p1/p2が同着1位, p3が3位
    expect(winnerIds).toHaveLength(2); // 前提確認: computeWinnerIds()が実際に同着を返している

    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    // intro→running→eliminating(3位)完了→finalTwo→winnerSprint→finish→celebration開始
    await advanceSteps([1200, 900, 700, 1500, 800, 400]);

    expect(screen.getByText("優勝 引き分け!")).not.toBeNull();
  });

  it("onFinish()は演出完了時にちょうど1回だけ呼ばれ、その後タイマーが進んでも増えない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    const onFinish = vi.fn();
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    // 2人プレイなのでeliminatingを経由しない: intro→running→finalTwo→winnerSprint→finish
    await advanceSteps([1200, 900, 1500, 800, 400]);
    expect(onFinish).not.toHaveBeenCalled(); // celebration中はまだ

    await advance(1600); // celebration → done → onFinish()
    expect(onFinish).toHaveBeenCalledTimes(1);

    await advance(10000); // 十分すぎるほど進めても増えない
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("unmount時に残っているタイマーがクリーンアップされ、その後onFinish()が呼ばれない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    const onFinish = vi.fn();
    const { unmount } = render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    await advance(500); // introの途中でunmount
    unmount();

    await advance(10000); // unmount後にどれだけ進めてもタイマーは残っていないはず
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("prefers-reduced-motion時は通常より大幅に短い時間で演出が完了する", async () => {
    stubMatchMedia(true);
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    const onFinish = vi.fn();
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    // reduced-motion設定(REDUCED_TIMING_MS)の合計: 4人プレイなのでeliminationStepは2回。
    // intro(300)+running(200)+eliminationStep(200)*2+finalTwo(400)+winnerSprint(200)+finish(100)+celebration(400)
    // = 2000ms。通常設定の合計7800msよりずっと短い時間で完了することを確認する。
    await advanceSteps([300, 200, 200, 200, 400, 200, 100, 400]);

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("rankedの並び順・rankをそのまま使うだけで、コンポーネント内で順位を再計算しない(同一player配列を渡しても結果が変わらないことで間接的に確認)", async () => {
    const { ranked, winnerIds } = buildRanked([4000, 1000, 3000, 2000]); // 意図的に降順ではない引数順
    // rankPlayers()が既にnetWorth降順へソート済みなので、先頭が1位(最大money=4000=p1)のはず。
    expect(ranked[0].player.id).toBe("p1");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[ranked.length - 1].rank).toBe(4);

    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // eliminating開始、最下位(rank4)から発表されるはず
    expect(screen.getByText(`4位! ${ranked[ranked.length - 1].player.name}さん`)).not.toBeNull();
  });
});

/** [data-player-id]を持つ要素(現役レーンまたは脱落済みchip)を1件取得する。 */
function laneFor(playerId: string): HTMLElement | null {
  return document.querySelector(`[data-player-id="${playerId}"]`);
}

function isActive(playerId: string): boolean {
  return laneFor(playerId)?.getAttribute("data-eliminated") === "false";
}

describe("FinalRaceSequence(Phase B-1: レーン表示)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([2, 3, 4])("%i人プレイ: introの時点で全員が現役レーンとして表示される", async (n) => {
    const { ranked, winnerIds } = buildRanked(Array.from({ length: n }, (_, i) => (i + 1) * 1000));
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    for (const r of ranked) {
      expect(laneFor(r.player.id)).not.toBeNull();
      expect(isActive(r.player.id)).toBe(true);
    }
    // 全員合わせてplayerCount件、脱落済みは0件のはず。
    expect(document.querySelectorAll('[data-player-id]')).toHaveLength(n);
    expect(document.querySelectorAll('[data-eliminated="true"]')).toHaveLength(0);
  });

  it("name/color/carIconがレーンへ反映される", () => {
    const players = [
      { ...buildPlayer("p1", "たろう", 2000), color: "#ff0000", carIcon: "🚙" },
      { ...buildPlayer("p2", "じろう", 1000), color: "#00ff00", carIcon: "🚕" },
    ];
    const ranked = rankPlayers(players);
    const winnerIds = computeWinnerIds(players);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    const lane = laneFor("p1")!;
    expect(lane.textContent).toContain("たろう");
    expect(lane.textContent).toContain("🚙");
    // colorはプレイヤー名側ではなく車アイコンのバッジ(style.backgroundColor)に反映される。
    expect(lane.innerHTML).toContain("rgb(255, 0, 0)");
  });

  it("4人: eliminatingの進行に応じて脱落済みが1人→2人と正しく増え、上位2人は誤って脱落扱いされない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p1=4位, p2=3位, p3=2位, p4=1位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // intro→running→eliminating開始(4位=p1が脱落扱いになる)
    expect(isActive("p1")).toBe(false);
    expect(isActive("p2")).toBe(true);
    expect(isActive("p3")).toBe(true);
    expect(isActive("p4")).toBe(true);
    expect(document.querySelectorAll('[data-eliminated="true"]')).toHaveLength(1);

    await advance(700); // eliminating 2人目(3位=p2)
    expect(isActive("p1")).toBe(false);
    expect(isActive("p2")).toBe(false);
    expect(isActive("p3")).toBe(true); // 上位2人は誤って脱落扱いされない
    expect(isActive("p4")).toBe(true);
    expect(document.querySelectorAll('[data-eliminated="true"]')).toHaveLength(2);
  });

  it.each([2, 3, 4])("%i人プレイ: finalTwo到達時点で現役レーンがちょうど2人になる", async (n) => {
    const { ranked, winnerIds } = buildRanked(Array.from({ length: n }, (_, i) => (i + 1) * 1000));
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    const eliminationSteps = Array(Math.max(0, n - 2)).fill(700);
    await advanceSteps([1200, 900, ...eliminationSteps]);

    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-eliminated="false"]')).toHaveLength(2);
    // 現役の2人は常に1位・2位(rank上位2件)のはず。
    const activeIds = [...document.querySelectorAll('[data-eliminated="false"]')].map((el) => el.getAttribute("data-player-id"));
    const top2Ids = ranked.slice(0, 2).map((r) => r.player.id);
    expect(new Set(activeIds)).toEqual(new Set(top2Ids));
  });

  it("winnerSprint/finish/celebrationでも上位2人は脱落扱いにならない(4人プレイ)", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 700, 700, 1500]); // finalTwo → winnerSprintへ
    expect(document.querySelector('[data-race-phase="winnerSprint"]')).not.toBeNull();
    expect(isActive(ranked[0].player.id)).toBe(true);
    expect(isActive(ranked[1].player.id)).toBe(true);
  });

  it("12文字の長い名前でもtruncate用クラスとtitle属性が付与される(レイアウト崩れの回避策が効いている)", () => {
    const longName = "あいうえおかきくけこさし"; // 12文字ちょうど(StartScreenのmaxLength上限)
    const players = [buildPlayer("p1", longName, 2000), buildPlayer("p2", "プレイヤー2", 1000)];
    const ranked = rankPlayers(players);
    const winnerIds = computeWinnerIds(players);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    const nameEl = screen.getByTitle(longName);
    expect(nameEl.className).toContain("truncate");
    expect(nameEl.textContent).toBe(longName);
  });
});
