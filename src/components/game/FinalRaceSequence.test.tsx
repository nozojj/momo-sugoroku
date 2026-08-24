// @vitest-environment jsdom
//
// FinalRaceSequence.tsx(P11-3-A: 最終順位発表演出のphase/state machine基盤)の自動テスト。
// 重点: (1) 順位を一切再計算せず、渡されたranked/winnerIdsの順序をそのまま使うこと、
// (2) 2/3/4人プレイと同着1位で正しいフェーズ数・脱落順になること、(3) onFinish()が
// ちょうど1回だけ呼ばれること、(4) unmount時にタイマーが残らないこと、(5) reduced-motion時に
// 大幅短縮されること、(6) game_over_fanfareはGameOverModalからここへ移設された上で、
// P11-3-B2c-1でさらにintroからcelebration開始時点へ移設されていること(「優勝決定」の
// 瞬間を全SE中最大のファンファーレにする設計)。
import { readFileSync } from "node:fs";
import path from "node:path";
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

/** P11-3-B2b-1: 1回の脱落発表(holding→departing→settled)の各サブ段階の時間。
 *  FinalRaceSequence.tsxのTIMING_MS/REDUCED_TIMING_MSと値を合わせておく(旧eliminationStep相当)。
 *  advanceSteps()へ渡すときは必ずこの配列を丸ごとspreadする(1回のadvance(合計ms)にまとめると、
 *  holding→departing→settledの各段階間でReactがuseEffectを再登録する前に時間だけ進んでしまい
 *  待ち漏れる。advanceSteps自体のコメントで説明している既存の制約と同じ理由)。 */
