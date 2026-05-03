import { useEffect, useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { peerManager } from '../network/peerManager';
import { oddsCalculator } from '../core/odds_calculator';
import { db } from '../db/db';

const HORSE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
  '#84cc16', '#0ea5e9', '#a855f7', '#fb923c', '#10b981',
  '#6366f1', '#e11d48', '#0891b2',
];

const MEDAL = ['🥇', '🥈', '🥉'];

export default function ResultPhase() {
  const { raceData, myBets, myCoins, role, horses, participants, rematchVotes } = useGameStore();
  const [totalPayout, setTotalPayout] = useState(0);
  const [paid, setPaid] = useState(false);
  const [myVote, setMyVote] = useState<'continue' | 'end' | null>(null);

  const simulation = raceData?.simulation;
  const results: any[] = simulation?.results || [];

  const hitDetails = useMemo(() => {
    if (!results.length) return [];
    const first = results[0]?.horse_number;
    const second = results[1]?.horse_number;
    const third = results[2]?.horse_number;
    const top3 = [first, second, third].filter(Boolean);

    return myBets.map(bet => {
      const nums = bet.horse_numbers;
      let isHit = false;
      if (bet.bet_type === '単勝') isHit = nums[0] === first;
      else if (bet.bet_type === '複勝') isHit = top3.includes(nums[0]);
      else if (bet.bet_type === '馬連') isHit = nums.includes(first) && nums.includes(second);
      else if (bet.bet_type === 'ワイド') isHit = nums.filter(n => top3.includes(n)).length >= 2;
      else if (bet.bet_type === '馬単') isHit = nums[0] === first && nums[1] === second;
      else if (bet.bet_type === '3連複') isHit = nums.includes(first) && nums.includes(second) && nums.includes(third);
      else if (bet.bet_type === '3連単') isHit = nums[0] === first && nums[1] === second && nums[2] === third;

      const payoutOdds = isHit ? oddsCalculator.calculatePayoutOdds(bet.bet_type, nums, horses) : 0;
      const payout = Math.floor(bet.amount * payoutOdds);
      return { ...bet, isHit, payout, payoutOdds };
    });
  }, [myBets, results, horses]);

  useEffect(() => {
    if (paid) return;
    const total = hitDetails.reduce((s, d) => s + d.payout, 0);
    setTotalPayout(total);
    if (total > 0) {
      const newBal = myCoins + total;
      useGameStore.getState().setMyCoins(newBal);
      // コイン変動をホストに報告
      peerManager.reportCoinsToHost(newBal);
    }

    // Update horse records in DB (Host only, to prevent multiple updates)
    if (role === 'host' && results.length > 0) {
      results.forEach(async (r: any, idx: number) => {
        const horse = horses.find(h => h.horse_number === r.horse_number);
        if (horse && horse.id) {
          const record = await db.horses.get(horse.id);
          if (record) {
            // Rating calculation
            let ratingChange = 0;
            if (idx === 0) ratingChange = Math.floor(Math.random() * 30) + 50; // 1st
            else if (idx === 1) ratingChange = Math.floor(Math.random() * 20) + 20; // 2nd
            else if (idx === 2) ratingChange = Math.floor(Math.random() * 10) + 5; // 3rd
            else if (idx >= 5) ratingChange = -(Math.floor(Math.random() * 20) + 10); // 6th or lower

            const newRating = Math.max(800, (record.rating || 1000) + ratingChange);
            const newWins = (record.wins || 0) + (idx === 0 ? 1 : 0);
            const newTotal = (record.total_races || 0) + 1;

            await db.horses.update(horse.id, {
              total_races: newTotal,
              wins: newWins,
              rating: newRating,
              record: record.record ? {
                ...record.record,
                wins: (record.record.wins || 0) + (idx === 0 ? 1 : 0),
                places: (record.record.places || 0) + (idx === 1 ? 1 : 0),
                shows: (record.record.shows || 0) + (idx === 2 ? 1 : 0),
                losses: (record.record.losses || 0) + (idx > 2 ? 1 : 0),
              } : undefined
            });
          }
        }
      });
    }

    setPaid(true);

    // --- Title Unlock Logic ---
    const s = useGameStore.getState();
    const currentStats = s.stats;
    const newStats = { ...currentStats };

    newStats.totalRaces += 1;
    const sessionWins = hitDetails.filter(d => d.isHit).length;
    if (sessionWins > 0) newStats.totalWins += sessionWins;

    const sessionMaxOdds = Math.max(...hitDetails.map(d => d.isHit ? d.payoutOdds : 0), 0);
    newStats.maxPayoutOdds = Math.max(newStats.maxPayoutOdds, sessionMaxOdds);

    const sessionPayout = hitDetails.reduce((acc, d) => acc + d.payout, 0);
    newStats.totalPayout += sessionPayout;

    s.updateStats(newStats);

    // Conditional Unlocks
    if (sessionWins > 0) s.unlockTitle('first_win');
    if (newStats.maxPayoutOdds >= 1000) s.unlockTitle('miracle');
    else if (newStats.maxPayoutOdds >= 300) s.unlockTitle('super_manbaken');
    else if (newStats.maxPayoutOdds >= 100) s.unlockTitle('manbaken');

    if (s.myCoins >= 1000000) s.unlockTitle('billionaire');
    else if (s.myCoins >= 500000) s.unlockTitle('rich');
    else if (s.myCoins >= 100000) s.unlockTitle('millionaire');

    if (s.myCoins <= 100) s.unlockTitle('poor');
    else if (s.myCoins <= 1000) s.unlockTitle('bankrupt');

    const sessionTotalBet = myBets.reduce((acc, b) => acc + b.amount, 0);
    if (sessionTotalBet >= s.myCoins && s.myCoins > 0) s.unlockTitle('all_in');
    if (sessionTotalBet >= 500000) s.unlockTitle('high_stake');
    else if (sessionTotalBet >= 100000) s.unlockTitle('high_roller');
    else if (sessionTotalBet >= 10000) s.unlockTitle('gambler');

    if (newStats.totalWins >= 20) s.unlockTitle('winner_20');
    else if (newStats.totalWins >= 5) s.unlockTitle('steady');

    if (newStats.totalPayout >= 50000000) s.unlockTitle('whale');
    else if (newStats.totalPayout >= 10000000) s.unlockTitle('god_of_gambling');
    else if (newStats.totalPayout >= 1000000) s.unlockTitle('legend');

    if (newStats.totalRaces >= 100) s.unlockTitle('centaur');
    else if (newStats.totalRaces >= 50) s.unlockTitle('veteran');
    else if (newStats.totalRaces >= 10) s.unlockTitle('seeker');
    else if (newStats.totalRaces >= 7) s.unlockTitle('lucky_seven');

    if (newStats.totalRaces - newStats.totalWins >= 20) s.unlockTitle('unlucky_streak');
    else if (newStats.totalRaces - newStats.totalWins >= 10) s.unlockTitle('loser');

    // --- Weird / Secret Achievement Logic ---
    // 背水の陣: 所持金が10C以下の状態で的中させた (的中前の所持金で判定)
    const prevCoins = s.myCoins - sessionPayout + sessionTotalBet;
    if (sessionWins > 0 && prevCoins <= 10) {
      s.unlockTitle('last_chance');
    }

    // ラッキー・セブン・フィーバー: 所持金がちょうど 777 または 7777
    if (s.myCoins === 777 || s.myCoins === 7777) {
      s.unlockTitle('jackpot_777');
    }

    // 極限の勝負師: 全財産を賭けて、100倍以上の配当を手にした
    const isAllIn = sessionTotalBet >= prevCoins && prevCoins > 0;
    const hasBigHit = hitDetails.some(d => d.isHit && d.payoutOdds >= 100);
    if (isAllIn && hasBigHit) {
      s.unlockTitle('all_or_nothing');
    }

    // Notify host of our current selected title if it changed (or just keep synced)
    if (role === 'guest') {
      const resolvedTitle = s.playerTitle === '称号コレクター' ? `${s.ownedTitles.length}冠の覇者` : s.playerTitle;
      peerManager.sendToHost({ type: 'update_profile', title: resolvedTitle });
    }
    // Bug-15: hitDetails の内容変化にも反応するよう hitDetails 自体を依存配列に使い、
    // paid flag で発火一回のみに制限する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitDetails]);

  const handleVote = (vote: 'continue' | 'end') => {
    if (myVote) return;
    setMyVote(vote);
    peerManager.sendToHost({ type: 'vote', vote });
  };

  const handleBackToLobby = () => {
    useGameStore.getState().setSpectator(false);
    useGameStore.getState().setPhase('lobby');
    useGameStore.getState().resetBets();
    useGameStore.getState().setReadyPlayers();
    useGameStore.getState().setHostBetPool([]);
    useGameStore.getState().setRaceData(null);
    useGameStore.getState().updateHorses([]);
    useGameStore.getState().setBettingEndTime(null); // Reset timer
    useGameStore.getState().setRematchVotes({ continue: [], end: [] });
    if (role === 'host') peerManager.broadcast({ type: 'phase_start', phase: 'lobby' });
  };

  /** 同じレース条件で馬プールから再抽選して再レース */
  const handleRematch = async () => {
    const s = useGameStore.getState();
    const settings = s.roomSettings;
    const rd = s.raceData;
    if (!rd) return;

    // --- 条件の決定 (おまかせ設定の場合は再抽選する) ---
    const { FIELD_CONDITIONS, DISTANCE_CATEGORIES } = await import('../core/constants');

    let nextDistance = rd.distance;
    if (settings.distance === 'random') {
      const distKeys = Object.keys(DISTANCE_CATEGORIES);
      const distanceCat = distKeys[Math.floor(Math.random() * distKeys.length)];
      const [lo, hi] = DISTANCE_CATEGORIES[distanceCat];
      nextDistance = Math.round((Math.random() * (hi - lo) + lo) / 100) * 100;
    }

    let nextFC = rd.field_condition;
    if (settings.fieldCondition === 'random') {
      nextFC = FIELD_CONDITIONS[Math.floor(Math.random() * FIELD_CONDITIONS.length)];
    }

    let nextWeather = rd.weather;
    if (settings.weather === 'random') {
      const wList = ['晴', '曇', '雨', '雪'];
      nextWeather = wList[Math.floor(Math.random() * wList.length)];
    }

    const nextCourseFeature = rd.course_feature || '平坦';

    const { drawHorsesFromPool } = await import('../db/db');
    const { oddsCalculator: oc } = await import('../core/odds_calculator');

    const count = settings.horseCount || s.horses.length || 12;
    const drawn = await drawHorsesFromPool(count);
    const freshHorses = drawn.map((h, i) => ({ ...h, horse_number: i + 1 }));
    freshHorses.forEach(h => {
      (h as any).score = oc.calculateCompositeScore(h, nextDistance, nextFC, nextCourseFeature);
    });
    const horsesWithOdds = oc.calculateInitialOdds(freshHorses, settings.realOdds);
    const freshRaceData = {
      distance: nextDistance,
      field_condition: nextFC,
      weather: nextWeather,
      course_feature: nextCourseFeature
    };

    s.updateHorses(horsesWithOdds);
    s.setRaceData(freshRaceData);
    s.resetBets();
    s.setHostBetPool([]);
    s.setReadyPlayers();
    s.setBettingEndTime(null);
    s.setRematchVotes({ continue: [], end: [] });

    const endTime = Date.now() + (settings.bettingTime || 120) * 1000;
    s.setBettingEndTime(endTime);
    s.setPhase('betting');

    peerManager.broadcast({
      type: 'phase_start',
      phase: 'betting',
      horses: horsesWithOdds,
      raceData: freshRaceData,
      bettingEndTime: endTime,
      settings: settings,
    });
  };

  const totalBetAmount = myBets.reduce((s, b) => s + b.amount, 0);
  const profit = totalPayout - totalBetAmount;
  const contVotes = rematchVotes.continue.length;
  const endVotes = rematchVotes.end.length;
  const totalVoters = participants.filter(p => p.id !== 'host').length;

  return (
    <div className="h-screen flex flex-col bg-[#111113] text-gray-200 overflow-hidden" style={{ fontSize: 13 }}>

      {/* Header */}
      <header className="flex-none h-14 bg-[#1a1a1e] border-b border-[#2a2a32] px-6 flex items-center justify-between">
        <div>
          <h1 className="font-black text-white tracking-widest text-lg uppercase">Race Result</h1>
          {raceData && (
            <div style={{ fontSize: 11 }} className="text-gray-400 font-mono font-bold">
              {raceData.distance}m · {raceData.field_condition} · {raceData.weather}
            </div>
          )}
          {role === 'guest' && (
            <div className="mt-1 flex items-center gap-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg animate-pulse">
                <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">Waiting for Host...</span>
              </div>
              {totalVoters > 0 && (
                <div style={{ fontSize: 11 }} className="text-gray-500 font-mono">
                  継続: {contVotes} / 終了: {endVotes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Host actions */}
        {role === 'host' && (
          <div className="flex items-center gap-3">
            {totalVoters > 0 && (
              <div style={{ fontSize: 11 }} className="text-gray-400 font-black text-right">
                <div>継続 {contVotes} / 終了 {endVotes}</div>
                <div className="text-gray-700">({totalVoters}人が投票可能)</div>
              </div>
            )}
            <button onClick={handleRematch}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition-all active:scale-95">
              🔄 同条件で再レース
            </button>
            <button onClick={handleBackToLobby}
              className="px-4 py-2 bg-[#2a2a32] hover:bg-[#35353f] text-gray-300 font-bold text-xs rounded-lg transition-all">
              ← ロビーに戻る
            </button>
          </div>
        )}

        {/* Client actions — Bug-14: 'client' -> 'guest' に修正 */}
        {role === 'guest' && (
          <div className="flex items-center gap-3">
            <div style={{ fontSize: 11 }} className="text-gray-400 font-black flex flex-col items-end">
              <span>{myVote ? (
                <span className="text-gray-400">投票済み：{myVote === 'continue' ? '継続を要請' : '終了を要請'}</span>
              ) : 'ホストへ要請を送る'}</span>
            </div>
            <button onClick={() => handleVote('continue')} disabled={!!myVote}
              className={`px-4 py-2 font-bold text-xs rounded-lg transition-all ${myVote === 'continue' ? 'bg-emerald-700 text-white' : myVote ? 'bg-[#2a2a32] text-gray-600 cursor-not-allowed' : 'bg-emerald-800/50 hover:bg-emerald-700 text-emerald-300 active:scale-95'}`}>
              👍 継続を要請
            </button>
            <button onClick={() => handleVote('end')} disabled={!!myVote}
              className={`px-4 py-2 font-bold text-xs rounded-lg transition-all ${myVote === 'end' ? 'bg-red-800 text-white' : myVote ? 'bg-[#2a2a32] text-gray-600 cursor-not-allowed' : 'bg-red-900/40 hover:bg-red-800/70 text-red-400 active:scale-95'}`}>
              👎 終了を要請
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* ── Finish order ── */}
          <section className="panel rounded-xl overflow-hidden border border-[#2a2a32]">
            <div className="panel-header bg-[#202028] text-gray-300 font-black">確定着順</div>
            <table className="w-full">
              <thead>
                <tr style={{ fontSize: 10 }} className="text-gray-400 font-black uppercase border-b border-[#2a2a32]">
                  <th className="px-4 py-2 w-14 text-left">着</th>
                  <th className="px-4 py-2 w-14 text-center">馬番</th>
                  <th className="px-4 py-2 text-left">馬名</th>
                  <th className="px-4 py-2 text-right">タイム</th>
                  <th className="px-4 py-2 text-right w-20">着差</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r: any, idx: number) => (
                  <tr key={r.horse_number} className={`border-b border-[#1e1e22] ${idx < 3 ? 'bg-white/[0.04]' : ''} animate-fade-in`}
                    style={{ animationDelay: `${idx * 40}ms` }}>
                    <td className="px-4 py-3 font-mono font-black">
                      {idx < 3 ? <span style={{ fontSize: 18 }}>{MEDAL[idx]}</span> : <span className="text-gray-400 text-xs font-black">{idx + 1}着</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-black shadow-lg shadow-black/40" style={{ background: HORSE_COLORS[r.horse_number - 1] || '#666', fontSize: 11 }}>{r.horse_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{r.horse_name}</span>
                        <span className="text-[10px] px-1 bg-white/10 rounded text-gray-300 font-mono font-bold">
                          R{Math.floor(horses.find(h => h.horse_number === r.horse_number)?.rating || 1000)}
                        </span>
                        <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">
                          {horses.find(h => h.horse_number === r.horse_number)?.total_races || 0}戦{horses.find(h => h.horse_number === r.horse_number)?.wins || 0}勝
                        </span>
                      </div>
                      {r.jockey_name && <div style={{ fontSize: 10 }} className="text-gray-400 font-bold">{r.jockey_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300 font-bold tabular">{r.finish_time}秒</td>
                    <td className="px-4 py-3 text-right font-black text-gray-400 text-xs">{r.margin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── Payout summary ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`panel rounded-xl p-4 flex flex-col items-center justify-center text-center ${totalPayout > 0 ? 'border-yellow-500/30 bg-yellow-500/10' : ''}`}>
              <div style={{ fontSize: 10 }} className="text-gray-400 font-black uppercase tracking-widest mb-2">結果</div>
              {totalPayout > 0 ? (
                <>
                  <div className="font-black text-yellow-500 animate-pop-in" style={{ fontSize: 36, textShadow: '0 0 20px rgba(234, 179, 8, 0.3)' }}>的中！</div>
                  {hitDetails.some(d => d.payoutOdds >= 300) ? (
                    <div className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-black animate-bounce mt-1">👑 超万馬券！！</div>
                  ) : hitDetails.some(d => d.payoutOdds >= 100) ? (
                    <div className="text-[10px] bg-yellow-600 text-black px-2 py-0.5 rounded font-black animate-pulse mt-1">🎰 万馬券！</div>
                  ) : (
                    <div style={{ fontSize: 11 }} className="text-yellow-500 font-black mt-1">おめでとうございます</div>
                  )}
                </>
              ) : myBets.length === 0 ? (
                <><div className="font-black text-gray-400" style={{ fontSize: 30 }}>観戦</div><div style={{ fontSize: 11 }} className="text-gray-500 font-bold mt-1 uppercase tracking-widest">No Bets Placed</div></>
              ) : (
                <><div className="font-black text-gray-600" style={{ fontSize: 30 }}>不的中</div><div style={{ fontSize: 11 }} className="text-gray-600 font-bold mt-1">次は頑張ろう</div></>
              )}
            </div>
            <div className="panel rounded-xl p-4 col-span-2">
              <div style={{ fontSize: 10 }} className="text-gray-400 font-black uppercase tracking-widest mb-3">払戻・損益</div>
              <div className="flex items-end gap-5">
                <div>
                  <div style={{ fontSize: 10 }} className="text-gray-500 font-bold mb-0.5 uppercase tracking-widest">払戻合計</div>
                  <div className="font-mono font-black text-white tabular" style={{ fontSize: 28 }}>
                    {totalPayout.toLocaleString()}<span className="text-yellow-500 ml-1" style={{ fontSize: 18 }}>C</span>
                  </div>
                </div>
                <div className="pb-1 text-gray-700">|</div>
                <div>
                  <div style={{ fontSize: 10 }} className="text-gray-500 font-bold mb-0.5 uppercase tracking-widest">損益</div>
                  <div className={`font-mono font-black tabular text-xl ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {profit >= 0 ? '+' : ''}{profit.toLocaleString()} C
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#2a2a32] flex justify-between items-center text-xs">
                <span className="text-gray-400 font-bold">現在の所持金</span>
                <span className="font-mono font-black text-gray-200 tabular">{myCoins.toLocaleString()} C</span>
              </div>
            </div>
          </div>

          {/* ── Ticket detail ── */}
          {hitDetails.length > 0 && (
            <section className="panel rounded-xl overflow-hidden">
              <div className="panel-header bg-[#202028] text-gray-300 flex justify-between font-black uppercase tracking-widest">
                <span>馬券明細</span>
                <span>{myBets.length}件 · 投資 {totalBetAmount.toLocaleString()}C</span>
              </div>
              <div className="divide-y divide-[#1e1e22]">
                {hitDetails.map((d, i) => (
                  <div key={i} className={`flex items-center justify-between px-4 py-3 animate-fade-in ${d.isHit ? 'bg-yellow-500/5' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="flex items-center gap-3">
                      <span className={`bet-chip ${d.isHit ? '!bg-yellow-500 !text-black' : ''}`}>{d.bet_type}</span>
                      <span className="font-mono font-black text-gray-200 tabular">{d.horse_numbers.join('-')}</span>
                      <span className="text-gray-500 text-xs font-bold">{d.amount.toLocaleString()}C</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-black tabular ${d.isHit ? 'text-yellow-500' : 'text-gray-600'}`}>
                        {d.isHit ? `+${d.payout.toLocaleString()}C` : 'ハズレ'}
                      </div>
                      {d.isHit && <div style={{ fontSize: 10 }} className="text-yellow-600 font-black">{d.payoutOdds.toFixed(1)}倍</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
