import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acknowledgeCentralSettlements,
  fetchCentralMe,
  fetchCentralRace,
  fetchCentralStatus,
  fetchNextCentralRace,
  heartbeatCentral,
  joinCentral,
  leaveCentral,
  replaceCentralBets,
  type CentralBet,
  type CentralBetType,
  type CentralMe,
  type CentralRace,
  type CentralSettlement,
  type CentralStatus
} from '../network/centralServer';
import { HORSE_COLORS, RARITY_EMOJI } from '../core/constants';

const BET_TYPES: CentralBetType[] = ['単勝', '複勝', '馬連', 'ワイド', '馬単', '3連複', '3連単'];
const REQUIRED: Record<CentralBetType, number> = { 単勝: 1, 複勝: 1, 馬連: 2, ワイド: 2, 馬単: 2, '3連複': 3, '3連単': 3 };

function yen(value: number): string {
  return `${value.toLocaleString('ja-JP')}枚`;
}

function errorText(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'insufficient_balance') return '中央残高が足りません。';
  if (code === 'betting_closed') return '投票が締め切られました。';
  if (code === 'invalid_bets') return '馬券の組み合わせを確認してください。';
  return '中央サーバーと通信できませんでした。';
}

function BlockBar({ value }: { value: number }) {
  const filled = Math.min(10, Math.max(0, Math.round((value || 0) / 10)));
  return <span className="font-mono text-[13px] tracking-[-1px]"><span className="text-white">{'█'.repeat(filled)}</span><span className="text-gray-600">{'░'.repeat(10 - filled)}</span></span>;
}