const ELIMINATION_STEP_STAGES_MS = [250, 550, 150]; // holding, departing, settled(合計950)
const REDUCED_ELIMINATION_STEP_STAGES_MS = [60, 120, 40]; // 合計220

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

  it("マウント(introフェーズ開始)時点ではgame_over_fanfareは鳴らない(P11-3-B2c-1でcelebrationへ移設済み)", () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    expect(playSEMock.mock.calls.filter((c) => c[0] === "game_over_fanfare")).toHaveLength(0);
  });

  it("4人: intro→running→eliminating(4位→3位)→finalTwo→winnerSprint→finish→celebrationの順に自動進行する", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p1=4位, p2=3位, p3=2位, p4=1位(優勝)
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    expect(document.querySelector('[data-race-phase="intro"]')).not.toBeNull();

    await advance(1200); // intro → running
    expect(document.querySelector('[data-race-phase="running"]')).not.toBeNull();

    await advance(900); // running → eliminating(1人目=4位=p1、holding開始)
    expect(document.querySelector('[data-race-phase="eliminating"]')).not.toBeNull();
    expect(screen.getByText("4位! プレイヤー1さん")).not.toBeNull();

    // P11-3-B2b-1: 見出しが出た直後(holding)はまだ対象車がactiveのまま。
    // holding→departing→settledの合計(ELIMINATION_STEP_STAGES_MSの合計)が経過して初めて次の対象へ進む。
    await advanceSteps(ELIMINATION_STEP_STAGES_MS); // p1のステップ完了 → 2人目(3位=p2)のholding開始
    expect(screen.getByText("3位! プレイヤー2さん")).not.toBeNull();

    await advanceSteps(ELIMINATION_STEP_STAGES_MS); // p2のステップ完了 → finalTwo
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

    await advanceSteps([1200, 900]); // intro→running→eliminating開始(holding)
    expect(screen.getByText("3位! プレイヤー1さん")).not.toBeNull();

    await advanceSteps(ELIMINATION_STEP_STAGES_MS); // eliminating完了(1回だけ)→finalTwo
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
    await advanceSteps([1200, 900, ...ELIMINATION_STEP_STAGES_MS, 1500, 800, 400]);

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
    // intro(300)+running(200)+eliminationStep(220)*2+finalTwo(400)+winnerSprint(200)+finish(100)+celebration(400)
    // = 2040ms。通常設定の合計(950*2を含む)よりずっと短い時間で完了することを確認する。
    await advanceSteps([
      300,
      200,
      ...REDUCED_ELIMINATION_STEP_STAGES_MS,
      ...REDUCED_ELIMINATION_STEP_STAGES_MS,
      400,
      200,
      100,
      400,
    ]);

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

  it("4人: 各eliminatingステップが完了するたびに脱落済みが1人→2人と正しく増え、上位2人は誤って脱落扱いされない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p1=4位, p2=3位, p3=2位, p4=1位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    // P11-3-B2b-1: 「4位!」の見出しが出た直後(holding)ではまだp1はactiveのまま
    // (isActive/data-eliminationStageの詳細な検証は別describe「B-2b-1」で行う)。
    // ここではholding→departing→settledの合計(1ステップ分)が経過した「後」の状態を確認する。
    await advanceSteps([1200, 900, ...ELIMINATION_STEP_STAGES_MS]); // running→eliminating→p1のステップ完了
    expect(isActive("p1")).toBe(false);
    expect(isActive("p2")).toBe(true);
    expect(isActive("p3")).toBe(true);
    expect(isActive("p4")).toBe(true);
    expect(document.querySelectorAll('[data-eliminated="true"]')).toHaveLength(1);

    await advanceSteps(ELIMINATION_STEP_STAGES_MS); // p2のステップ完了
    expect(isActive("p1")).toBe(false);
    expect(isActive("p2")).toBe(false);
    expect(isActive("p3")).toBe(true); // 上位2人は誤って脱落扱いされない
    expect(isActive("p4")).toBe(true);
    expect(document.querySelectorAll('[data-eliminated="true"]')).toHaveLength(2);
  });

  it.each([2, 3, 4])("%i人プレイ: finalTwo到達時点で現役レーンがちょうど2人になる", async (n) => {
    const { ranked, winnerIds } = buildRanked(Array.from({ length: n }, (_, i) => (i + 1) * 1000));
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    const eliminationSteps = Array(Math.max(0, n - 2))
      .fill(null)
      .flatMap(() => ELIMINATION_STEP_STAGES_MS);
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

    await advanceSteps([1200, 900, ...ELIMINATION_STEP_STAGES_MS, ...ELIMINATION_STEP_STAGES_MS, 1500]); // finalTwo → winnerSprintへ
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

/** レーン要素のdata-running属性を読む(現役レーンにのみ存在する)。 */
function isRunning(playerId: string): boolean | null {
  const attr = laneFor(playerId)?.getAttribute("data-running");
  if (attr === null || attr === undefined) return null;
  return attr === "true";
}

/** レーン要素内から走行演出クラス(race-drift/animate-race-vibrate)が実際に付与されているか。 */
function hasMotionClasses(playerId: string): boolean {
  const html = laneFor(playerId)?.innerHTML ?? "";
  return html.includes("race-drift") && html.includes("animate-race-vibrate");
}

describe("FinalRaceSequence(Phase B-2a: 通常走行モーション)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("introでは通常走行animationが付かない(data-running=falseかつ走行クラスも無い)", () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    expect(document.querySelector('[data-race-phase="intro"]')).not.toBeNull();
    for (const r of ranked) {
      expect(isRunning(r.player.id)).toBe(false);
      expect(hasMotionClasses(r.player.id)).toBe(false);
    }
  });

  it("runningに入ると現役車に走行animationが付く(data-running=trueかつ走行クラスが付与される)", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advance(1200); // intro → running
    expect(document.querySelector('[data-race-phase="running"]')).not.toBeNull();
    for (const r of ranked) {
      expect(isRunning(r.player.id)).toBe(true);
      expect(hasMotionClasses(r.player.id)).toBe(true);
    }
  });

  it("eliminatingの1ステップ完了後、現役車は走行animationを維持し、脱落済みplayerには付かない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p1=4位, p2=3位, p3=2位, p4=1位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    // P11-3-B2b-1: holding→departing→settledの合計(1ステップ分)経過後、p1がchipへ移る。
    await advanceSteps([1200, 900, ...ELIMINATION_STEP_STAGES_MS]);
    expect(document.querySelector('[data-race-phase="eliminating"]')).not.toBeNull();

    // 現役(p2/p3/p4)は走行animationを維持する。ただしp2は同じタイミングで次の発表対象
    // (3位、holding)へ切り替わっているため、P11-3-B2b-2のholding強調(animate-character-bounce)
    // へ一時的に置き換わる(通常のanimate-race-vibrateとは重ねない設計、data-running=trueで
    // 「現役」であること自体は変わらない)。
    expect(isRunning("p2")).toBe(true);
    expect(eliminationStageOf("p2")).toBe("holding");
    expect(isRunning("p3")).toBe(true);
    expect(hasMotionClasses("p3")).toBe(true);
    expect(isRunning("p4")).toBe(true);
    expect(hasMotionClasses("p4")).toBe(true);

    // 脱落済み(p1)はchip表示のみで、data-running属性自体を持たない・走行クラスも無い。
    expect(isRunning("p1")).toBeNull();
    expect(hasMotionClasses("p1")).toBe(false);
    expect(laneFor("p1")?.getAttribute("data-eliminated")).toBe("true");
  });

  it("プレイヤーごとに決定論的なanimation-delayが設定される(同じidなら常に同じ値、Math.randomに依存しない)", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);

    const { unmount } = render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);
    await advance(1200); // running
    const vibrateEl1 = document.querySelector('[data-player-id="p1"] .animate-race-vibrate') as HTMLElement;
    const delay1 = vibrateEl1.style.animationDelay;
    unmount();

    // 同じplayer.idで再マウントしても同じ遅延値になること(決定論的)。
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);
    await advance(1200);
    const vibrateEl2 = document.querySelector('[data-player-id="p1"] .animate-race-vibrate') as HTMLElement;
    const delay2 = vibrateEl2.style.animationDelay;

    expect(delay1).toBe(delay2);
    expect(delay1).toMatch(/^\d+ms$/);
  });

  it("reduced-motion時は連続走行animationが無効になる(data-running=falseかつ走行クラスも無い、ただしdata-eliminatedによる現役情報は保持される)", async () => {
    stubMatchMedia(true);
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advance(300); // reduced-motion設定でのintro→running
    expect(document.querySelector('[data-race-phase="running"]')).not.toBeNull();

    for (const r of ranked) {
      expect(isRunning(r.player.id)).toBe(false); // 装飾アニメーションは無効
      expect(hasMotionClasses(r.player.id)).toBe(false);
      expect(laneFor(r.player.id)?.getAttribute("data-eliminated")).toBe("false"); // 現役であるという情報自体は保持される
    }
  });
});

