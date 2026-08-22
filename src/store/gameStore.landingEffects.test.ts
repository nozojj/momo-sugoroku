// マス効果(プラス/マイナス/カード/物件/イベント)の自動テスト(第2弾)。
//
// 共通の最重要仕様: 対象マスを「通過」しただけでは効果が一切発動せず、remainingMovesを
// 使い切ってそのマスに「停止」した場合だけ発動する。目的地到着テスト(第1弾)と全く同じ
// ゲート構造(resolveLanding()はremainingMoves<=0のときしか呼ばれない)を土台にしている。
//
// 検証する対象はuseGameStoreの公開アクション(rollDice/advanceStep/chooseRoute、必要に応じて
// continueAfterCardDraw)だけで、resolveLanding()等のprivateな内部関数はテストのために
// exportしたり分割したりしていない。
//
// 実装前に getTraversableOptions()/ノードのtype を実マップに対して再確認済み(詳細は各describe
// 内のコメントを参照)。前提が崩れていないかは、各テストの冒頭で node.type を直接assertすることで
// 都度確認している。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { getMap } from "@/data/maps";
import { getNode } from "@/lib/game/mapGraph";
import { resolveLandingOutcome } from "@/lib/game/landingEffects";
import { EVENT_NODE_REGION_MAP, REGIONAL_EVENT_POOLS } from "@/data/events";
import { freshGame, placePlayerAt, mockSingleDiceFace, advanceUntilAt, driveToLandingToward } from "./gameStore.testHelpers";

const MAP_ID = "shonan-full";
// 経路に影響しない、離れた場所の目的地(このテストでは目的地到着そのものは検証しない)。
const UNRELATED_DESTINATION = "hub_kamakura";