export default function CentralRacecoursePhase({ playerName, onClose }: { playerName: string; onClose: () => void }) {
  const [race, setRace] = useState<CentralRace | null>(null);
  const [status, setStatus] = useState<CentralStatus | null>(null);
  const [me, setMe] = useState<CentralMe | null>(null);
  const [bets, setBets] = useState<CentralBet[]>([]);
  const [betType, setBetType] = useState<CentralBetType>('単勝');
  const [buyMode, setBuyMode] = useState<'通常' | 'ボックス' | '流し'>('通常');
  const [tab, setTab] = useState<'list' | 'owned'>('list');
  const [selection, setSelection] = useState<number[]>([]);
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('中央競馬場に接続しています…');
  const [recentResult, setRecentResult] = useState<CentralRace | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(0);
  const raceIdRef = useRef<string | null>(null);

  const sync = useCallback(async (signal?: AbortSignal, first = false) => {
    try {
      if (first) await joinCentral(playerName, signal);
      else await heartbeatCentral(playerName, signal);
      const [nextRace, nextMe, nextStatus] = await Promise.all([
        fetchNextCentralRace(signal), fetchCentralMe(signal), fetchCentralStatus(signal)
      ]);
      const previousRaceId = raceIdRef.current;
      if (previousRaceId && previousRaceId !== nextRace.id) {
        try {
          const finished = await fetchCentralRace(previousRaceId, signal);
          if (finished.status === 'finished') setRecentResult(finished);
        } catch { /* 期限切れの過去レースは表示を省略 */ }
      }
      raceIdRef.current = nextRace.id;
      setRace(nextRace);
      setMe(nextMe);
      setStatus(nextStatus);
      setServerOffset(nextStatus.serverTime - Date.now());
      setBets(nextMe.tickets.find((ticket) => ticket.raceId === nextRace.id)?.bets ?? []);
      setMessage('');
    } catch (error) {
      if (signal?.aborted) return;
      setMessage(errorText(error));
    }
  }, [playerName]);

  useEffect(() => {
    const controller = new AbortController();
    void sync(controller.signal, true);
    const poll = window.setInterval(() => void sync(controller.signal), 5_000);
    const tick = window.setInterval(() => setClock(Date.now()), 250);
    return () => {
      controller.abort();
      window.clearInterval(poll);
      window.clearInterval(tick);
      void leaveCentral().catch(() => undefined);
    };
  }, [sync]);

  const now = clock + serverOffset;
  const remaining = Math.max(0, (race?.bettingClosesAt ?? now) - now);
  const countdown = `${String(Math.floor(remaining / 60_000)).padStart(2, '0')}:${String(Math.floor((remaining % 60_000) / 1_000)).padStart(2, '0')}`;
  const bettingOpen = !!race && race.status !== 'qualification_pending' && remaining > 0;
  const settlement = me?.settlements[0];

  const combinations = useMemo(() => {
    const needed = REQUIRED[betType];
    const ordered = betType === '馬単' || betType === '3連単';
    if (buyMode === '通常') return selection.length === needed ? [selection] : [];
    if (selection.length < needed) return [];
    const output: number[][] = [];
    if (buyMode === '流し') {
      const axis = selection[0];
      const partners = selection.slice(1);
      const choose = (start: number, picked: number[]) => {
        if (picked.length === needed - 1) { output.push([axis, ...picked]); return; }
        for (let index = start; index < partners.length; index += 1) choose(index + 1, [...picked, partners[index]]);
      };
      choose(0, []);
      if (ordered && needed === 2) output.push(...output.map((combo) => [...combo].reverse()));
      return output;
    }
    const choose = (remaining: number[], picked: number[]) => {
      if (picked.length === needed) { output.push(picked); return; }
      remaining.forEach((number, index) => choose(ordered ? remaining.filter((_, at) => at !== index) : remaining.slice(index + 1), [...picked, number]));
    };
    choose(selection, []);
    return output;
  }, [betType, buyMode, selection]);

  const toggleHorse = (number: number) => {
    setSelection((current) => {
      if (current.includes(number)) return current.filter((item) => item !== number);
      if (buyMode !== '通常') return [...current, number];
      return [...current, number].slice(-REQUIRED[betType]);
    });
  };

  const saveBets = async (nextBets: CentralBet[]) => {
    if (!race) return;
    setBusy(true);
    setMessage('馬券を保存しています…');
    try {
      const response = await replaceCentralBets(race.id, nextBets);
      setBets(response.bets);
      setMe((current) => current ? { ...current, balance: response.balance } : current);
      setMessage(nextBets.length ? '馬券を中央サーバーに保存しました。締切まで変更できます。' : '馬券を取り消し、全額返金しました。');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const addBet = () => {
    if (!combinations.length) return;
    const added = combinations.map((horseNumbers) => ({ id: crypto.randomUUID(), betType, horseNumbers, amount }));
    void saveBets([...bets, ...added]);
    setSelection([]);
  };

  const acknowledge = async (item: CentralSettlement) => {
    await acknowledgeCentralSettlements([item.id]);
    setMe((current) => current ? { ...current, settlements: current.settlements.filter((entry) => entry.id !== item.id) } : current);
  };

  return (
    <div className="fixed inset-0 z-[90] flex h-screen flex-col overflow-hidden bg-[#111113] text-gray-200" style={{ fontSize: 13 }}>
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#2a2a32] bg-[#1a1a1e] px-4">
        <div className="flex items-center gap-4">
          <span className="font-black tracking-wider text-white">馬券購入</span>
          <span className="text-xs font-mono text-gray-500">中央 {race?.grade === 'GENERAL' ? '一般' : race?.grade} · {race?.conditions?.distance ?? '—'}m · {race?.conditions?.fieldCondition ?? '—'} · {race?.conditions?.weather ?? '—'} · {race?.conditions?.courseFeature ?? '—'}</span>
          <span className="text-[10px] font-black text-emerald-400">参加者 {status?.participants ?? '—'}人 / WIN5 {status?.win5Participants ?? '—'}人</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><span className="text-[10px] font-bold tracking-widest text-gray-400">締切まで</span><b className={`font-mono text-xl tabular-nums ${remaining < 30_000 ? 'animate-pulse text-red-500' : 'text-indigo-400'}`}>{countdown}</b></div>
          <div className="text-right"><div className="text-[10px] font-bold text-gray-400">中央残高</div><b className="font-mono text-sm text-yellow-500">{(me?.balance ?? 0).toLocaleString()} C</b></div>
          <button onClick={onClose} className="rounded border border-[#3a3a44] px-4 py-1.5 text-xs font-bold hover:bg-white/5">退出</button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex w-[52%] flex-col border-r border-[#2a2a32]">
          <div className="flex shrink-0 border-b border-[#2a2a32] bg-[#161618]">
            <button onClick={() => setTab('list')} className={`flex-1 py-2.5 text-xs font-black tracking-[.15em] ${tab === 'list' ? 'border-b-2 border-indigo-500 bg-[#1a1a1e] text-white' : 'text-gray-500'}`}>出馬表</button>
            <button onClick={() => setTab('owned')} className={`flex-1 py-2.5 text-xs font-black tracking-[.15em] ${tab === 'owned' ? 'border-b-2 border-indigo-500 bg-[#1a1a1e] text-white' : 'text-gray-500'}`}>購入済 ({bets.length})</button>
          </div>

          {tab === 'list' ? (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#1a1a1e] text-[10px] font-black tracking-widest text-gray-400"><tr><th className="w-8 p-2"/><th className="w-10 py-2">番</th><th className="px-2 py-2 text-left">馬名</th><th className="w-24 px-2 py-2 text-right">騎手</th><th className="w-12 px-2 py-2 text-right text-yellow-500/80">単勝</th><th className="w-12 px-2 py-2 text-right">複勝</th></tr></thead>
                <tbody>{race?.horses.map((horse) => {
                  const selected = selection.includes(horse.horse_number);
                  const color = HORSE_COLORS[horse.horse_number - 1] || '#aaa';
                  return <tr key={horse.id} onClick={() => bettingOpen && toggleHorse(horse.horse_number)} className={`cursor-pointer border-b border-[#1e1e22] ${selected ? 'bg-indigo-500/10' : 'hover:bg-[#1e1e22]'} ${!bettingOpen ? 'opacity-40' : ''}`}>
                    <td className="pl-2 py-2.5"><div className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? 'border-indigo-500 bg-indigo-500' : 'border-[#3a3a44]'}`}>{selected && '✓'}</div></td>
                    <td className="py-2.5 text-center"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: color }}>{horse.horse_number}</span>{buyMode === '流し' && selection[0] === horse.horse_number && <small className="block text-[9px] text-blue-400">軸</small>}</td>
                    <td className="px-2 py-2.5"><b className="text-gray-100">{RARITY_EMOJI[horse.rarity]} {horse.name}</b><small className="block text-[10px] font-bold text-gray-400">{horse.age}歳{horse.gender} · {horse.running_style} · 賞金{horse.central_earnings.toLocaleString()}C</small></td>
                    <td className="px-2 py-2.5 text-right text-[11px] font-bold text-gray-200">{horse.jockey_name}</td><td className="px-2 py-2.5 text-right font-mono text-sm font-black text-yellow-500">{horse.odds_win?.toFixed(1) ?? '—'}</td><td className="px-2 py-2.5 text-right font-mono font-bold">{horse.odds_place?.toFixed(1) ?? '—'}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {bets.length === 0 && <div className="text-xs italic text-gray-700">購入済みの馬券はありません</div>}
              {bets.map((bet) => <div key={bet.id} className="flex items-center justify-between rounded-lg border border-[#2a2a32] bg-[#1a1a1e] p-3"><div><span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-black text-indigo-400">{bet.betType}</span><b className="ml-2 font-mono text-sm text-white">{bet.horseNumbers.join('-')}</b><small className="ml-3 font-bold text-gray-500">{bet.amount.toLocaleString()} C</small></div><button disabled={busy || !bettingOpen} onClick={() => void saveBets(bets.filter((item) => item.id !== bet.id))} className="rounded border border-red-900/50 bg-red-900/30 px-3 py-1.5 text-[10px] font-black text-red-400 disabled:opacity-20">キャンセル</button></div>)}
            </div>
          )}

          <div className="shrink-0 border-t border-[#2a2a32] bg-[#161618] px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {BET_TYPES.map((type) => <button key={type} onClick={() => { setBetType(type); setSelection([]); }} disabled={!bettingOpen} className={`rounded px-2.5 py-1 text-xs font-bold ${betType === type ? 'bg-indigo-600 text-white' : 'bg-[#2a2a32] text-gray-500'}`}>{type}</button>)}
              <div className="flex-1"/>
              {(['通常', 'ボックス', '流し'] as const).map((mode) => <button key={mode} onClick={() => { setBuyMode(mode); setSelection([]); }} disabled={!bettingOpen} className={`rounded border px-2 py-1 text-xs font-bold ${buyMode === mode ? 'border-gray-500 bg-[#2a2a32] text-white' : 'border-[#2a2a32] text-gray-600'}`}>{mode}</button>)}
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-[90px]"><small className="block text-[10px] font-bold text-gray-400">{buyMode === '流し' ? '軸→相手' : `選択 ${selection.length}/${buyMode === '通常' ? REQUIRED[betType] : '∞'}`}</small><b className="font-mono text-gray-300">{selection.length ? selection.join(buyMode === '流し' ? '→' : '-') : '—'}</b></div>
              <span className="text-gray-800">|</span>
              <div><div className="mb-1 flex justify-between text-[10px] font-bold text-gray-400"><span>1点あたりの金額</span><span className="ml-4 flex gap-1">{[100, 500, 1000, 5000].map((value) => <button key={value} onClick={() => setAmount((current) => current + value)} className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-400">+{value}</button>)}<button onClick={() => setAmount(0)} className="rounded border border-red-500/20 bg-red-500/10 px-1.5 text-[9px] text-red-400">CLR</button></span></div><div className="flex items-center gap-1"><input type="number" min="0" step="100" value={amount || ''} onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))} className="w-28 rounded border border-[#2a2a32] bg-[#0e0e10] px-3 py-1.5 font-mono text-sm text-white outline-none focus:border-indigo-500"/><b className="text-[11px] text-gray-400">C</b></div></div>
              {combinations.length > 0 && <div><small className="text-[10px] text-gray-600">{combinations.length}点合計</small><b className={`block font-mono ${combinations.length * amount > (me?.balance ?? 0) ? 'text-red-500' : 'text-yellow-500'}`}>{(combinations.length * amount).toLocaleString()} C</b></div>}
              <div className="flex-1 text-[10px] font-bold text-gray-500">{message}</div>
              <button onClick={addBet} disabled={busy || !bettingOpen || !combinations.length || amount < 100 || combinations.length * amount > (me?.balance ?? 0)} className="rounded-lg bg-yellow-600 px-5 py-2 text-sm font-black text-white hover:bg-yellow-500 disabled:bg-[#2a2a32] disabled:text-gray-600">{!bettingOpen ? '締切済' : '購入する'}</button>
            </div>
          </div>
        </div>

        <div className="w-[48%] space-y-3 overflow-y-auto p-3">
          <div className="sticky top-0 z-10 bg-[#111113] pb-1 text-[10px] font-black tracking-widest text-gray-400">全馬データ</div>
          {race?.horses.map((horse) => {
            const selected = selection.includes(horse.horse_number);
            const color = HORSE_COLORS[horse.horse_number - 1] || '#aaa';
            return <div key={horse.id} onClick={() => bettingOpen && toggleHorse(horse.horse_number)} className={`relative cursor-pointer overflow-hidden rounded-lg bg-[#1e1e24] ${selected ? 'bg-indigo-950/40 ring-2 ring-indigo-500' : 'hover:bg-[#25252c]'} ${!bettingOpen ? 'opacity-40' : ''}`}><div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }}/><div className="py-3 pl-4 pr-3">
              <div className="mb-2 flex items-start justify-between"><b className="text-[16px] text-white">🐴 {horse.horse_number}番 {horse.name} <span className="text-[13px] text-gray-300">({horse.age}歳 {horse.gender} {horse.coat_color})</span></b><div className="rounded-lg border border-amber-400/15 bg-amber-400/5 px-2.5 py-1.5 text-right"><small className="block text-[8px] font-black text-amber-500/60">獲得賞金</small><b className="font-mono text-[11px] text-amber-200">{horse.central_earnings.toLocaleString()} C</b></div></div>
              <div className="mb-2"><small className="block text-[11px] font-bold text-gray-400">騎手</small><b className="text-[13px] text-gray-200">{horse.jockey_name}</b></div>
              <div className="mb-3"><div className="mb-1 text-[11px] font-black text-white">能力値</div><div className="space-y-1.5 rounded border border-[#2d283e] bg-[#1e1a29] p-2.5">{[['スピード', horse.speed], ['スタミナ', horse.stamina], ['パワー', horse.power], ['瞬発力', horse.burst], ['精神力', horse.guts], ['賢さ', horse.wisdom]].map(([label, value]) => <div key={String(label)} className="flex items-center text-[12px]"><span className="w-16 font-black text-gray-400">{label}</span><BlockBar value={Number(value)}/><span className="ml-2 w-7 text-right font-mono font-bold">{value}</span></div>)}</div></div>
              <div className="grid grid-cols-3 gap-3 text-[11px]"><div><b className="block text-gray-300">距離適性</b><span>短{horse.distance_apt?.['短距離']} マ{horse.distance_apt?.['マイル']} 中{horse.distance_apt?.['中距離']} 長{horse.distance_apt?.['長距離']}</span></div><div><b className="block text-gray-300">脚質</b><span>{horse.running_style}</span></div><div><b className="block text-gray-300">今日の調子</b><span>{horse.condition}</span></div><div><b className="block text-gray-300">馬体重</b><span>{horse.weight}kg ({horse.weight_change >= 0 ? '+' : ''}{horse.weight_change})</span></div><div><b className="block text-gray-300">通算成績</b><span>{horse.wins}勝 / {horse.total_races}戦</span></div><div><b className="block text-gray-300">レーティング</b><span>{horse.rating} ({horse.rarity})</span></div></div>
            </div></div>;
          })}
        </div>
      </div>

      {(settlement || recentResult) && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/80 p-5 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[28px] border border-amber-300/25 bg-[#15171c] p-6 shadow-2xl">
            <div className="text-[9px] font-black tracking-[.25em] text-amber-500">RACE RESULT</div>
            <h2 className="mt-1 text-2xl font-black">中央競馬 結果確定</h2>
            <div className="mt-5 space-y-2">
              {(settlement?.details.results ?? recentResult?.simulation?.results ?? []).slice(0, 3).map((result, index) => {
                const sourceRace = recentResult ?? race;
                const name = result.horse_name || sourceRace?.horses.find((horse) => horse.horse_number === result.horse_number)?.name || '';
                return <div key={result.horse_number} className="flex items-center gap-3 rounded-xl bg-white/[.04] p-3"><b className="w-8 text-xl text-amber-300">{index + 1}</b><span className="rounded bg-white px-2 py-1 font-black text-black">{result.horse_number}</span><b className="text-sm">{name}</b></div>;
              })}
            </div>
            {settlement && <div className={`mt-4 rounded-xl p-4 text-center ${settlement.amount > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/[.03] text-gray-400'}`}><div className="text-[10px] font-black">{settlement.amount > 0 ? '払戻金' : '今回は的中なし'}</div>{settlement.amount > 0 && <b className="text-2xl">+{yen(settlement.amount)}</b>}</div>}
            <button onClick={() => settlement ? void acknowledge(settlement) : setRecentResult(null)} className="mt-5 w-full rounded-xl bg-amber-400 py-3 text-xs font-black text-black">次のレースへ</button>
          </div>
        </div>
      )}
    </div>
  );
}