/** レーン要素のdata-elimination-stage属性を読む(今回発表中の対象にのみ存在する)。 */
function eliminationStageOf(playerId: string): string | null {
  return laneFor(playerId)?.getAttribute("data-elimination-stage") ?? null;
}

describe("FinalRaceSequence(Phase B-2b-1: holding/departing/settledの分離)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("eliminating開始直後(holding)は対象車がまだactiveで、data-elimination-stage=holdingになる", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p1=4位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // running → eliminating開始
    expect(document.querySelector('[data-race-phase="eliminating"]')).not.toBeNull();
    expect(screen.getByText("4位! プレイヤー1さん")).not.toBeNull();
    expect(isActive("p1")).toBe(true); // 見出しは出たが、まだレーンに残っている
    expect(eliminationStageOf("p1")).toBe("holding");
  });

  it("holding→departingへ移っても対象車はまだactiveのまま、data-elimination-stage=departingになる", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 250]); // holding完了 → departing開始
    expect(isActive("p1")).toBe(true); // departing中もまだレーンに残っている
    expect(eliminationStageOf("p1")).toBe("departing");
  });

  it("settled到達時に対象車が初めてeliminatedになり、脱落済みchipへ移る", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 250, 550]); // holding+departing完了 → settled
    expect(isActive("p1")).toBe(false);
    expect(laneFor("p1")?.getAttribute("data-eliminated")).toBe("true");
  });

  it("4人プレイの全eliminatingステップを通して、上位2人は一度もeliminated/発表対象扱いにならない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p3=2位, p4=1位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    function assertTopTwoUntouched() {
      expect(eliminationStageOf("p3")).toBeNull();
      expect(eliminationStageOf("p4")).toBeNull();
      expect(isActive("p3")).toBe(true);
      expect(isActive("p4")).toBe(true);
    }

    await advanceSteps([1200, 900]);
    assertTopTwoUntouched();
    await advance(250); // p1 departing
    assertTopTwoUntouched();
    await advance(550); // p1 settled
    assertTopTwoUntouched();
    await advance(150); // p1確定、p2のholding開始
    assertTopTwoUntouched();
    await advance(250); // p2 departing
    assertTopTwoUntouched();
    await advance(550); // p2 settled
    assertTopTwoUntouched();
    await advance(150); // p2確定 → finalTwo
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    assertTopTwoUntouched();
  });

  it("stage遷移を最後まで進めてもonFinish()の二重発火・finalTwoへの二重遷移は起きない(4人プレイ通し)", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    const onFinish = vi.fn();
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    await advanceSteps([
      1200,
      900,
      ...ELIMINATION_STEP_STAGES_MS,
      ...ELIMINATION_STEP_STAGES_MS,
      1500,
      800,
      400,
    ]);
    expect(onFinish).not.toHaveBeenCalled(); // celebration中はまだ
    expect(document.querySelector('[data-race-phase="finalTwo"]')).toBeNull(); // 既に通過済み、戻っていない

    await advance(1600); // celebration → done → onFinish()
    expect(onFinish).toHaveBeenCalledTimes(1);

    await advance(10000);
    expect(onFinish).toHaveBeenCalledTimes(1); // 二重発火なし
  });

  it("departing中にunmountしてもtimerがクリーンアップされ、その後onFinish()が呼ばれない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    const onFinish = vi.fn();
    const { unmount } = render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    await advanceSteps([1200, 900, 250]); // departing中でunmount
    unmount();

    await advance(10000); // unmount後にどれだけ進めてもタイマーは残っていないはず
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("reduced-motion時もholding→departing→settledの論理順序は維持される(時間だけ短縮される)", async () => {
    stubMatchMedia(true);
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([300, 200]); // reduced intro+running → eliminating開始
    expect(eliminationStageOf("p1")).toBe("holding");
    expect(isActive("p1")).toBe(true);

    await advance(60); // reduced eliminationHold
    expect(eliminationStageOf("p1")).toBe("departing");
    expect(isActive("p1")).toBe(true);

    await advance(120); // reduced eliminationDepart → settled
    expect(isActive("p1")).toBe(false);
    expect(laneFor("p1")?.getAttribute("data-eliminated")).toBe("true");
  });
});

