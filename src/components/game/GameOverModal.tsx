"use client";

import { useEffect, useState } from "react";
import type { NetWorthHistoryEntry, Player } from "@/types/game";
import { formatMoney } from "@/lib/format";
import { rankPlayers, type RankedPlayer } from "@/lib/game/engine";
import { propertyDefs } from "@/data/properties";
import { propertyGroupDefs } from "@/data/propertyGroups";
import { isGroupMonopolized, isRegionMonopolized } from "@/lib/game/propertyOwnership";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { playSE } from "@/lib/audio/soundManager";
import { NetWorthTrendChart } from "./NetWorthTrendChart";
import { CharacterSprite } from "./CharacterSprite";
import { AnnouncerEffectLayer } from "./AnnouncerEffectLayer";

interface GameOverModalProps {
  players: Player[];
  winnerIds: string[];
  totalYears: number;
  netWorthHistory: NetWorthHistoryEntry[];
  onRestart: () => void;
}

/**
 * ゲーム終了時の最終結果画面。決算画面(SettlementScreen)と同じデザイン言語
 * (トークン・ランキングカード・アワード帯・チャート配置パターン)を踏襲する。
 *
 * 表示専用: players/winnerIds/netWorthHistoryを並べ替え・集計して表示するだけで、
 * GameState・gameStore側の状態は一切変更しない(呼べるstoreアクションはonRestartの1つだけ)。
 * 最終決算(status:"settlement")からゲーム終了(status:"finished")への遷移は
 * continueAfterSettlement()→advanceToNextTurn()が手番送りするだけでプレイヤー操作を
 * 一切挟まないため、ここで受け取るplayersの所有物件・目的地到着回数は最終決算時点の
 * ものとそのまま一致する(独占状況・物件数もここで安全に再計算できる)。
 *
 * game_over_fanfareの再生はここでは行わない(最終順位発表演出FinalRaceSequence.tsxの
 * introフェーズへ移設済み。GameScreen.tsxはstatus:"finished"になるとまずFinalRaceSequenceを
 * 表示し、その演出が完了(onFinish)してからこのGameOverModalへ切り替える)。
 *
 * P11-3-B2c-4: FinalRaceSequence→GameOverModalの切り替えはGameScreen.tsx側でraceSequenceDone
 * (boolean)が反転した瞬間の排他的な条件レンダリングであり、両者が同時にマウントされる瞬間は
 * 存在しない(=背後のBoardが一瞬透けて見えるリスクが構造的に無い)。ハードカット感を和らげる
 * ため、このコンポーネント側だけでmount直後にopacity 0→100のfade-inを行う
 * (GameDrawer.tsxのbackdropと同じtransition-opacity+opacityクラス切り替えパターンを踏襲、
 * 新規ライブラリ・新規keyframeは使わない)。GameScreen.tsxの状態機械・z-index構成は一切
 * 変更しない。
 */
