// Phase4最初の課題: yearEventAnnounceInfo(「今年の湘南」年度告知)とtroubleCharacterAnnounceInfo
// (妨害キャラの登場/所有者交代/悪さ/変身告知)は、どちらもGameScreen.tsxが独立した全画面
// CharacterAnnouncerとして描画する一時通知。新年度開始(advanceToNextTurn()のisYearStart分岐)と
// 妨害キャラ所有者の変身/悪さ判定が同じターンで成立すると、この2つが同じset()呼び出しで
// 同時に非nullになり、GameScreen.tsxが両方を同時マウントして片方がもう片方を覆い隠してしまう
// (Final Auditで発見)。
//
// gameStore.ts側の対処(resolveYearEventAnnounce()/resolveTroubleCharacterAnnounce())を、公開
// アクション(startGame/rollDice/advanceStep/continueAfterSettlementIntro/continueAfterSettlement)
// だけを使って検証する(既存のgameStore.settlement.test.ts/gameStore.troubleCharacter.test.tsと
// 同じ方針、private関数には触れない)。1人プレイにすることで、毎ターンcurrentPlayerIndexが0へ
// 巻き戻る(=毎ターンisYearStart判定が走る)ことと、troubleCharacterOwnerId(=唯一のプレイヤー)が
// 常に次の手番を得ることを同時に満たしやすくする。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getNode } from "@/lib/game/mapGraph";
import { placePlayerAt, mockSingleDiceFace, driveToLandingToward } from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
const UNRELATED_DESTINATION = "hub_kamakura";
// gameStore.settlement.test.tsで確認済みの、着地効果を持たない(type:"normal")経路。
const START = "r_fjrt_gate_fjrt_e_1";
const TARGET = "fjrt_e";

function assertFixturePreconditions() {
  const map = getMap(MAP_ID);
  const start = getNode(map, START);
  const target = getNode(map, TARGET);
  if (!start.connections.some((c) => c.to === TARGET)) {
    throw new Error(`テスト前提が崩れています: ${START} から ${TARGET} への接続が見つかりません。マップデータが変更された可能性があります。`);
  }
  if (target.type !== "normal") {
    throw new Error(
      `テスト前提が崩れています: ${TARGET} はtype:"normal"(着地効果の無いマス)の前提だが、実際はtype:"${target.type}"でした。`,
    );
  }
}

/** 現在の(唯一の)プレイヤーを1ターン分だけ最後まで完了させる(着地効果に割り込まれない前提)。
 *  年度末(turn:12)であればstatusは"settlementIntro"で止まる(gameStore.settlement.test.tsと同じ)。 */
function playOutOneTurn() {
  placePlayerAt(START, UNRELATED_DESTINATION);
  mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
  useGameStore.getState().rollDice();
  driveToLandingToward(TARGET);
}

/** 妨害キャラの「悪さ」抽選で必ずkind:"money"になる値(gameStore.troubleCharacter.test.tsの
 *  既存テストで確認済みの値、weight配分money40/halve40/skip20)。 */
const MISCHIEF_MONEY_RANDOM = 0.1;