/** レーン(またはchip)要素の子孫に、指定classをぴったり持つ要素があるか。querySelectorの
 *  class選択子はトークン完全一致なので、".race-departing"は"race-departing-reduced"を
 *  誤って拾わない(部分文字列一致にならない)。 */
function hasDescendantWithClass(playerId: string, className: string): boolean {
  return (laneFor(playerId)?.querySelector(`.${className}`) ?? null) !== null;
}

describe("FinalRaceSequence(Phase B-2b-2: departingの脱落アニメーション)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("holding中は対象車にanimate-character-bounceが付き、通常のrace-drift走行とanimate-race-vibrateは維持される", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]); // p1=4位
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // running → eliminating開始(holding)
    expect(eliminationStageOf("p1")).toBe("holding");
    expect(isActive("p1")).toBe(true);
    expect(hasDescendantWithClass("p1", "animate-character-bounce")).toBe(true);
    expect(hasDescendantWithClass("p1", "animate-race-vibrate")).toBe(false); // bounceに置き換わり、vibrateとは重ねない
    expect(hasDescendantWithClass("p1", "race-drift")).toBe(true); // まだ通常走行中(コースアウトしない)
  });

  it("departing中はwrapperがrace-drift→race-departingへ切り替わり、badge側のvibrateは外れる。まだ脱落済みにはならない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 250]); // holding完了 → departing開始
    expect(eliminationStageOf("p1")).toBe("departing");
    expect(hasDescendantWithClass("p1", "race-departing")).toBe(true);
    expect(hasDescendantWithClass("p1", "race-drift")).toBe(false); // 通常走行クラスは外れる
    expect(hasDescendantWithClass("p1", "animate-race-vibrate")).toBe(false); // 動きはwrapper側に一本化
    expect(hasDescendantWithClass("p1", "animate-character-bounce")).toBe(false); // holding用の強調も残らない
    expect(isActive("p1")).toBe(true); // departing中はまだ現役レーン扱い
    expect(laneFor("p1")?.getAttribute("data-eliminated")).toBe("false");
  });

  it("settled到達後は脱落済みchipへ移り、animate-arrival-popが付く", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 250, 550]); // holding+departing完了 → settled
    expect(isActive("p1")).toBe(false);
    const chip = laneFor("p1");
    expect(chip?.getAttribute("data-eliminated")).toBe("true");
    expect(chip?.className).toContain("animate-arrival-pop");
    // レース上のwrapper/badge用クラスはchip側には存在しない(主役はコースアウト、chipは一発ポップのみ)。
    expect(chip?.className).not.toContain("race-departing");
  });

  it("reduced-motion時のdepartingはrace-departing-reduced(短いfade)を使い、通常のrace-departingは使わない", async () => {
    stubMatchMedia(true);
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([300, 200, 60]); // reduced intro+running+holding → departing開始
    expect(eliminationStageOf("p1")).toBe("departing");
    expect(hasDescendantWithClass("p1", "race-departing-reduced")).toBe(true);
    expect(hasDescendantWithClass("p1", "race-departing")).toBe(false); // トークン完全一致なので誤検出しない
  });

  it.each([2, 3, 4])("%i人プレイでも、departingの見た目クラス追加後にfinalTwo以降(既存演出)まで正しく到達する", async (n) => {
    const { ranked, winnerIds } = buildRanked(Array.from({ length: n }, (_, i) => (i + 1) * 1000));
    const onFinish = vi.fn();
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    const eliminationSteps = Array(Math.max(0, n - 2))
      .fill(null)
      .flatMap(() => ELIMINATION_STEP_STAGES_MS);
    await advanceSteps([1200, 900, ...eliminationSteps, 1500, 800, 400]);
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();

    await advance(1600); // celebration → done → onFinish()
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("globals.cssにdeparting用keyframe(PC/スマホ)とreduced-motion用の短いfadeが定義されている", () => {
    const cssPath = path.resolve(__dirname, "../../app/globals.css");
    const css = readFileSync(cssPath, "utf-8");

    expect(css).toContain("@keyframes race-departing-desktop");
    expect(css).toContain("@keyframes race-departing-mobile");
    expect(css).toContain("@keyframes race-departing-reduced");
    expect(css).toContain(".race-departing-reduced");
  });
});