describe("マス効果: 通過では発動せず、停止したときだけ発動する", () => {
  beforeEach(() => {
    freshGame();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("プラスマス (moneyGain): r_fjrt_gate_fjrt_e_1", () => {
    // hub_fujisawa(4方向分岐) → r_fjrt_gate_fjrt_e_1(moneyGain) → fjrt_e(normal、単一経路)
    const START = "hub_fujisawa";
    const TARGET = "r_fjrt_gate_fjrt_e_1";

    it("前提: 対象ノードのtypeがmoneyGainである", () => {
      expect(getNode(getMap(MAP_ID), TARGET).type).toBe("moneyGain");
    });

    it("通過時: money・moneyRouletteInfo・statusとも変化せず、ログも増えない", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;

      mockSingleDiceFace(2); // 距離1のTARGETを1歩目で通過させ、2歩目で別マスへ抜ける
      useGameStore.getState().rollDice();
      // rollDice()自身が積むログ("...振った")を含めた時点を基準にし、以降「移動そのもの」が
      // ログを増やしていないかだけを見る。
      const logLenAfterRoll = useGameStore.getState().log.length;
      advanceUntilAt(TARGET); // hub_fujisawaの分岐でTARGET方向を選び、TARGET到達直前で止める

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET); // 対象ノード上にいる
      expect(s.remainingMoves).toBeGreaterThan(0); // まだ移動中
      expect(s.players[0].money).toBe(startMoney); // money不変
      expect(s.moneyRouletteInfo).toBeNull(); // マス効果用状態になっていない
      expect(s.status).not.toBe("moneyRoulette");
      expect(s.log.length).toBe(logLenAfterRoll); // マス効果由来のログが追加されていない
    });

    it("停止時: moneyが増加しstatus:moneyRouletteになる", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;

      mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
      useGameStore.getState().rollDice();
      driveToLandingToward(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBe(0);
      expect(s.players[0].money).toBeGreaterThan(startMoney); // moneyGainなので必ず増える
      expect(s.status).toBe("moneyRoulette");
      expect(s.moneyRouletteInfo).not.toBeNull();
    });
  });

  describe("マイナスマス (moneyLoss): r_fjrt_gate_fjrt_w_1", () => {
    // hub_fujisawa(4方向分岐) → r_fjrt_gate_fjrt_w_1(moneyLoss) → fjrt_w(moneyLoss、単一経路)
    // 通過後にfjrt_w自身のmoneyLossを踏むことになるが、このテストの関心はTARGET通過の瞬間だけ
    // なので、その先で別のmoneyLossに当たること自体はテストの正しさに影響しない。
    const START = "hub_fujisawa";
    const TARGET = "r_fjrt_gate_fjrt_w_1";

    it("前提: 対象ノードのtypeがmoneyLossである", () => {
      expect(getNode(getMap(MAP_ID), TARGET).type).toBe("moneyLoss");
    });

    it("通過時: money・moneyRouletteInfo・statusとも変化せず、ログも増えない", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;

      mockSingleDiceFace(2);
      useGameStore.getState().rollDice();
      const logLenAfterRoll = useGameStore.getState().log.length;
      advanceUntilAt(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBeGreaterThan(0);
      expect(s.players[0].money).toBe(startMoney);
      expect(s.moneyRouletteInfo).toBeNull();
      expect(s.status).not.toBe("moneyRoulette");
      expect(s.log.length).toBe(logLenAfterRoll);
    });

    it("停止時: moneyが減少しstatus:moneyRouletteになる", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;

      mockSingleDiceFace(1);
      useGameStore.getState().rollDice();
      driveToLandingToward(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBe(0);
      expect(s.players[0].money).toBeLessThan(startMoney); // moneyLossなので必ず減る
      expect(s.status).toBe("moneyRoulette");
      expect(s.moneyRouletteInfo).not.toBeNull();
    });
  });

  describe("カードマス (card): r_tslp_gate_tslp_n_1", () => {
    // hub_tsujido(3方向分岐) → r_tslp_gate_tslp_n_1(card) → tslp_n(normal、単一経路)
    const START = "hub_tsujido";
    const TARGET = "r_tslp_gate_tslp_n_1";

    it("前提: 対象ノードのtypeがcardである", () => {
      expect(getNode(getMap(MAP_ID), TARGET).type).toBe("card");
    });

    it("通過時: cardDrawInfo・status・cardIdsとも変化しない", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startCardIds = useGameStore.getState().players[0].cardIds;

      mockSingleDiceFace(2);
      useGameStore.getState().rollDice();
      const logLenAfterRoll = useGameStore.getState().log.length;
      advanceUntilAt(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBeGreaterThan(0);
      expect(s.cardDrawInfo).toBeNull();
      expect(s.status).not.toBe("cardDraw");
      expect(s.players[0].cardIds).toEqual(startCardIds);
      expect(s.log.length).toBe(logLenAfterRoll);
    });

    it("停止時: status:cardDrawになり、continueAfterCardDraw()で1枚だけ手札に加わる", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startCardCount = useGameStore.getState().players[0].cardIds.length;

      mockSingleDiceFace(1);
      useGameStore.getState().rollDice();
      driveToLandingToward(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBe(0);
      expect(s.status).toBe("cardDraw");
      expect(s.cardDrawInfo).not.toBeNull();
      expect(s.players[0].cardIds.length).toBe(startCardCount); // まだ手札には入っていない

      // 演出モーダルを閉じる操作(公開アクション)まで進め、1回だけ加算されることを確認する。
      useGameStore.getState().continueAfterCardDraw();
      const afterDraw = useGameStore.getState();
      expect(afterDraw.players[0].cardIds.length).toBe(startCardCount + 1);

      // 既にcardDrawInfoが消費された後にもう一度呼んでも、二重に加算されないこと(no-opガード確認)。
      useGameStore.getState().continueAfterCardDraw();
      expect(useGameStore.getState().players[0].cardIds.length).toBe(startCardCount + 1);
    });
  });

  describe("物件マス (property): r_fj_kg_1", () => {
    // hub_fujisawa(4方向分岐) → r_fj_kg_1(property, 藤沢駅前グループ) → hub_fujisawaへ
    // 折り返す行き止まり構造(単一経路)。
    const START = "hub_fujisawa";
    const TARGET = "r_fj_kg_1";
    const EXPECTED_GROUP_ID = "grp_fujisawa_ekimae";

    it("前提: 対象ノードのtypeがpropertyでグループIDが一致する", () => {
      const node = getNode(getMap(MAP_ID), TARGET);
      expect(node.type).toBe("property");
      expect(node.propertyGroupId).toBe(EXPECTED_GROUP_ID);
    });

    it("通過時: pendingPropertyGroupId・status・money・ownedPropertyIdsとも変化しない", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;
      const startOwned = useGameStore.getState().players[0].ownedPropertyIds;

      mockSingleDiceFace(2);
      useGameStore.getState().rollDice();
      const logLenAfterRoll = useGameStore.getState().log.length;
      advanceUntilAt(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBeGreaterThan(0);
      expect(s.pendingPropertyGroupId).toBeNull();
      expect(s.status).not.toBe("purchaseOffer");
      expect(s.players[0].money).toBe(startMoney);
      expect(s.players[0].ownedPropertyIds).toEqual(startOwned);
      expect(s.log.length).toBe(logLenAfterRoll);
    });

    it("停止時: status:purchaseOfferになり、pendingPropertyGroupIdが対象グループになる(購入はされない)", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;
      const startOwned = useGameStore.getState().players[0].ownedPropertyIds;

      mockSingleDiceFace(1);
      useGameStore.getState().rollDice();
      driveToLandingToward(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBe(0);
      expect(s.status).toBe("purchaseOffer");
      expect(s.pendingPropertyGroupId).toBe(EXPECTED_GROUP_ID);
      // 停止しただけでは購入(所持金減算・所有権付与)は発生しない。
      expect(s.players[0].money).toBe(startMoney);
      expect(s.players[0].ownedPropertyIds).toEqual(startOwned);
    });
  });

  describe("イベントマス (event): r_kg_ks_2", () => {
    // r_kg_ks_1(moneyGain、隣接: wp_kugenuma / r_kg_ks_2 の2方向)から出発し、
    // r_kg_ks_2(event)へ向かう分岐を1回選ぶ。その先は単一経路でr_kg_ks_3(normal)へ抜ける。
    // eventは停止時に同期的にendTurn()まで進む(resolvingEventは観測できない)ため、
    // money変化・ログ追加・ターン進行で「発動した」ことを確認する。
    const START = "r_kg_ks_1";
    const TARGET = "r_kg_ks_2";

    it("前提: 対象ノードのtypeがeventである", () => {
      expect(getNode(getMap(MAP_ID), TARGET).type).toBe("event");
    });

    it("通過時: money・ログ・ターン進行のいずれも変化しない", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;
      const startTurn = useGameStore.getState().turn;
      const startIndex = useGameStore.getState().currentPlayerIndex;

      mockSingleDiceFace(2); // 距離1のTARGETを通過させ、その先(r_kg_ks_3)まで進める
      useGameStore.getState().rollDice();
      const logLenAfterRoll = useGameStore.getState().log.length;
      advanceUntilAt(TARGET);

      const s = useGameStore.getState();
      expect(s.players[0].currentNodeId).toBe(TARGET);
      expect(s.remainingMoves).toBeGreaterThan(0);
      expect(s.players[0].money).toBe(startMoney);
      expect(s.log.length).toBe(logLenAfterRoll);
      expect(s.turn).toBe(startTurn);
      expect(s.currentPlayerIndex).toBe(startIndex);
    });

    it("停止時: moneyが変化しログが1件増え、正常にターン進行へ進む", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const startMoney = useGameStore.getState().players[0].money;
      const startTurn = useGameStore.getState().turn;
      const logLenBeforeRoll = useGameStore.getState().log.length;

      mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
      useGameStore.getState().rollDice();
      driveToLandingToward(TARGET);

      const s = useGameStore.getState();
      // eventは着地から同期的にendTurn()まで進むため、着地ノードそのものは既にcurrentNodeIdで
      // なくなっている場合がある(1人プレイなので次の自分の手番=turn+1として観測できる)。
      expect(s.players[0].money).not.toBe(startMoney); // 湘南イベントは正負どちらも0にはならない
      expect(s.log.length).toBeGreaterThan(logLenBeforeRoll); // イベントログが追加されている
      expect(s.status).toBe("rolling"); // 着地処理後、正常に次のターンへ進んでいる
      expect(s.turn).toBe(startTurn + 1); // 1人プレイなので毎ターンturnが進む
    });

    describe("landingResultInfo(Phase9B/P9-3): 非ブロッキング通知の内容とターン進行への影響", () => {
      // rollDice()が消費する最初のMath.random()だけdice=1相当の値に固定し(TARGETでちょうど
      // 停止させるため)、後続の呼び出し(event pool抽選)を個別に固定することで、プラス側・
      // マイナス側それぞれの実データ(実際にeventPoolForNode()が返す文言・金額)を再現する。
      it("プラス側: landingResultInfoがkind:moneyGainで、金額・メッセージが実際のmoney変化と一致し、ターンは即座に次へ進む", () => {
        placePlayerAt(START, UNRELATED_DESTINATION);
        const startMoney = useGameStore.getState().players[0].money;
        const startTurn = useGameStore.getState().turn;
        const player = useGameStore.getState().players[0];

        vi.spyOn(Math, "random").mockReturnValueOnce((1 - 0.5) / 6).mockReturnValue(0.05);
        useGameStore.getState().rollDice();
        driveToLandingToward(TARGET);

        const s = useGameStore.getState();
        const delta = s.players[0].money - startMoney;
        expect(delta).toBeGreaterThan(0);
        expect(s.landingResultInfo).toMatchObject({
          playerId: player.id,
          playerName: player.name,
          playerColor: player.color,
          kind: "moneyGain",
          amount: delta,
        });
        expect(s.landingResultInfo?.message).toContain(`+${delta}万円`);
        // 制御フロー(resolveLanding→finishLandingAndEndTurn→endTurn)は変更していないため、
        // 通知が乗っていてもターンは今まで通り即座に次のプレイヤーのrollingへ進んでいる。
        expect(s.status).toBe("rolling");
        expect(s.turn).toBe(startTurn + 1);
      });

      it("マイナス側: landingResultInfoがkind:moneyLossで、金額・メッセージが実際のmoney変化と一致し、ターンは即座に次へ進む", () => {
        placePlayerAt(START, UNRELATED_DESTINATION);
        const startMoney = useGameStore.getState().players[0].money;
        const startTurn = useGameStore.getState().turn;
        const player = useGameStore.getState().players[0];

        vi.spyOn(Math, "random").mockReturnValueOnce((1 - 0.5) / 6).mockReturnValue(0.75);
        useGameStore.getState().rollDice();
        driveToLandingToward(TARGET);

        const s = useGameStore.getState();
        const delta = s.players[0].money - startMoney;
        expect(delta).toBeLessThan(0);
        expect(s.landingResultInfo).toMatchObject({
          playerId: player.id,
          playerName: player.name,
          playerColor: player.color,
          kind: "moneyLoss",
          amount: delta,
        });
        expect(s.landingResultInfo?.message).toContain(`${delta}万円`);
        expect(s.status).toBe("rolling");
        expect(s.turn).toBe(startTurn + 1);
      });

      it("dismissLandingResult()を呼ぶとnullに戻る(他の状態には影響しない)", () => {
        placePlayerAt(START, UNRELATED_DESTINATION);
        vi.spyOn(Math, "random").mockReturnValueOnce((1 - 0.5) / 6).mockReturnValue(0.05);
        useGameStore.getState().rollDice();
        driveToLandingToward(TARGET);

        expect(useGameStore.getState().landingResultInfo).not.toBeNull();
        const statusBefore = useGameStore.getState().status;
        const turnBefore = useGameStore.getState().turn;

        useGameStore.getState().dismissLandingResult();

        const s = useGameStore.getState();
        expect(s.landingResultInfo).toBeNull();
        expect(s.status).toBe(statusBefore);
        expect(s.turn).toBe(turnBefore);
      });
    });
  });

  describe("NodeType「money」(¥)の着地結果", () => {
    // ¥タイプは現時点のshonan-fullマップには1件も配置されていない(データ生成側の未使用型)。
    // resolveLanding()の"money"分岐はLandingOutcome.kindだけを見てNodeType自体は区別しないため、
    // ここではresolveLandingOutcome()を直接呼ぶ関数レベルのテストで「¥タイプもeventタイプと
    // 同じkind:"money"を返す(=同じコードパスでlandingResultInfoが正しく載る)」ことだけを保証する。
    it("resolveLandingOutcome()にNodeType money のノードを渡すと、eventと同じkind:\"money\"を返す", () => {
      freshGame();
      placePlayerAt("r_kg_ks_1", UNRELATED_DESTINATION);
      const state = useGameStore.getState();
      const map = getMap(MAP_ID);
      const player = state.players[0];
      const baseNode = getNode(map, "r_kg_ks_1");
      const moneyNode = { ...baseNode, type: "money" as const };

      const outcome = resolveLandingOutcome({ state, map, node: moneyNode, player });

      expect(outcome.kind).toBe("money");
      if (outcome.kind === "money") {
        expect(typeof outcome.amount).toBe("number");
        expect(outcome.amount).not.toBe(0); // 湘南イベントは正負どちらも0にはならない(既存仕様)
      }
    });
  });

  describe("地域イベント: 鎌倉のイベントマス (event): kmlp_se", () => {
    // kmlp_s(4方向分岐) → kmlp_se(event、EVENT_NODE_REGION_MAPでkamakuraに登録済み)
    const START = "kmlp_s";
    const TARGET = "kmlp_se";

    it("前提: 対象ノードのtypeがeventであり、EVENT_NODE_REGION_MAPでkamakuraに登録されている", () => {
      expect(getNode(getMap(MAP_ID), TARGET).type).toBe("event");
      expect(EVENT_NODE_REGION_MAP[TARGET]).toBe("kamakura");
    });

    it("停止時: 鎌倉地域プール(event_kamakura_*)のいずれかのメッセージがログへ追加される", () => {
      placePlayerAt(START, UNRELATED_DESTINATION);
      const logLenBeforeRoll = useGameStore.getState().log.length;
      const kamakuraMessages = new Set(REGIONAL_EVENT_POOLS.kamakura!.map((e) => e.message));

      mockSingleDiceFace(1); // 距離1、ちょうどTARGETで止まる
      useGameStore.getState().rollDice();
      driveToLandingToward(TARGET);

      const s = useGameStore.getState();
      const newLogMessages = s.log.slice(logLenBeforeRoll).map((entry) => entry.message);
      const matched = newLogMessages.some((msg) => [...kamakuraMessages].some((m) => msg.includes(m)));
      expect(matched, `鎌倉地域プールのメッセージが見つからない。実際のログ: ${JSON.stringify(newLogMessages)}`).toBe(
        true,
      );
    });
  });
});
