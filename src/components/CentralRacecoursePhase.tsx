import { useCallback, useEffect, useRef, useState } from 'react';
import BettingPhase from './BettingPhase';
import RacePhase from './RacePhase';
import ResultPhase from './ResultPhase';
import type { Bet } from '../core/odds_calculator';
import {
  acknowledgeCentralSettlements,
  fetchCentralRace,
  leaveCentral,
  replaceCentralBets,
  syncCentral,
  type CentralBet,
  type CentralMe,
  type CentralRace,
  type CentralSettlement,
  type CentralStatus,
} from '../network/centralServer';

function errorText(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'insufficient_balance') return '中央残高が足りません。';
  if (code === 'betting_closed') return '投票が締め切られました。';
  if (code === 'invalid_bets') return '馬券の組み合わせを確認してください。';
  return '中央サーバーと通信できませんでした。';
}

export default function CentralRacecoursePhase({ playerName, onClose }: { playerName: string; onClose: () => void }) {
  const [race, setRace] = useState<CentralRace | null>(null);
  const [status, setStatus] = useState<CentralStatus | null>(null);
  const [me, setMe] = useState<CentralMe | null>(null);
  const [message, setMessage] = useState('中央競馬場に接続しています…');
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [playback, setPlayback] = useState<{ race: CentralRace; startsAt: number } | null>(null);
  const [recentResult, setRecentResult] = useState<CentralRace | null>(null);
  const raceIdRef = useRef<string | null>(null);
  const playedRaceIdsRef = useRef(new Set<string>());
  const loadedResultIdsRef = useRef(new Set<string>());
  const syncingRef = useRef(false);
  const playbackRef = useRef<typeof playback>(null);
  const raceRef = useRef<typeof race>(null);
  const recentResultRef = useRef<typeof recentResult>(null);
  const serverOffsetRef = useRef(0);
  useEffect(() => { playbackRef.current = playback; }, [playback]);
  useEffect(() => { raceRef.current = race; }, [race]);
  useEffect(() => { recentResultRef.current = recentResult; }, [recentResult]);
  useEffect(() => { serverOffsetRef.current = serverOffsetMs; }, [serverOffsetMs]);

  const completePlayback = useCallback(() => {
    const completed = playbackRef.current;
    if (!completed) return;
    setRecentResult(completed.race);
    setPlayback(null);
  }, []);

  const beginPlayback = useCallback((finished: CentralRace) => {
    if (playedRaceIdsRef.current.has(finished.id) || !finished.simulation) return;
    playedRaceIdsRef.current.add(finished.id);
    setPlayback({ race: finished, startsAt: Date.now() + 3_000 });
  }, []);

  const sync = useCallback(async (signal?: AbortSignal) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const snapshot = await syncCentral(playerName, signal);
      const { race: nextRace, me: nextMe, status: nextStatus } = snapshot;

      // レース・結果表示中は参加維持だけ行い、背景の馬券画面を再描画しない。
      if (playbackRef.current || recentResultRef.current) return;

      const previousRaceId = raceIdRef.current;
      if (previousRaceId && previousRaceId !== nextRace.id) {
        try {
          const finished = await fetchCentralRace(previousRaceId, signal);
          if (finished.status === 'finished') beginPlayback(finished);
        } catch { /* 保存期限を過ぎたレースは次へ進む */ }
      }

      raceIdRef.current = nextRace.id;
      setRace((current) => current?.id === nextRace.id ? current : nextRace);
      setMe((current) => {
        if (!current) return nextMe;
        const currentKey = JSON.stringify([current.balance, current.tickets, current.settlements]);
        const nextKey = JSON.stringify([nextMe.balance, nextMe.tickets, nextMe.settlements]);
        return currentKey === nextKey ? current : nextMe;
      });
      setStatus((current) => current
        && current.participants === nextStatus.participants
        && current.win5Participants === nextStatus.win5Participants
        && current.horsePool.current === nextStatus.horsePool.current
        && current.nextRace.id === nextStatus.nextRace.id
        ? current : nextStatus);
      const nextOffset = nextStatus.serverTime - Date.now();
      setServerOffsetMs((current) => Math.abs(current - nextOffset) >= 250 ? nextOffset : current);
      setMessage('');

      const pending = nextMe.settlements[0];
      if (pending && nextStatus.serverTime - pending.createdAt < 120_000 && !playedRaceIdsRef.current.has(pending.raceId)) {
        try {
          beginPlayback(await fetchCentralRace(pending.raceId, signal));
        } catch { /* 古い未確認結果は結果通知だけ表示する */ }
      }
      if (pending && nextStatus.serverTime - pending.createdAt >= 120_000 && !loadedResultIdsRef.current.has(pending.raceId)) {
        try {
          const finished = await fetchCentralRace(pending.raceId, signal);
          loadedResultIdsRef.current.add(pending.raceId);
          setRecentResult(finished);
        } catch { /* 保存期限を過ぎた結果は次の同期で再試行する */ }
      }

      // 発走直後に受付対象が次レースへ切り替わっても、直前レースを必ず再生する。
      // raceIdRef の更新順だけに頼らず、次レースの発売開始時刻＝直前レース発走時刻から復元する。
      if (nextStatus.serverTime - nextRace.bettingOpensAt < 90_000) {
        const justFinishedId = new Date(nextRace.bettingOpensAt).toISOString();
        if (!playedRaceIdsRef.current.has(justFinishedId)) {
          try {
            const finished = await fetchCentralRace(justFinishedId, signal);
            if (finished.status === 'finished') beginPlayback(finished);
          } catch { /* サーバー確定待ちは次のポーリングで再試行 */ }
        }
      }
    } catch (error) {
      if (!signal?.aborted) setMessage(errorText(error));
    } finally {
      syncingRef.current = false;
    }
  }, [beginPlayback, playerName]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | null = null;
    let running = false;
    const schedule = () => {
      if (controller.signal.aborted) return;
      const activeRace = raceRef.current;
      const serverNow = Date.now() + serverOffsetRef.current;
      const untilStart = activeRace ? activeRace.startAt - serverNow : Number.POSITIVE_INFINITY;
      const delay = document.visibilityState === 'hidden'
        ? 30_000
        : playbackRef.current || recentResultRef.current
          ? 30_000
          : untilStart <= 15_000 && untilStart >= -12_000
            ? 1_000
            : 10_000;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), delay);
    };
    const run = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      try {
        await sync(controller.signal);
      } finally {
        running = false;
        schedule();
      }
    };
    const syncOnFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void run();
    };
    queueMicrotask(() => void run());
    document.addEventListener('visibilitychange', syncOnFocus);
    window.addEventListener('focus', syncOnFocus);
    return () => {
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', syncOnFocus);
      window.removeEventListener('focus', syncOnFocus);
      void leaveCentral().catch(() => undefined);
    };
  }, [sync]);

  const currentBets = me?.tickets.find((ticket) => ticket.raceId === race?.id)?.bets ?? [];

  const saveBets = async (nextBets: CentralBet[]) => {
    if (!race) throw new Error('レース情報がありません');
    try {
      const response = await replaceCentralBets(race.id, nextBets);
      setMe((current) => current ? {
        ...current,
        balance: response.balance,
        tickets: [
          ...current.tickets.filter((ticket) => ticket.raceId !== race.id),
          ...(response.bets.length ? [{ raceId: race.id, bets: response.bets, reservedAmount: response.reservedAmount, status: 'active', updatedAt: Date.now() }] : []),
        ],
      } : current);
    } catch (error) {
      throw new Error(errorText(error), { cause: error });
    }
  };

  const acknowledge = async (item: CentralSettlement) => {
    await acknowledgeCentralSettlements([item.id]);
    setMe((current) => current ? { ...current, settlements: current.settlements.filter((entry) => entry.id !== item.id) } : current);
    recentResultRef.current = null;
    setRecentResult(null);
    await sync();
  };

  const closeResult = async () => {
    recentResultRef.current = null;
    setRecentResult(null);
    await sync();
  };

  if (!race || !me) {
    return <div className="fixed inset-0 z-[90] grid place-items-center bg-[#111113] text-white"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"/><p className="font-black tracking-widest">{message}</p><button onClick={onClose} className="mt-5 text-xs font-bold text-gray-500">戻る</button></div></div>;
  }

  const raceData = {
    distance: race.conditions?.distance ?? 2000,
    field_condition: race.conditions?.fieldCondition ?? '良',
    weather: race.conditions?.weather ?? '晴',
    course_feature: race.conditions?.courseFeature ?? '平坦',
  };
  const settlement = me.settlements[0];
  const resultRace = recentResult;

  return (
    <div className="fixed inset-0 z-[90]">
      <BettingPhase central={{
        horses: race.horses,
        raceData,
        balance: me.balance,
        bets: currentBets.map((bet): Bet => ({ id: bet.id, bet_type: bet.betType, horse_numbers: bet.horseNumbers, amount: bet.amount })),
        bettingEndTime: race.bettingClosesAt,
        participants: status?.participants ?? 0,
        win5Participants: status?.win5Participants ?? 0,
        serverOffsetMs,
        onExit: onClose,
        onPurchase: async (betType, combinations, amount) => {
          const additions: CentralBet[] = combinations.map((horseNumbers) => ({ id: crypto.randomUUID(), betType: betType as CentralBet['betType'], horseNumbers, amount }));
          await saveBets([...currentBets, ...additions]);
        },
        onCancel: async (bet) => saveBets(currentBets.filter((item) => item.id !== bet.id)),
      }}/>

      {playback && <div className="fixed inset-0 z-[100]"><RacePhase
        horses={playback.race.horses}
        raceData={{
          distance: playback.race.conditions?.distance ?? playback.race.simulation?.distance ?? 2000,
          field_condition: playback.race.conditions?.fieldCondition ?? playback.race.simulation?.field_condition ?? '良',
          weather: playback.race.conditions?.weather ?? playback.race.simulation?.weather ?? '晴',
          course_feature: playback.race.conditions?.courseFeature ?? playback.race.simulation?.course_feature ?? '平坦',
          simulation: playback.race.simulation,
        }}
        raceStartTime={playback.startsAt}
        onComplete={completePlayback}
      /></div>}

      {!playback && resultRace && <div className="fixed inset-0 z-[110]"><ResultPhase central={{
        raceData: {
          distance: resultRace.conditions?.distance ?? resultRace.simulation?.distance ?? 2000,
          field_condition: resultRace.conditions?.fieldCondition ?? resultRace.simulation?.field_condition ?? '良',
          weather: resultRace.conditions?.weather ?? resultRace.simulation?.weather ?? '晴',
          course_feature: resultRace.conditions?.courseFeature ?? resultRace.simulation?.course_feature ?? '平坦',
          simulation: resultRace.simulation,
        },
        horses: resultRace.horses.map((horse) => ({
          ...horse,
          field_apt: { '良': 'C', '稍重': 'C', '重': 'C', '不良': 'C' },
        })),
        bets: (settlement?.details.bets ?? []).map((bet): Bet => ({ id: bet.id, bet_type: bet.betType, horse_numbers: bet.horseNumbers, amount: bet.amount })),
        betDetails: (settlement?.details.bets ?? []).map((bet) => ({ id: bet.id, bet_type: bet.betType, horse_numbers: bet.horseNumbers, amount: bet.amount, isHit: bet.isHit, payout: bet.payout, payoutOdds: bet.payoutOdds })),
        balance: me.balance,
        payout: settlement?.amount ?? 0,
        onNext: () => settlement ? acknowledge(settlement) : closeResult(),
      }}/></div>}
    </div>
  );
}
