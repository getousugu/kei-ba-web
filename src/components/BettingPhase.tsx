import { useState, useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { peerManager } from '../network/peerManager';
import { RARITY_EMOJI, HORSE_COLORS } from '../core/constants';
import { oddsCalculator } from '../core/odds_calculator';
import type { Bet } from '../core/odds_calculator';
import { raceSimulator } from '../core/race_simulator';

const BET_TYPES = ['単勝', '複勝', '馬連', 'ワイド', '馬単', '3連複', '3連単'];

const APT_COLOR: Record<string, string> = { A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', E: '#ef4444' };
const COND_COLOR: Record<string, string> = { 絶好調: '#22c55e', 好調: '#84cc16', 普通: '#9ca3af', 不調: '#f97316', 絶不調: '#ef4444' };
const COND_ICON: Record<string, string> = { 絶好調: '🔥', 好調: '😊', 普通: '😐', 不調: '💧', 絶不調: '💀' };
const RARITY_COLOR: Record<string, string> = { Common: '#9ca3af', Rare: '#3b82f6', Epic: '#a855f7', Legendary: '#eab308' };

function BlockBar({ value }: { value: number }) {
  const filled = Math.min(10, Math.max(0, Math.round((value || 0) / 10)));
  const empty = 10 - filled;
  return (
    <span className="font-mono text-gray-200 tracking-[-1px] text-[13px] leading-none">
      <span className="text-white">{'█'.repeat(filled)}</span>
      <span className="text-gray-500 tracking-[1px]">{'░'.repeat(empty)}</span>
    </span>
  );
}

export default function BettingPhase() {
  const { 
    horses, raceData, role, myCoins, myBets, addBet, chatMessages, addChatMessage, 
    bettingEndTime, isSpectator, roomSettings, win5Data, setWin5Data 
  } = useGameStore();

  const [betType, setBetType] = useState(BET_TYPES[0]);
  const [buyMode, setBuyMode] = useState<'通常' | 'ボックス' | '流し'>('通常');
  const [selected, setSelected] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState(100);
  const [chatInput, setChatInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [tab, setTab] = useState<'list' | 'chat' | 'owned'>('list');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const isTransitioningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bug-9, Imp-19: useCallback でラップし、stale closure を防ぐ
  const startRace = useCallback(() => {
    // isTransitioning は ref でアクセスして最新値を参照
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    if (timerRef.current) clearInterval(timerRef.current);

    setTimeout(() => {
      try {
        const { raceData: rd, horses: hs } = useGameStore.getState();
        const sim = raceSimulator.simulate(rd, hs);
        const updated = { ...rd, simulation: sim };
        const raceStartTime = Date.now() + 4000;
        const s = useGameStore.getState();
        peerManager.broadcast({ 
          type: 'phase_start', 
          phase: 'race', 
          raceData: updated, 
          raceStartTime,
          sessionHorseWins: s.sessionHorseWins,
          lastWinnerHN: s.lastWinnerHN
        });
        useGameStore.getState().setRaceStartTime(raceStartTime);
        useGameStore.getState().setRaceData(updated);
        useGameStore.getState().setPhase('race');
      } catch (err) {
        console.error(err);
        alert('レース開始に失敗しました');
        isTransitioningRef.current = false;
        setIsTransitioning(false);
      }
    }, 2000);
  }, []);

  // NPC Betting Logic (Host Only)
  useEffect(() => {
    if (role !== 'host' || !roomSettings.npcEnabled || !bettingEndTime || isTransitioning) return;

    const npcInterval = setInterval(async () => {
      const now = Date.now();
      if (now >= bettingEndTime) return;

      if (Math.random() > 0.4) { // 60% chance every 2s
        const { generateNPCBet, getNPCComment } = await import('../core/npc_logic');
        const currentHorses = useGameStore.getState().horses;
        const npcBet = generateNPCBet(currentHorses);
        
        if (npcBet) {
          const currentPool = useGameStore.getState().hostBetPool;
          const nextPool = [...currentPool, npcBet];
          useGameStore.getState().setHostBetPool(nextPool);
          peerManager.recalculateAndBroadcastOdds(nextPool);

          // Notify in chat occasionally
          if (Math.random() > 0.6) {
            const comment = getNPCComment(npcBet.playerName!);
            const msg = {
              id: 'npc-msg-' + Date.now(),
              sender: 'SYSTEM',
              text: `[NPC] ${npcBet.playerName}「${comment}」 (${npcBet.bet_type} ${npcBet.horse_numbers.join('-')} に${npcBet.amount}C)`,
              timestamp: Date.now()
            };
            addChatMessage(msg);
            peerManager.broadcast({ type: 'chat', msg });
          }
        }
      }
    }, 2000);

    return () => clearInterval(npcInterval);
  }, [role, roomSettings.npcEnabled, bettingEndTime, isTransitioning, addChatMessage]);

  useEffect(() => {
    if (!bettingEndTime) return;
    
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((bettingEndTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (useGameStore.getState().role === 'host') startRace();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [bettingEndTime, startRace]);

  const maxSel = ['単勝', '複勝', 'WIN5'].includes(betType) ? 1 : ['馬連', 'ワイド', '馬単'].includes(betType) ? 2 : 3;

  const resetAndSetMode = (m: '通常' | 'ボックス' | '流し') => { setBuyMode(m); setSelected([]); };
  const resetAndSetType = (t: string) => { setBetType(t); setSelected([]); };

  const isBettingClosed = () => bettingEndTime !== null && Date.now() >= bettingEndTime;

  const isWin5Active = win5Data?.isActive;
  const isSurvivor = win5Data?.survivors.includes(peerManager.myPeerId || '');
  const hasAlreadyBetWin5 = myBets.some(b => b.bet_type === 'WIN5');

  const currentBetTypes = (isWin5Active && isSurvivor) ? [...BET_TYPES, 'WIN5'] : BET_TYPES;

  const handleHorseSelect = (hn: number) => {
    if (isBettingClosed()) return; // Locked
    if (buyMode === '通常') {
      if (selected.includes(hn)) setSelected(selected.filter(n => n !== hn));
      else if (selected.length < maxSel) setSelected([...selected, hn]);
      else setSelected([...selected.slice(0, -1), hn]);
    } else {
      setSelected(prev => prev.includes(hn) ? prev.filter(n => n !== hn) : [...prev, hn]);
    }
  };

  const getCombinations = (): number[][] => {
    const n = selected.length;
    const ordered = ['馬単', '3連単'].includes(betType);
    if (buyMode === '通常') return n === maxSel ? [selected] : [];
    if (buyMode === 'ボックス') {
      if (n < maxSel) return [];
      const res: number[][] = [];
      const gen = (s: number, c: number[]) => { if (c.length === maxSel) { res.push([...c]); return; } for (let i = s; i < n; i++) { c.push(selected[i]); gen(i + 1, c); c.pop(); } };
      const perm = (c: number[], u: boolean[]) => { if (c.length === maxSel) { res.push([...c]); return; } for (let i = 0; i < n; i++) { if (u[i]) continue; u[i] = true; c.push(selected[i]); perm(c, u); c.pop(); u[i] = false; } };
      ordered ? perm([], new Array(n).fill(false)) : gen(0, []);
      return res;
    }
    if (buyMode === '流し') {
      if (n < maxSel) return [];
      const axis = selected[0], partners = selected.slice(1), sz = maxSel - 1;
      const res: number[][] = [];
      const gen = (s: number, c: number[]) => { if (c.length === sz) { res.push([axis, ...c]); return; } for (let i = s; i < partners.length; i++) { c.push(partners[i]); gen(i + 1, c); c.pop(); } };
      const perm = (c: number[], u: boolean[]) => { if (c.length === sz) { res.push([axis, ...c]); return; } for (let i = 0; i < partners.length; i++) { if (u[i]) continue; u[i] = true; c.push(partners[i]); perm(c, u); c.pop(); u[i] = false; } };
      ordered ? perm([], new Array(partners.length).fill(false)) : gen(0, []);
      return res;
    }
    return [];
  };

  const combos = getCombinations();
  const effectiveBetAmount = betType === 'WIN5' ? 0 : (betAmount || 100);
  const totalCost = combos.length * effectiveBetAmount;

  const handlePurchase = () => {
    if (isBettingClosed() || !combos.length || totalCost > myCoins) return;
    if (betType !== 'WIN5' && effectiveBetAmount <= 0) return;
    if (betType === 'WIN5' && hasAlreadyBetWin5) {
      alert('WIN5は1レースにつき1枚しか購入できません');
      return;
    }
    const newCoins = myCoins - totalCost;
    useGameStore.getState().setMyCoins(newCoins);
    const role = useGameStore.getState().role;
    combos.forEach(nums => {
      const bet: Bet = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        playerId: peerManager.myPeerId || 'unknown',
        playerName: useGameStore.getState().playerName,
        bet_type: betType,
        horse_numbers: nums,
        amount: effectiveBetAmount
      };
      addBet(bet);
      // Bug-10: ホストの場合は sendToHost を呼ばず直接 hostBetPool に追加
      // (sendToHost → handleIncomingData → setHostBetPool で2重追加になるため)
      if (role === 'host') {
        const s = useGameStore.getState();
        const nextPool = [...s.hostBetPool, bet];
        s.setHostBetPool(nextPool);
        
        // WIN5の購入なら賞金プールに加算 (ホスト自身)
        if (betType === 'WIN5' && s.win5Data) {
          const nextWin5 = { ...s.win5Data, totalPrize: s.win5Data.totalPrize + effectiveBetAmount };
          s.setWin5Data(nextWin5);
          peerManager.broadcast({ type: 'win5_update', data: nextWin5 });
        }

        peerManager.recalculateAndBroadcastOdds(nextPool);
      } else {
        peerManager.sendToHost({ type: 'place_bet', bet });
      }
    });

    // Announce to chat
    const comboText = combos.length > 1 ? `${combos.length}点分` : combos[0].join('-');
    const betMsg = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sender: 'SYSTEM',
      text: `${useGameStore.getState().playerName}さんが ${betType}(${comboText}) を購入しました`,
      timestamp: Date.now()
    };
    addChatMessage(betMsg);
    peerManager.sendToHost({ type: 'chat', msg: betMsg });
    // コイン残高をホストに報告して参加者リストを更新
    peerManager.reportCoinsToHost(newCoins);

    setFeedback(`✓ ${combos.length}点購入`);
    setTimeout(() => setFeedback(''), 2500);
    setSelected([]);
  };

  const handleCancelBet = (bet: Bet) => {
    if (isBettingClosed() || bet.bet_type === 'WIN5') return;
    const newCoins = myCoins + bet.amount;
    useGameStore.getState().setMyCoins(newCoins);
    useGameStore.getState().removeBet(bet.id);
    // ホスト自身のキャンセルはhostBetPoolからも削除してオッズを再計算
    const currentRole = useGameStore.getState().role;
    if (currentRole === 'host') {
      const nextPool = useGameStore.getState().hostBetPool.filter(b => b.id !== bet.id);
      useGameStore.getState().setHostBetPool(nextPool);
      peerManager.recalculateAndBroadcastOdds(nextPool);
    } else {
      peerManager.sendToHost({ type: 'cancel_bet', betId: bet.id });
    }
    peerManager.reportCoinsToHost(newCoins);

    const cancelMsg = {
      id: 'cancel-' + Date.now().toString(36),
      sender: 'SYSTEM',
      text: `${useGameStore.getState().playerName}さんが馬券をキャンセルしました`,
      timestamp: Date.now()
    };
    addChatMessage(cancelMsg);
    peerManager.sendToHost({ type: 'chat', msg: cancelMsg });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sender: useGameStore.getState().playerName,
      text: chatInput.trim(),
      timestamp: Date.now()
    };
    addChatMessage(msg); peerManager.sendToHost({ type: 'chat', msg });
    setChatInput('');
  };

  const totalSpent = myBets.reduce((s, b) => s + b.amount, 0);

  if (!horses || horses.length === 0 || !raceData) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#111113] text-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-black tracking-widest animate-pulse">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#111113] text-gray-200 overflow-hidden" style={{ fontSize: 13 }}>

      {/* ── Header ── */}
      <header className="flex-none h-12 bg-[#1a1a1e] border-b border-[#2a2a32] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-black text-white tracking-wider">馬券購入</span>
          {raceData && (
            <span className="text-xs text-gray-500 font-mono">
              {raceData.distance}m · <span className={{ 良: 'text-green-400', 稍重: 'text-yellow-400', 重: 'text-orange-400', 不良: 'text-red-400' }[raceData.field_condition as string] || 'text-gray-400'}>{raceData.field_condition}</span> · {raceData.weather}
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Timer display */}
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">締切まで</div>
            <div className={`font-mono text-xl font-black tabular-nums ${timeLeft !== null && timeLeft < 30 ? 'text-red-500 animate-pulse' : 'text-indigo-400'}`}>
              {timeLeft !== null ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}` : '--:--'}
            </div>
          </div>

          {isSpectator && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-amber-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
              Spectator Mode
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-gray-400 font-bold">残高</div>
              <div className="font-mono font-black text-yellow-500 tabular text-sm">{myCoins.toLocaleString()} C</div>
            </div>
            {role === 'host' && (
              <button onClick={startRace} disabled={isTransitioning} className="px-4 py-1.5 rounded font-bold text-xs transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20">
                {isTransitioning ? '最終計算中...' : 'レース開始'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Transition Overlay */}
        {isTransitioning && (
          <div className="absolute inset-0 z-50 bg-[#111113]/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
            <div className="text-xl font-black text-white tracking-widest uppercase">レース集計中...</div>
            <div className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-widest">出馬表を最終確認しています</div>
          </div>
        )}

        {/* Left: List/Chat tabs */}
        <div className="flex flex-col border-r border-[#2a2a32]" style={{ width: '52%' }}>
          <div className="flex border-b border-[#2a2a32] bg-[#161618] shrink-0">
            {(['list', 'chat', 'owned'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-black tracking-[0.15em] uppercase transition-colors ${tab === t ? 'text-white border-b-2 border-indigo-500 bg-[#1a1a1e]' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'list' ? `出馬表` : t === 'chat' ? `チャット` : `購入済 (${myBets.length})`}
              </button>
            ))}
          </div>

          {tab === 'list' && (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                <thead>
                  <tr className="bg-[#1a1a1e] text-gray-400 sticky top-0 z-10 font-black uppercase tracking-widest" style={{ fontSize: 10 }}>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="w-10 text-center py-2">番</th>
                    <th className="px-2 py-2 text-left">馬名</th>
                    <th className="w-20 text-right px-2 py-2">騎手</th>
                    <th className="w-12 text-right px-2 py-2 text-yellow-500/80">単勝</th>
                    <th className="w-12 text-right px-2 py-2 text-gray-400">複勝</th>
                  </tr>
                </thead>
                <tbody>
                  {horses.map(h => {
                    const isSel = selected.includes(h.horse_number);
                    const isAxis = buyMode === '流し' && selected[0] === h.horse_number;
                    const canSel = (buyMode !== '通常' || isSel || selected.length < maxSel) && !isBettingClosed();
                    const color = HORSE_COLORS[h.horse_number - 1] || '#aaa';
                    return (
                      <tr key={h.horse_number} onClick={() => canSel && handleHorseSelect(h.horse_number)}
                        className={`border-b border-[#1e1e22] transition-colors cursor-pointer ${isSel ? 'bg-indigo-500/10' : 'hover:bg-[#1e1e22]'} ${!canSel ? 'opacity-30 cursor-not-allowed' : ''}`}>
                        <td className="pl-2 py-2.5">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSel ? 'bg-indigo-500 border-indigo-500' : 'border-[#3a3a44]'}`}>
                            {isSel && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-black text-[11px]" style={{ background: color }}>{h.horse_number}</span>
                            {isAxis && <span className="text-[9px] text-blue-400 font-bold">軸</span>}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-bold text-gray-100">{RARITY_EMOJI[h.rarity]} {h.name}</div>
                          <div style={{ fontSize: 10 }} className="text-gray-300 font-bold">{h.age}歳{h.gender} · {h.running_style}</div>
                        </td>
                        <td className="px-2 py-2.5 text-right text-gray-100 font-bold" style={{ fontSize: 11 }}>{h.jockey_name || '—'}</td>
                        <td className="px-2 py-2.5 text-right font-mono font-black text-yellow-500 text-sm tabular-nums">{h.odds_win?.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-gray-300 font-bold tabular-nums">{h.odds_place?.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
                {chatMessages.length === 0 && <div className="text-gray-700 text-xs italic">メッセージはありません</div>}
                {chatMessages.map((msg, i) => (
                  <div key={i} className="text-xs animate-fade-in bg-white/5 p-1.5 rounded border border-white/5">
                    <span className="text-indigo-300 font-black">{msg.sender}</span>
                    <span className="text-gray-500 mx-1">›</span>
                    <span className="text-gray-100 whitespace-pre-wrap leading-relaxed font-medium">{msg.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendChat} className="border-t border-[#2a2a32] flex shrink-0">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="メッセージ..."
                  className="flex-1 bg-transparent px-4 py-2.5 text-xs text-gray-300 placeholder-gray-700 focus:outline-none" />
                <button type="submit" className="px-4 text-xs font-bold text-indigo-400 hover:text-indigo-300 border-l border-[#2a2a32]">送信</button>
              </form>
            </div>
          )}

          {tab === 'owned' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {myBets.length === 0 && <div className="text-gray-700 text-xs italic">購入済みの馬券はありません</div>}
                {myBets.map((bet, i) => (
                  <div key={i} className="bg-[#1a1a1e] border border-[#2a2a32] rounded-lg p-3 flex items-center justify-between animate-fade-in">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-black rounded uppercase">{bet.bet_type}</span>
                        <span className="font-mono font-black text-white text-sm tracking-tighter">{bet.horse_numbers.join('-')}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 font-bold">{bet.amount.toLocaleString()} C</div>
                    </div>
                    <button
                      onClick={() => handleCancelBet(bet)}
                      disabled={isBettingClosed() || bet.bet_type === 'WIN5'}
                      className="px-3 py-1.5 bg-red-900/30 hover:bg-red-800/50 text-red-400 text-[10px] font-black rounded border border-red-900/50 transition-all disabled:opacity-20"
                    >
                      {bet.bet_type === 'WIN5' ? '確定済み' : 'キャンセル'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-[#2a2a32] bg-[#161618] px-4 py-3 shrink-0">
            <div className="flex flex-wrap gap-1 mb-2">
              {currentBetTypes.map(t => (
                <button key={t} onClick={() => resetAndSetType(t)} 
                  disabled={isBettingClosed() || (t === 'WIN5' && (!isSurvivor || hasAlreadyBetWin5))}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${betType === t ? (t === 'WIN5' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white') : 'bg-[#2a2a32] text-gray-500 hover:bg-[#35353f]'} disabled:opacity-20`}>
                  {t}
                </button>
              ))}
              <div className="flex-1" />
              {betType !== 'WIN5' && (['通常', 'ボックス', '流し'] as const).map(m => (
                <button key={m} onClick={() => resetAndSetMode(m)} disabled={isBettingClosed()}
                  className={`px-2 py-1 rounded text-xs font-bold border transition-all ${buyMode === m ? 'border-gray-500 bg-[#2a2a32] text-white' : 'border-[#2a2a32] text-gray-600 hover:border-gray-500'} disabled:opacity-30`}>{m}</button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-[90px]">
                <div style={{ fontSize: 10 }} className="text-gray-400 font-bold mb-0.5">{buyMode === '流し' ? `軸→相手` : `選択 ${selected.length}/${buyMode === '通常' ? maxSel : '∞'}`}</div>
                <div className="font-mono font-black text-gray-300 tabular">{selected.length > 0 ? selected.join(buyMode === '流し' && selected.length > 1 ? '→' : '-') : '—'}</div>
              </div>
              <div className="text-gray-800">|</div>
              <div>
                <div style={{ fontSize: 10 }} className="text-gray-400 font-bold mb-1 flex justify-between">
                  <span>1点あたりの金額</span>
                  <div className="flex gap-1 ml-4">
                    {betType !== 'WIN5' && [100, 500, 1000, 5000].map(amt => (
                      <button key={amt} onClick={() => setBetAmount(prev => prev + amt)} disabled={isBettingClosed()}
                        className="px-1.5 py-0.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[9px] font-black rounded border border-indigo-500/20 transition-all">
                        +{amt.toLocaleString()}
                      </button>
                    ))}
                    {betType !== 'WIN5' && (
                      <>
                        <button onClick={() => setBetAmount(Math.floor(myCoins / (combos.length || 1)))} disabled={isBettingClosed() || !combos.length}
                          className="px-1.5 py-0.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 text-[9px] font-black rounded border border-yellow-500/20 transition-all">
                          MAX
                        </button>
                        <button onClick={() => setBetAmount(0)} disabled={isBettingClosed()}
                          className="px-1.5 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-black rounded border border-red-500/20 transition-all">
                          CLR
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" min="0" step="100" value={effectiveBetAmount || ''} 
                    onFocus={e => e.target.select()}
                    onChange={e => setBetAmount(Math.max(0, parseInt(e.target.value) || 0))} 
                    disabled={isBettingClosed() || betType === 'WIN5'}
                    className={`w-28 bg-[#0e0e10] border border-[#2a2a32] rounded px-3 py-1.5 font-mono text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-all shadow-inner ${betType === 'WIN5' ? 'border-emerald-500/50 text-emerald-400' : ''}`} 
                    placeholder="100"
                  />
                  <span style={{ fontSize: 11 }} className="text-gray-400 font-black ml-1">C</span>
                </div>
              </div>
              {combos.length > 0 && (
                <div>
                  <div style={{ fontSize: 10 }} className="text-gray-600">{combos.length > 1 ? `${combos.length}点合計` : '合計'}</div>
                  <div className={`font-mono font-black tabular ${totalCost > myCoins ? 'text-red-500' : 'text-yellow-500'}`}>{totalCost.toLocaleString()} C</div>
                </div>
              )}
              <div className="flex-1" />
              {feedback && <span style={{ fontSize: 11 }} className="text-green-400 font-bold animate-fade-in">{feedback}</span>}
              <button onClick={handlePurchase} disabled={isBettingClosed() || !combos.length || totalCost > myCoins || isSpectator}
                className="px-5 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-[#2a2a32] disabled:text-gray-600 text-white font-black text-sm rounded-lg transition-all active:scale-95">
                {isSpectator ? '観戦中' : isBettingClosed() ? '締切済' : '購入する'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Horse cards */}
        <div className="overflow-y-auto p-3 space-y-3" style={{ width: '48%' }}>
          <div style={{ fontSize: 10 }} className="text-gray-400 uppercase tracking-widest font-black sticky top-0 bg-[#111113] pb-1 z-10">全馬データ</div>
          {horses.map(h => {
            const color = HORSE_COLORS[h.horse_number - 1] || '#aaa';
            const isSel = selected.includes(h.horse_number);
            const canSel = (buyMode !== '通常' || isSel || selected.length < maxSel) && !isBettingClosed();
            return (
              <div key={h.horse_number} onClick={() => canSel && handleHorseSelect(h.horse_number)}
                className={`rounded-lg transition-all cursor-pointer relative overflow-hidden bg-[#1e1e24] ${isSel ? 'ring-2 ring-indigo-500 bg-indigo-950/40' : 'hover:bg-[#25252c]'} ${!canSel ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: color }} />

                <div className="pl-4 pr-3 py-3">
                  {/* Header */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-lg leading-none pt-0.5">🐴</span>
                    <span className="font-black text-white text-[16px]">
                      {h.horse_number}番 {h.name} <span className="text-gray-300 font-bold text-[13px] ml-1">({h.age || 4}歳 {h.gender || '牡'} {h.coat_color || '栗毛'})</span>
                    </span>
                  </div>

                  {/* Jockey */}
                  <div className="mb-2">
                    <div className="text-[11px] text-gray-400 font-bold mb-0.5 leading-none">騎手</div>
                    <div className="text-gray-200 text-[13px] font-bold">{h.jockey_name || '不明'}</div>
                  </div>

                  {/* Abilities */}
                  <div className="mb-3">
                    <div className="text-[11px] text-white font-black uppercase tracking-widest mb-1 leading-none">能力値</div>
                    <div className="bg-[#1e1a29] rounded p-2.5 border border-[#2d283e] space-y-1.5">
                      {[
                        ['スピード', h.speed],
                        ['スタミナ', h.stamina],
                        ['パワー', h.power],
                        ['瞬発力', h.burst],
                        ['精神力', h.guts],
                        ['賢さ', h.wisdom],
                      ].map(([label, val]) => (
                        <div key={label as string} className="flex items-center text-[12px] leading-none">
                          <span className="text-gray-400 w-16 inline-block font-black tracking-tighter">{label}</span>
                          <BlockBar value={val as number} />
                          <span className="text-gray-300 w-7 text-right font-mono ml-2 font-bold">{Math.floor(val as number)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Grid */}
                  <div className="grid grid-cols-12 gap-y-3 gap-x-2 text-[11px] leading-none">
                    <div className="col-span-5">
                      <div className="text-gray-300 font-black uppercase tracking-widest mb-1.5">距離適性</div>
                      <div className="text-gray-100 font-mono font-bold tracking-tight text-[11px]">{`短${h.distance_apt?.['短距離'] || '-'} マ${h.distance_apt?.['マイル'] || '-'} 中${h.distance_apt?.['中距離'] || '-'} 長${h.distance_apt?.['長距離'] || '-'}`}</div>
                    </div>
                    <div className="col-span-3">
                      <div className="text-gray-300 font-black uppercase tracking-widest mb-1.5">脚質</div>
                      <div className="text-gray-100 font-black text-[11px]">{h.running_style}</div>
                    </div>
                    <div className="col-span-4">
                      <div className="text-gray-300 font-black uppercase tracking-widest mb-1.5">今日の調子</div>
                      <div className="font-black text-[11px]" style={{ color: COND_COLOR[h.condition] || '#9ca3af' }}>{h.condition} {COND_ICON[h.condition]}</div>
                    </div>

                    <div className="col-span-5">
                      <div className="text-gray-300 font-black uppercase tracking-widest mb-1.5">馬体重</div>
                      <div className="text-gray-100 font-mono font-bold text-[11px]">{h.weight || 500}kg ({h.weight_change ? (h.weight_change > 0 ? `+${h.weight_change}` : h.weight_change) : '±0'})</div>
                    </div>
                    <div className="col-span-3">
                      <div className="text-gray-300 font-black uppercase tracking-widest mb-1.5">通算成績</div>
                      <div className="text-gray-100 font-mono font-bold text-[11px]">{h.wins || 0}-{(h as any).record?.places || 0}-{(h as any).record?.shows || 0}-{(h as any).record?.losses || 0}</div>
                    </div>
                    <div className="col-span-4">
                      <div className="text-gray-300 font-black uppercase tracking-widest mb-1.5">レーティング</div>
                      <div className="text-gray-100 font-mono flex items-center gap-1 text-[11px] font-black">
                        {Math.floor(h.rating || 1000)} (<span style={{ color: RARITY_COLOR[h.rarity || 'Common'] }} className="text-[10px]">●</span> {h.rarity || 'Common'})
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