/** playSEMock.mock.callsのうち、指定idの呼び出し回数だけを数える。 */
function seCallCount(id: string): number {
  return playSEMock.mock.calls.filter((c) => c[0] === id).length;
}

describe("FinalRaceSequence(Phase B-2b-3: 順位発表/脱落SE)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("4人プレイ: holding開始のたびにdestination_reveal、departing開始のたびにelimination_outが1回ずつ鳴り、settledでは増えない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // running → eliminating開始(4位のholding)
    expect(seCallCount("destination_reveal")).toBe(1);
    expect(seCallCount("elimination_out")).toBe(0);

    await advance(250); // 4位: holding → departing
    expect(seCallCount("destination_reveal")).toBe(1); // 増えない
    expect(seCallCount("elimination_out")).toBe(1);

    await advance(550); // 4位: departing → settled
    expect(seCallCount("destination_reveal")).toBe(1);
    expect(seCallCount("elimination_out")).toBe(1); // settledでは追加SEなし

    await advance(150); // 4位確定 → 3位のholding開始
    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(1);

    await advance(250); // 3位: holding → departing
    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(2);

    await advance(550); // 3位: departing → settled
    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(2);

    await advance(150); // 3位確定 → finalTwoへ(P11-3-B2c-1でdestination_arriveが1回鳴る)
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(2);
    expect(seCallCount("destination_arrive")).toBe(1);

    // game_over_fanfareはP11-3-B2c-1でcelebration開始時点へ移設済みのため、
    // finalTwo到達時点ではまだ0回(intro時点でも0回であることは別テストで確認済み)。
    expect(seCallCount("game_over_fanfare")).toBe(0);
  });

  it("3人プレイ: destination_reveal/elimination_outとも1回ずつ", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, ...ELIMINATION_STEP_STAGES_MS]); // running→eliminating(1回)→finalTwo
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    expect(seCallCount("destination_reveal")).toBe(1);
    expect(seCallCount("elimination_out")).toBe(1);
  });

  it("2人プレイ: eliminatingフェーズを経由しないため、destination_reveal/elimination_outとも0回", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // running → (eliminatingを経由せず)finalTwo
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    expect(seCallCount("destination_reveal")).toBe(0);
    expect(seCallCount("elimination_out")).toBe(0);
    // P11-3-B2c-1: 2人プレイでもfinalTwoへ入った瞬間にdestination_arriveは1回鳴る
    // (eliminatingを経由しないこととは独立)。game_over_fanfareはcelebrationへ移設済みのため
    // この時点ではまだ0回。
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(0);
  });

  it("reduced-motion時も4人プレイでdestination_reveal×2/elimination_out×2が短縮タイミングで重複なく鳴る", async () => {
    stubMatchMedia(true);
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([300, 200]); // reduced intro+running → 4位holding
    expect(seCallCount("destination_reveal")).toBe(1);
    expect(seCallCount("elimination_out")).toBe(0);

    await advance(60); // 4位: holding → departing(reduced)
    expect(seCallCount("elimination_out")).toBe(1);

    await advanceSteps([120, 40]); // 4位: departing → settled → 3位holding
    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(1);

    await advance(60); // 3位: holding → departing(reduced)
    expect(seCallCount("elimination_out")).toBe(2);

    await advanceSteps([120, 40]); // 3位: departing → settled → finalTwo
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(2);
  });

  it("holding/departing中にunmountしても、以降SEが追加で鳴らずタイマーも残らない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    const { unmount } = render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900]); // 4位holding開始
    expect(seCallCount("destination_reveal")).toBe(1);

    unmount();
    await advance(10000); // unmount後にどれだけ進めても増えないはず
    expect(seCallCount("destination_reveal")).toBe(1);
    expect(seCallCount("elimination_out")).toBe(0);
  });

  it("onFinish()の呼び出し回数(1回だけ)はSE追加の影響を受けない(4人プレイ通し)", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    const onFinish = vi.fn();
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    await advanceSteps([
      1200,
      900,
      ...ELIMINATION_STEP_STAGES_MS,
      ...ELIMINATION_STEP_STAGES_MS,
      1500,
      800,
      400,
    ]);
    await advance(1600); // celebration → done → onFinish()
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(2);
    // P11-3-B2c-1: celebration開始時点でgame_over_fanfareが1回鳴っているはず。
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1);

    await advance(10000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(seCallCount("destination_reveal")).toBe(2); // finalTwo以降は今回SEを追加しないため増えない
    expect(seCallCount("elimination_out")).toBe(2);
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1); // done後も増えない
  });
});