export function GameOverModal({ players, winnerIds, totalYears, netWorthHistory, onRestart }: GameOverModalProps) {
  const isTie = winnerIds.length > 1;
  const winner = players.find((p) => p.id === winnerIds[0]);
  const ranked = rankPlayers(players);
  const awards = computeFinalAwards(players);
  const reduceMotion = usePrefersReducedMotion();
  const isMobile = useIsMobileViewport();

  // mount直後は常にfalseで描画し、次のeffectでtrueへ切り替える(GameDrawer.tsxのopen状態と
  // 同じ「初期値→effectで反転」による2フレーム構成)。reduceMotion自体もusePrefersReducedMotion()
  // の仕様上、初回レンダーでは常にfalseを返し実値はeffectで後追い確定するため(SSR安全性のための
  // 既存パターン、FinalRaceSequence.tsxのintro effectと同じ制約)、reduced-motionユーザーでも
  // ごく最初の1フレームだけopacity-0を経由しうるが、直後のeffectで即座にopacity-100へ収束し、
  // transitionクラス自体を付けないため体感上のフェードは発生しない。
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(true);
  }, []);
  const fadeOpacityClass = reduceMotion || entered ? "opacity-100" : "opacity-0";
  const fadeTransitionClass = reduceMotion ? "" : "transition-opacity duration-300";

  return (
    // Visual Prototype 1.5: 「遊び切ったご褒美画面」として、GameStateの他画面より明確に一段豪華な
    // 暖色グラデーションの全画面背景。SettlementScreenより彩度・輝き感を強めて「フィナーレ」感を出す。
    // 情報構造(タイトル→アワード→ランキング→チャート→ボタン)は無変更。
    <div
      className={`fixed inset-0 z-50 overflow-y-auto bg-linear-to-b from-amber-200 via-orange-100 to-amber-50 p-4 dark:from-amber-950/50 dark:via-slate-900 dark:to-slate-950 ${fadeTransitionClass} ${fadeOpacityClass}`}
    >
      <div className="mx-auto my-6 w-full max-w-sm rounded-2xl border-2 border-amber-300/70 bg-linear-to-b from-white to-amber-50/50 p-5 shadow-2xl dark:border-amber-400/20 dark:from-slate-800 dark:to-slate-800/80 lg:max-w-5xl lg:p-8">
        <div className="text-center">
          {/* P9-2: 到着演出(DestinationCelebrationScreen)と同じ組み合わせ(CharacterSprite+
              AnnouncerEffectLayer)をトロフィー脇に絶対配置で添え、「フィナーレ」感を出す。
              relativeラッパーはトロフィーと同じw-fitで内容にフィットさせ、ランキングカード等
              下の情報レイアウトの幅・高さには一切影響しない。reduced-motion時はDestination
              CelebrationScreenと同じく粒子演出(AnnouncerEffectLayer)だけを非表示にし、
              キャラクター自体(静止画)は変わらず表示して「勝者である」情報を保つ。 */}
          <div className="relative mx-auto flex w-fit items-end justify-center gap-1">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-b from-amber-200 to-amber-400 text-4xl shadow-lg dark:from-amber-400/40 dark:to-amber-600/30">
              🏆
            </div>
            <CharacterSprite characterId="navi" expression="happy" className="h-16 w-16 sm:h-20 sm:w-20" />
            {!reduceMotion && <AnnouncerEffectLayer effect={{ confetti: true, sparkle: true }} mobile={isMobile} />}
          </div>
          <h2 className="mt-3 bg-linear-to-r from-amber-600 to-orange-500 bg-clip-text text-xl font-black text-transparent dark:from-amber-300 dark:to-orange-300">
            {isTie ? "引き分け!" : `${winner?.name}さんの勝ち!`}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{totalYears}年間のプレイが終了しました</p>
        </div>

        {awards.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
            {awards.map((award) => (
              <AwardChip key={award.key} award={award} />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
          <div className="grid grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-2 lg:items-start">
            {ranked.map((r) => (
              <RankingCard key={r.player.id} ranked={r} />
            ))}
          </div>

          <div className="lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
            <h2 className="mb-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">資産推移</h2>
            <NetWorthTrendChart history={netWorthHistory} players={players} />
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => {
              // Phase10/P10-4-4: セッション終了後の1回きりの確定操作。GameOverModalはCPUの
              // 自動操作経路が存在しない(常に人間がクリックする)ため、CPU向けの状態差分検知は不要。
              playSE("ui_select");
              onRestart();
            }}
            className="w-full rounded-xl border-b-4 border-amber-700 bg-linear-to-b from-amber-400 to-amber-500 py-2.5 font-black text-slate-900 shadow-md transition active:translate-y-0.5 active:border-b-0 dark:border-amber-800"
          >
            もう一度遊ぶ
          </button>
        </div>
      </div>
    </div>
  );
}

/** 指定プレイヤーが最終的に独占しているグループ/地域の一覧。PlayerHud.tsxのmonopolyBadges()
 *  と同じ計算(地域を完全独占していれば、その地域に属く個別グループの表示は出さない)を、
 *  この画面専用に独立して持つ(SettlementScreen.tsxのmonopolyNotes()がpropertyBreakdown由来
 *  なのに対し、ここはpropertyBreakdownを持たないため players から直接再計算する)。 */
function monopolyLabelsFor(player: Player): { key: string; label: string; region: boolean }[] {
  const ownedGroupIds = [
    ...new Set(player.ownedPropertyIds.map((id) => propertyDefs.find((p) => p.id === id)?.groupId).filter((id): id is string => !!id)),
  ];
  const ownedGroups = ownedGroupIds
    .map((id) => propertyGroupDefs.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g);

  const monopolizedRegions = [...new Set(ownedGroups.map((g) => g.region))].filter((region) =>
    isRegionMonopolized(region, player.id, [player], propertyDefs, propertyGroupDefs),
  );

  const regionBadges = monopolizedRegions.map((region) => ({ key: `region_${region}`, label: `🌐 ${region}エリア 完全独占`, region: true }));

  const groupBadges = ownedGroups
    .filter((g) => !monopolizedRegions.includes(g.region))
    .filter((g) => isGroupMonopolized(g.id, player.id, [player], propertyDefs))
    .map((g) => ({ key: `group_${g.id}`, label: `✨ ${g.name} 独占`, region: false }));

  return [...regionBadges, ...groupBadges];
}

interface Award {
  key: string;
  icon: string;
  label: string;
  winners: Player[];
}

/**
 * 最終アワード(物件王・目的地到着王・独占マイスター)をplayersだけから算出する。
 * 誰も達成していない(最大値が0)場合はそのアワード自体を出さない。同率は該当者全員を
 * winnersに含める。資産成長No.1は今回のスコープには含めない。
 */
function computeFinalAwards(players: Player[]): Award[] {
  const awards: Award[] = [];

  const maxProperties = Math.max(...players.map((p) => p.ownedPropertyIds.length));
  if (maxProperties > 0) {
    awards.push({
      key: "property",
      icon: "🏠",
      label: "物件王",
      winners: players.filter((p) => p.ownedPropertyIds.length === maxProperties),
    });
  }

  const maxDestinations = Math.max(...players.map((p) => p.destinationsReached));
  if (maxDestinations > 0) {
    awards.push({
      key: "destination",
      icon: "🎯",
      label: "目的地到着王",
      winners: players.filter((p) => p.destinationsReached === maxDestinations),
    });
  }

  const monopolyCounts = players.map((p) => ({ player: p, count: monopolyLabelsFor(p).length }));
  const maxMonopolyCount = Math.max(...monopolyCounts.map((m) => m.count));
  if (maxMonopolyCount > 0) {
    awards.push({
      key: "monopoly",
      icon: "🏰",
      label: "独占マイスター",
      winners: monopolyCounts.filter((m) => m.count === maxMonopolyCount).map((m) => m.player),
    });
  }

  return awards;
}

function AwardChip({ award }: { award: Award }) {
  const names = award.winners.map((w) => w.name).join("・");
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-amber-900/10 bg-linear-to-b from-white/90 to-amber-50/70 py-1 pl-1 pr-3 shadow-sm dark:border-amber-100/10 dark:from-slate-800/70 dark:to-slate-800/50 sm:shrink sm:justify-center sm:py-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-amber-200 to-amber-300 text-xs dark:from-amber-400/30 dark:to-amber-500/20">
        {award.icon}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="whitespace-nowrap text-[9px] font-bold text-slate-400 dark:text-slate-500">{award.label}</span>
        <span className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">{names}</span>
      </span>
    </div>
  );
}

function RankingCard({ ranked }: { ranked: RankedPlayer }) {
  const { player, rank, tied } = ranked;
  const monopolyLabels = monopolyLabelsFor(player);

  return (
    // Visual Prototype 1.5: PlayerHud/SettlementScreenと同じ「プレイヤーカラーの左帯」で統一。
    <div
      className={`rounded-xl border p-3 shadow-sm ${
        rank === 1
          ? "border-amber-400 bg-linear-to-b from-amber-100 to-amber-50/80 shadow-md dark:border-amber-400/50 dark:from-amber-400/15 dark:to-amber-400/5"
          : "border-amber-900/10 bg-linear-to-b from-white/95 to-amber-50/40 dark:border-amber-100/10 dark:from-slate-800/70 dark:to-slate-800/50"
      }`}
      style={{ borderLeft: `3px solid ${player.color}` }}
    >
      <div className="flex items-center gap-2">
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
            {rank === 1 ? "👑 " : ""}
            {rank}位
          </span>
          {tied && (
            <span className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-bold text-sky-600 dark:bg-sky-400/10 dark:text-sky-300">
              同率
            </span>
          )}
        </span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: player.color }} />
        <span className="min-w-0 truncate text-sm font-bold text-slate-800 dark:text-white">{player.name}さん</span>
        <span className="ml-auto shrink-0 text-right">
          <span className="block text-sm font-black text-slate-800 dark:text-white">{formatMoney(ranked.netWorth)}</span>
          <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500">総資産</span>
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-center text-xs text-slate-500 dark:text-slate-400">
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">現金</p>
          <p className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{formatMoney(player.money)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">所有物件</p>
          <p className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{player.ownedPropertyIds.length}件</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">目的地到着</p>
          <p className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{player.destinationsReached}回</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {monopolyLabels.length > 0 ? (
          monopolyLabels.map((note) => (
            <span
              key={note.key}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${note.region ? "bg-sky-500" : "bg-amber-500"}`}
            >
              {note.label}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold text-slate-400 dark:border-white/10 dark:text-slate-500">
            独占なし
          </span>
        )}
      </div>
    </div>
  );
}