describe("yearEventAnnounceInfo × troubleCharacterAnnounceInfoの同時発生(Phase4)", () => {
  beforeEach(() => {
    assertFixturePreconditions();
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame(["テストP1"], 2); // totalTurns = 24(2年)
    // startGame()は1年目のyearEventAnnounceInfoを非nullでセットする。実プレイではここまで進む前に
    // 必ず見終えている前提のため、このファイルの各テストはここで解消してから始める。
    useGameStore.getState().dismissYearEventAnnounce();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yearEvent単独発生: troubleCharacter未登場のまま年度が変わっても、yearEventAnnounceInfoだけが立つ", () => {
    useGameStore.setState({ turn: 12 });

    playOutOneTurn();
    useGameStore.getState().continueAfterSettlementIntro();
    useGameStore.getState().continueAfterSettlement();

    const after = useGameStore.getState();
    expect(after.turn).toBe(13);
    expect(after.yearEventAnnounceInfo).toEqual({ year: 2, eventId: after.currentYearEventId });
    expect(after.troubleCharacterAnnounceInfo).toBeNull();
    expect(after.pendingTroubleCharacterAnnounceInfo).toBeNull();
    expect(after.pendingYearEventAnnounceInfo).toBeNull();
  });

  it("troubleCharacter単独発生: 年度境界をまたがないターンでは、troubleCharacterAnnounceInfoだけが立つ", () => {
    useGameStore.setState({
      turn: 5, // 年度境界(13)から離れたターン
      troubleCharacterOwnerId: "p1",
      troubleCharacterFormId: "normal",
      troubleCharacterPossessionCount: 0,
    });
    placePlayerAt(START, UNRELATED_DESTINATION);
    mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
    useGameStore.getState().rollDice(); // ダイスの出目決定でMath.random()を1回消費する

    // 年度境界をまたがないturn:5→6のendTurn()は、この直後のdriveToLandingToward()内で
    // 同期的にadvanceToNextTurn()まで進み、その中で悪さ抽選のMath.random()が呼ばれる。
    // ダイスの出目決定(既に消費済み)とは独立して、ここで改めてmoney側になる値へ固定する。
    vi.spyOn(Math, "random").mockReturnValue(MISCHIEF_MONEY_RANDOM);
    driveToLandingToward(TARGET);

    const after = useGameStore.getState();
    expect(after.turn).toBe(6);
    expect(after.status).toBe("rolling");
    expect(after.troubleCharacterAnnounceInfo?.kind).toBe("mischief");
    expect(after.yearEventAnnounceInfo).toBeNull();
    expect(after.pendingTroubleCharacterAnnounceInfo).toBeNull();
    expect(after.pendingYearEventAnnounceInfo).toBeNull();
  });

  // 逆方向: checkTroubleCharacterHandoff()等(finishLandingAndEndTurn()内でendTurn()より前に
  // 評価される)により、advanceToNextTurn()が呼ばれる時点で既にtroubleCharacterAnnounceInfoが
  // 表示中だった場合、新年度の告知(yearEventAnnounceInfo)側が保留される(resolveYearEventAnnounce()の
  // 対称ガード)ことを検証する。実際のhandoff成立条件(1人プレイでは自分自身への譲渡になり成立し得ない)
  // を再現する代わりに、advanceToNextTurn()が読む直前の状態(troubleCharacterAnnounceInfoが非null)
  // だけを直接再現する(gameStore.tsの「呼び出し時点のstateを見るだけ」という実装に対応する、
  // ガード条件自体を狙った最小限のテスト用セットアップ)。troubleCharacterOwnerIdは意図的にnullの
  // ままにしておく: 設定すると1人プレイでは次の手番(=次のadvanceToNextTurn()呼び出し内)で
  // 別途mischiefが同時に確定してしまい、このテストが検証したい「既存のtroubleCharacterAnnounceInfoが
  // そのまま保たれる」ことの確認にならないため。
  it("逆方向: troubleCharacterAnnounceInfoが既に表示中のときに新年度が始まると、yearEventAnnounceInfoがpendingへ保留される", () => {
    useGameStore.setState({ turn: 12 });
    playOutOneTurn();
    useGameStore.getState().continueAfterSettlementIntro();

    // continueAfterSettlement()(=advanceToNextTurn())が呼ばれる直前に、既に
    // troubleCharacterAnnounceInfoが表示中の状況を再現する(例: 直前のhandoffで既に立っていた場合)。
    const existingAnnounce = { kind: "handoff" as const, fromPlayerId: "p1", fromPlayerName: "テストP1", toPlayerId: "p1", toPlayerName: "テストP1" };
    useGameStore.setState({ troubleCharacterAnnounceInfo: existingAnnounce });

    useGameStore.getState().continueAfterSettlement();

    const after = useGameStore.getState();
    expect(after.turn).toBe(13);
    // 既に表示中だったtroubleCharacterAnnounceInfoはそのまま残り、上書きされない。
    expect(after.troubleCharacterAnnounceInfo).toEqual(existingAnnounce);
    // 新年度の告知は同時マウントされず、pendingへ保留される(内容は失われない)。
    expect(after.yearEventAnnounceInfo).toBeNull();
    expect(after.pendingYearEventAnnounceInfo).toEqual({ year: 2, eventId: after.currentYearEventId });

    // 表示中のtroubleCharacterAnnounceInfoをdismissすると、保留されていたyearEventAnnounceInfoが
    // 続けて表示される。
    useGameStore.getState().dismissTroubleCharacterAnnounce();
    const afterDismiss = useGameStore.getState();
    expect(afterDismiss.troubleCharacterAnnounceInfo).toBeNull();
    expect(afterDismiss.yearEventAnnounceInfo).toEqual({ year: 2, eventId: after.currentYearEventId });
    expect(afterDismiss.pendingYearEventAnnounceInfo).toBeNull();
  });

  describe("両方同時発生(新年度開始 かつ 妨害キャラ所有者の悪さが同じターンで成立)", () => {
    function triggerBothSimultaneously() {
      useGameStore.setState({
        turn: 12, // 1年目最終月
        troubleCharacterOwnerId: "p1",
        troubleCharacterFormId: "normal",
        troubleCharacterPossessionCount: 0,
      });

      playOutOneTurn(); // → settlementIntro(まだadvanceToNextTurn()は呼ばれていない)
      useGameStore.getState().continueAfterSettlementIntro(); // → settlement

      // 悪さ抽選(advanceToNextTurn()内、continueAfterSettlement()呼び出しの中)をmoney側に固定する。
      vi.spyOn(Math, "random").mockReturnValue(MISCHIEF_MONEY_RANDOM);
      useGameStore.getState().continueAfterSettlement(); // → advanceToNextTurn(): turn13(isYearStart)+mischief同時確定
    }

    it("同時発生時、yearEventAnnounceInfoだけが表示され、troubleCharacterAnnounceInfoはpendingへ保留される", () => {
      const p1MoneyBefore = useGameStore.getState().players[0].money;

      triggerBothSimultaneously();

      const after = useGameStore.getState();
      expect(after.turn).toBe(13);
      // 1. yearEventだけが表示される。
      expect(after.yearEventAnnounceInfo).toEqual({ year: 2, eventId: after.currentYearEventId });
      // 2. troubleCharacterAnnounceInfoは同時マウントされない(nullのまま)。
      expect(after.troubleCharacterAnnounceInfo).toBeNull();
      // 3. 内容は失われず、pendingへ保留されている。
      expect(after.pendingTroubleCharacterAnnounceInfo).toMatchObject({ kind: "mischief", playerId: "p1", mischiefKind: "money" });
      expect(after.pendingYearEventAnnounceInfo).toBeNull();
      // 7. ゲーム効果(所持金)自体は表示タイミングと無関係に、このset()の時点で既に確定している。
      expect(after.players[0].money).not.toBe(p1MoneyBefore);
      expect(after.troubleCharacterPossessionCount).toBe(1); // 悪さ1回分カウントも既に加算済み
    });

    it("最初(yearEvent)をdismissすると、保留されていたtroubleCharacterAnnounceInfoが続けて表示される", () => {
      triggerBothSimultaneously();
      const pendingBefore = useGameStore.getState().pendingTroubleCharacterAnnounceInfo;

      useGameStore.getState().dismissYearEventAnnounce();

      const after = useGameStore.getState();
      expect(after.yearEventAnnounceInfo).toBeNull();
      expect(after.troubleCharacterAnnounceInfo).toEqual(pendingBefore);
      expect(after.pendingTroubleCharacterAnnounceInfo).toBeNull();
    });

    it("2つ目(troubleCharacter)も正常にdismissでき、以降は両方nullのまま安定する", () => {
      triggerBothSimultaneously();
      useGameStore.getState().dismissYearEventAnnounce();

      useGameStore.getState().dismissTroubleCharacterAnnounce();

      const after = useGameStore.getState();
      expect(after.troubleCharacterAnnounceInfo).toBeNull();
      expect(after.yearEventAnnounceInfo).toBeNull();
      expect(after.pendingTroubleCharacterAnnounceInfo).toBeNull();
      expect(after.pendingYearEventAnnounceInfo).toBeNull();
      // 通常のrolling進行に戻っている(ゲーム進行自体は一切止まっていない)。
      expect(after.status).toBe("rolling");
    });

    it("ゲーム状態(所持金・憑依カウント・年度イベントの倍率対象年)は、演出の表示順序に一切左右されない", () => {
      const p1MoneyBefore = useGameStore.getState().players[0].money;
      triggerBothSimultaneously();
      const immediatelyAfter = useGameStore.getState();
      const moneyAfterTrigger = immediatelyAfter.players[0].money;
      const countAfterTrigger = immediatelyAfter.troubleCharacterPossessionCount;
      const yearEventIdAfterTrigger = immediatelyAfter.currentYearEventId;

      // dismissを2回進めても、上記のゲーム状態は変化しない(表示のON/OFFだけを操作するため)。
      useGameStore.getState().dismissYearEventAnnounce();
      useGameStore.getState().dismissTroubleCharacterAnnounce();

      const after = useGameStore.getState();
      expect(after.players[0].money).toBe(moneyAfterTrigger);
      expect(after.players[0].money).not.toBe(p1MoneyBefore);
      expect(after.troubleCharacterPossessionCount).toBe(countAfterTrigger);
      expect(after.currentYearEventId).toBe(yearEventIdAfterTrigger);
    });
  });
});