describe("FinalRaceSequence(Phase B-2c-1: finalTwo/celebrationの音構造)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("introではSEが一切鳴らない(game_over_fanfareも含む)", () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    expect(playSEMock).not.toHaveBeenCalled();
  });

  it("4人プレイ通し: destination_reveal×2 / elimination_out×2 / destination_arrive×1 / game_over_fanfare×1 の最終回数になる", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, ...ELIMINATION_STEP_STAGES_MS, ...ELIMINATION_STEP_STAGES_MS]);
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    expect(seCallCount("destination_arrive")).toBe(1); // finalTwoへ入った瞬間に1回
    expect(seCallCount("game_over_fanfare")).toBe(0);

    await advance(1500); // finalTwo → winnerSprint(SE追加なし)
    expect(document.querySelector('[data-race-phase="winnerSprint"]')).not.toBeNull();
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(0);

    await advance(800); // winnerSprint → finish(SE追加なし)
    expect(document.querySelector('[data-race-phase="finish"]')).not.toBeNull();
    expect(seCallCount("game_over_fanfare")).toBe(0);

    await advance(400); // finish → celebration(ここでgame_over_fanfareが1回)
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();
    expect(seCallCount("game_over_fanfare")).toBe(1);

    expect(seCallCount("destination_reveal")).toBe(2);
    expect(seCallCount("elimination_out")).toBe(2);
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1);
  });

  it("3人プレイ通し: destination_reveal×1 / elimination_out×1 / destination_arrive×1 / game_over_fanfare×1", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, ...ELIMINATION_STEP_STAGES_MS, 1500, 800, 400]);
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();

    expect(seCallCount("destination_reveal")).toBe(1);
    expect(seCallCount("elimination_out")).toBe(1);
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1);
  });

  it("2人プレイ通し: eliminatingを経由しないため destination_reveal×0 / elimination_out×0、destination_arrive×1 / game_over_fanfare×1 は変わらず鳴る", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 1500, 800, 400]);
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();

    expect(seCallCount("destination_reveal")).toBe(0);
    expect(seCallCount("elimination_out")).toBe(0);
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1);
  });

  it("celebration中に時間が進んでも(done到達後も)game_over_fanfareは増えない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 1500, 800, 400]); // celebration開始
    expect(seCallCount("game_over_fanfare")).toBe(1);

    await advance(1600); // celebration → done
    expect(seCallCount("game_over_fanfare")).toBe(1);

    await advance(10000); // done後もどれだけ進めても増えない
    expect(seCallCount("game_over_fanfare")).toBe(1);
  });

  it("celebration開始直後にunmountしても、それ以上SEは増えずタイマーも残らない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    const onFinish = vi.fn();
    const { unmount } = render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    await advanceSteps([1200, 900, 1500, 800, 400]); // celebration開始
    expect(seCallCount("game_over_fanfare")).toBe(1);

    unmount();
    await advance(10000);
    expect(seCallCount("game_over_fanfare")).toBe(1);
    expect(onFinish).not.toHaveBeenCalled(); // celebrationの1600ms経過前にunmountしたため
  });

  it("reduced-motion時も4人プレイでdestination_arrive×1/game_over_fanfare×1が短縮タイミングで重複なく鳴る", async () => {
    stubMatchMedia(true);
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([
      300,
      200,
      ...REDUCED_ELIMINATION_STEP_STAGES_MS,
      ...REDUCED_ELIMINATION_STEP_STAGES_MS,
    ]);
    expect(document.querySelector('[data-race-phase="finalTwo"]')).not.toBeNull();
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(0);

    await advance(400); // finalTwo → winnerSprint(reduced、SE追加なし)
    expect(document.querySelector('[data-race-phase="winnerSprint"]')).not.toBeNull();
    expect(seCallCount("game_over_fanfare")).toBe(0);

    await advance(200); // winnerSprint → finish(reduced、SE追加なし)
    expect(document.querySelector('[data-race-phase="finish"]')).not.toBeNull();
    expect(seCallCount("game_over_fanfare")).toBe(0);

    await advance(100); // finish → celebration(reduced、ここでgame_over_fanfareが1回)
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1);
  });
});

describe("FinalRaceSequence(Phase B-2c-2: finalTwo強調とcelebration紙吹雪)", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    playSEMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("finalTwo中は見出しにanimate-highlight-slamが付き、他のフェーズには付かない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    expect(document.querySelector(".animate-highlight-slam")).toBeNull(); // intro中は無し

    await advanceSteps([1200, 900]); // running → finalTwo
    const heading = document.querySelector(".animate-highlight-slam");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("残り2人、デッドヒート!");

    await advance(1500); // finalTwo → winnerSprint
    expect(document.querySelector(".animate-highlight-slam")).toBeNull(); // winnerSprintには付かない
  });

  it("celebration開始時にのみ紙吹雪(animate-confetti-fall)とsparkle(animate-announcer-sparkle)が表示される", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 1500, 800]); // → finish開始まで
    expect(document.querySelector('[data-race-phase="finish"]')).not.toBeNull();
    expect(document.querySelector(".animate-confetti-fall")).toBeNull(); // celebration前は無し
    expect(document.querySelector(".animate-announcer-sparkle")).toBeNull();

    await advance(400); // finish → celebration
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();
    expect(document.querySelectorAll(".animate-confetti-fall").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".animate-announcer-sparkle").length).toBeGreaterThan(0);

    // 優勝者名のテキスト自体は紙吹雪の陰に隠れず、DOM上でそのまま読み取れる。
    expect(screen.getByText("優勝 プレイヤー2さん!")).not.toBeNull();
  });

  it("celebration→done到達後は紙吹雪/sparkleが消える(doneでは表示しない)", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 1500, 800, 400]); // celebration開始
    expect(document.querySelectorAll(".animate-confetti-fall").length).toBeGreaterThan(0);

    await advance(1600); // celebration → done
    expect(document.querySelector('[data-race-phase="done"]')).not.toBeNull();
    expect(document.querySelector(".animate-confetti-fall")).toBeNull();
    expect(document.querySelector(".animate-announcer-sparkle")).toBeNull();
    // done中も優勝者名の表示自体は維持される。
    expect(screen.getByText("優勝 プレイヤー2さん!")).not.toBeNull();
  });

  it("unmount後に紙吹雪/sparkle関連のDOM・タイマーが残らない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    const { unmount } = render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 1500, 800, 400]); // celebration開始
    expect(document.querySelectorAll(".animate-confetti-fall").length).toBeGreaterThan(0);

    unmount();
    expect(document.querySelector(".animate-confetti-fall")).toBeNull();
    await advance(10000); // unmount後にどれだけ進めてもエラーにならない
  });

  it.each([2, 3, 4])("%i人プレイでもcelebrationで紙吹雪/sparkleが表示され、finalTwoの強調も付く", async (n) => {
    const { ranked, winnerIds } = buildRanked(Array.from({ length: n }, (_, i) => (i + 1) * 1000));
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    const eliminationSteps = Array(Math.max(0, n - 2))
      .fill(null)
      .flatMap(() => ELIMINATION_STEP_STAGES_MS);
    await advanceSteps([1200, 900, ...eliminationSteps]);
    expect(document.querySelector(".animate-highlight-slam")).not.toBeNull(); // finalTwo突入直後

    await advanceSteps([1500, 800, 400]);
    expect(document.querySelectorAll(".animate-confetti-fall").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".animate-announcer-sparkle").length).toBeGreaterThan(0);
  });

  it("reduced-motion時はcelebrationでも紙吹雪/sparkleを表示しない(ただしcelebration自体は表示される)", async () => {
    stubMatchMedia(true);
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([300, 200, 400, 200, 100]); // reduced: intro→running→finalTwo→winnerSprint→finish
    await advance(100); // finish → celebration(reduced)
    expect(document.querySelector('[data-race-phase="celebration"]')).not.toBeNull();
    expect(document.querySelector(".animate-confetti-fall")).toBeNull();
    expect(document.querySelector(".animate-announcer-sparkle")).toBeNull();
    expect(screen.getByText("優勝 プレイヤー2さん!")).not.toBeNull();
  });

  it("紙吹雪/sparkle/finalTwo強調を追加してもSE発火回数(destination_arrive×1, game_over_fanfare×1)とonFinish×1は変わらない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000, 3000, 4000]);
    const onFinish = vi.fn();
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={onFinish} />);

    await advanceSteps([
      1200,
      900,
      ...ELIMINATION_STEP_STAGES_MS,
      ...ELIMINATION_STEP_STAGES_MS,
      1500,
      800,
      400,
    ]);
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1);

    await advance(1600); // celebration → done → onFinish()
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(seCallCount("destination_arrive")).toBe(1); // 視覚演出の再renderで増えない
    expect(seCallCount("game_over_fanfare")).toBe(1);

    await advance(10000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(seCallCount("destination_arrive")).toBe(1);
    expect(seCallCount("game_over_fanfare")).toBe(1);
  });

  it("AnnouncerEffectLayerはpointer-events-noneかつaria-hiddenで、優勝者名テキストの操作性・可読性を妨げない", async () => {
    const { ranked, winnerIds } = buildRanked([1000, 2000]);
    render(<FinalRaceSequence ranked={ranked} winnerIds={winnerIds} onFinish={() => {}} />);

    await advanceSteps([1200, 900, 1500, 800, 400]); // celebration開始
    const layer = document.querySelector('[aria-hidden="true"].pointer-events-none');
    expect(layer).not.toBeNull();
    // 優勝者名は紙吹雪レイヤーの外(通常のテキストノード)としてそのまま存在する。
    expect(screen.getByText("優勝 プレイヤー2さん!")).not.toBeNull();
  });
});
