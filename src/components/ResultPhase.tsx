import { useEffect, useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { peerManager } from '../network/peerManager';
import { oddsCalculator } from '../core/odds_calculator';
import { HORSE_COLORS } from '../core/constants';
import { db, checkRetirement } from '../db/db';

const MEDAL = ['🥇', '🥈', '🥉'];

/** 秒数を競馬のタイム形式 (m:ss.f) に変換する */
function formatFinishTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0
    ? `${m}:${String(Math.floor(s)).padStart(2, '0')}.${(s % 1).toFixed(1).slice(2)}`
    : `${s.toFixed(1)}`;
}

function generateRaceName(distance: number, weather: string): string {
  const prefix = weather === '雪' ? '白銀' : weather === '雨' ? '雨情' : distance >= 3000 ? '鉄人' : '新鋭';
  let category = '特別';
  if (distance >= 2500) category = '大賞典';
  else if (distance >= 1900) category = '中距離S';
  else if (distance >= 1500) category = 'マイルC';
  else category = 'スプリント';
  
  return `${prefix}${category}`;
}

export default function ResultPhase() {
  const {
    raceData, myBets, myCoins, role, horses, participants, rematchVotes,
    win5Data, setWin5Data, roomCarryover, setRoomCarryover, setPhase
  } = useGameStore();
  const [totalPayout, setTotalPayout] = useState(0);
  const [paid, setPaid] = useState(false);
  const [myVote, setMyVote] = useState<'continue' | 'end' | null>(null);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [win5Message, setWin5Message] = useState<string | null>(null);
  const [showSurviveEffect, setShowSurviveEffect] = useState(false);

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
      else if (bet.bet_type === 'WIN5') {
        isHit = (nums[0] === first);
      }

      const payoutOdds = isHit ? oddsCalculator.calculatePayoutOdds(bet.bet_type, nums, horses) : 0;
      const payout = Math.floor(bet.amount * payoutOdds);
      return { ...bet, isHit, payout, payoutOdds };
    });
  }, [myBets, results, horses]);

  useEffect(() => {
    if (paid || !hitDetails.length) return;
    const total = hitDetails.reduce((s, d) => s + d.payout, 0);
    setTotalPayout(total);
    if (total > 0) {
      const newBal = useGameStore.getState().myCoins + total;
      useGameStore.getState().setMyCoins(newBal);
      // コイン変動をホストに報告
      peerManager.reportCoinsToHost(newBal);

      // WIN5サバイバル演出のトリガー
      if (hitDetails.some(d => d.bet_type === 'WIN5' && d.isHit)) {
        setShowSurviveEffect(true);
        setTimeout(() => setShowSurviveEffect(false), 5000);
      }
    }

    // Update horse records in DB (全クライアントが自分のローカルDBを更新。
    // 各クライアントは同じ馬プールを持つため、全員独立に記録を更新する。)
    if (results.length > 0) {
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

            // 引退チェック (Bot版と同じロジックを適用)
            await checkRetirement(horse.id, newTotal);
          }
        }

        // 名付け親初勝利判定（ホスト側のローカルで自分が名付け親の場合）
        if (idx === 0 && horse?.is_permanent) {
          useGameStore.getState().unlockTitle('owner_win');
        }

      });
    }

    // セッション内勝利数の更新（全員のローカルで実行）
    if (results.length > 0) {
      useGameStore.getState().updateSessionWins(results[0].horse_number);
    }

    // --- Title Unlock Logic ---
    const s = useGameStore.getState();
    const currentStats = s.stats;
    const newStats = { ...currentStats };

    newStats.totalRaces += 1;
    const sessionWins = hitDetails.filter(d => d.isHit).length;
    if (sessionWins > 0) newStats.totalWins += sessionWins;

    // 万馬券（100倍以上）のチェック
    const isManbaken = hitDetails.some(d => d.isHit && (d.payout / (d.amount || 1)) >= 100);
    if (isManbaken) {
      // 演出はUI側でhitDetailsを参照して行われる
    }

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

    if (sessionPayout >= 1000000) s.unlockTitle('bank_robber');

    if (s.myCoins >= 100000000) s.unlockTitle('payout_100m');
    else if (s.myCoins >= 10000000) s.unlockTitle('payout_10m');
    else if (s.myCoins >= 1000000) s.unlockTitle('billionaire');
    else if (s.myCoins >= 500000) s.unlockTitle('rich');
    else if (s.myCoins >= 100000) s.unlockTitle('millionaire');

    if (win5Data?.isActive && win5Data.survivors.includes(peerManager.myPeerId || '')) s.unlockTitle('win5_survivor');

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

    // --- Special Condition Titles ---
    const sortedHorses = [...horses].sort((a, b) => (a.odds_win || 99) - (b.odds_win || 99));
    
    // 一番人気の呪い (1番人気が4着以下で、それに賭けていた)
    const favoriteHorse = sortedHorses[0];
    if (favoriteHorse) {
      const top3 = [results[0]?.horse_number, results[1]?.horse_number, results[2]?.horse_number];
      if (!top3.includes(favoriteHorse.horse_number)) {
        const betOnFavorite = myBets.some(b => b.horse_numbers.includes(favoriteHorse.horse_number));
        if (betOnFavorite) s.unlockTitle('favorite_loser');
      }
    }

    // 大穴狙い (8番人気以下の単勝的中)
    const darkHorses = sortedHorses.slice(7).map(h => h.horse_number);
    const hitDarkHorse = hitDetails.some(d => d.isHit && d.bet_type === '単勝' && darkHorses.includes(d.horse_numbers[0]));
    if (hitDarkHorse) s.unlockTitle('dark_horse');

    // 惜敗 (単勝賭けた馬がハナ差またはアタマ差2着)
    const secondResult = results[1];
    if (secondResult && (secondResult.margin === 'ハナ' || secondResult.margin === 'アタマ')) {
      const betOnSecond = myBets.some(b => b.bet_type === '単勝' && b.horse_numbers[0] === secondResult.horse_number);
      if (betOnSecond) s.unlockTitle('just_missed');
    }

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
    // --- WIN5 Survival Processing (Host Only) ---
    if (role === 'host' && win5Data?.isActive && !paid) {
      setTimeout(() => {
        const first = results[0]?.horse_number;
        const allBets = useGameStore.getState().hostBetPool;

        // 的中者（サバイバー）の抽出
        const currentSurvivors = win5Data.survivors;
        const nextSurvivors: string[] = [];

        currentSurvivors.forEach(sid => {
          const sBet = allBets.find(b => b.playerId === sid && b.bet_type === 'WIN5');
          const isHit = !!(sBet && sBet.horse_numbers[0] === first);
          if (isHit) nextSurvivors.push(sid);
        });

        const isLastRace = win5Data.currentRace === 5;
        const noSurvivors = nextSurvivors.length === 0;

        if (isLastRace || noSurvivors) {
          // WIN5終了処理
          let message = "";
          if (noSurvivors) {
            message = "全員脱落しました。キャリーオーバー発生！";
            const newCarry = roomCarryover + win5Data.totalPrize;
            setRoomCarryover(newCarry);
            peerManager.broadcast({ type: 'win5_carryover_update', val: newCarry });
          } else if (isLastRace) {
            message = `WIN5達成！的中者: ${nextSurvivors.length}名`;
            const share = Math.floor((win5Data.totalPrize + roomCarryover) / nextSurvivors.length);
            // 5点的中者の賞金分配は、ここではステート更新のみ通知
            // (実際のコイン加算はクライアント側で行う)
            setRoomCarryover(0);
            peerManager.broadcast({ type: 'win5_carryover_update', val: 0 });
          }

          const updatedWin5 = { ...win5Data, survivors: nextSurvivors, isCompleted: true };
          setWin5Data(updatedWin5);
          peerManager.broadcast({ type: 'win5_update', data: updatedWin5 });
          setWin5Message(message);
        } else {
          // 次のレースへ
          const updatedWin5 = { ...win5Data, survivors: nextSurvivors, currentRace: win5Data.currentRace + 1 };
          setWin5Data(updatedWin5);
          peerManager.broadcast({ type: 'win5_update', data: updatedWin5 });
        }
      }, 1000);
    }

    // --- Save Race History --- (WIN5 bets は収支グラフ用に除外)
    if (!paid && results.length > 0) {
      const betsToRecord = myBets.filter(b => b.bet_type !== 'WIN5');
      if (betsToRecord.length > 0) {
        const historyEntries = betsToRecord.map(bet => {
          const detail = hitDetails.find(d => d.id === bet.id);
          return {
            race_name: raceData?.race_name || '一般レース',
            date: Date.now(),
            bet_type: bet.bet_type,
            bet_horses: bet.horse_numbers,
            bet_amount: bet.amount,
            is_hit: !!detail?.isHit,
            payout: detail?.payout || 0,
            winners: results.slice(0, 3).map(r => ({
              horse_number: r.horse_number,
              horse_name: r.horse_name,
              jockey_name: r.jockey_name
            }))
          };
        });
        db.race_history.bulkAdd(historyEntries).catch(err => console.error('Failed to save history', err));
      }
    }

    setPaid(true);
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
    useGameStore.getState().setHostBetPool([]);
    useGameStore.getState().setRaceData(null);
    useGameStore.getState().updateHorses([]);
    useGameStore.getState().setBettingEndTime(null); // Reset timer
    useGameStore.getState().setRematchVotes({ continue: [], end: [] });
    useGameStore.getState().clearNpcChatMessages();
    if (role === 'host') {
      peerManager.broadcast({ type: 'participants_update', participants: useGameStore.getState().participants });
      peerManager.broadcast({ type: 'phase_start', phase: 'lobby' });
    }
  };

  /** 同じレース条件で馬プールから再抽選して再レース */
  const handleRematch = async () => {
    const s = useGameStore.getState();
    const settings = s.roomSettings;
    const rd = s.raceData;
    if (!rd) return;

    // WIN5開催中の場合は設定を固定
    const nextSettings = win5Data?.isActive ? {
      ...settings,
      distance: 'random',
      fieldCondition: 'random',
      weather: 'random',
      bettingTime: 180
    } : settings;

    // --- 条件の決定 (おまかせ設定の場合は再抽選する) ---
    const { FIELD_CONDITIONS, DISTANCE_CATEGORIES } = await import('../core/constants');

    let nextDistance = rd.distance || 2000;
    if (nextSettings.distance === 'random') {
      const distKeys = Object.keys(DISTANCE_CATEGORIES);
      const distanceCat = distKeys[Math.floor(Math.random() * distKeys.length)];
      const [lo, hi] = DISTANCE_CATEGORIES[distanceCat];
      nextDistance = Math.round((Math.random() * (hi - lo) + lo) / 100) * 100;
    }

    let nextFC = rd.field_condition || '良';
    if (nextSettings.fieldCondition === 'random') {
      nextFC = FIELD_CONDITIONS[Math.floor(Math.random() * FIELD_CONDITIONS.length)];
    }

    let nextWeather = rd.weather || '晴';
    if (nextSettings.weather === 'random') {
      const wList = ['晴', '曇', '雨', '雪'];
      nextWeather = wList[Math.floor(Math.random() * wList.length)];
    }

    let nextCourseFeature = rd.course_feature || '平坦';
    if (nextSettings.courseFeature === 'random') {
      const cfList = ['平坦', '坂あり', '直線長', 'コーナー多'];
      nextCourseFeature = cfList[Math.floor(Math.random() * cfList.length)];
    }

    const { drawHorsesFromPool } = await import('../db/db');
    const { oddsCalculator: oc } = await import('../core/odds_calculator');

    const count = nextSettings.horseCount || s.horses.length || 12;
    const drawn = await drawHorsesFromPool(count);
    const freshHorses = drawn.map((h, i) => ({ ...h, horse_number: i + 1 }));
    freshHorses.forEach(h => {
      (h as any).score = oc.calculateCompositeScore(h, nextDistance, nextFC, nextCourseFeature);
    });
    const horsesWithOdds = oc.calculateInitialOdds(freshHorses, nextSettings.realOdds);
    const nextRaceName = generateRaceName(nextDistance, nextWeather);
    const freshRaceData = {
      race_name: nextRaceName,
      distance: nextDistance,
      field_condition: nextFC,
      weather: nextWeather,
      course_feature: nextCourseFeature
    };

    s.updateHorses(horsesWithOdds);
    s.setRaceData(freshRaceData);
    s.resetBets();
    s.clearNpcChatMessages();
    s.setHostBetPool([]);
    s.setBettingEndTime(null);
    s.setRematchVotes({ continue: [], end: [] });

    const endTime = Date.now() + (nextSettings.bettingTime || 120) * 1000;
    s.setBettingEndTime(endTime);
    s.setPhase('betting');

    peerManager.broadcast({
      type: 'phase_start',
      phase: 'betting',
      horses: horsesWithOdds,
      raceData: freshRaceData,
      bettingEndTime: endTime,
      settings: nextSettings,
    });
  };

  const handleWin5Cashout = () => {
    if (hasCashedOut || !win5Data) return;

    // 現在のレース番号。1戦目終了後は currentRace が 2 になっている想定
    // もしホストの更新がまだなら、現在のレースが的中しているかを確認
    const isHitThisRace = hitDetails.some(d => d.bet_type === 'WIN5' && d.isHit);
    if (!isHitThisRace && win5Data.currentRace === 1) return; // まだ1戦目も終わっていない

    const hitCount = win5Data.currentRace - (isHitThisRace ? 0 : 1);
    // 上記だと少し複雑なので、シンプルに「これまでの的中数」を確実に取る
    // ホストが更新済みなら currentRace - 1、未更新なら currentRace そのもの
    // ただし、的中していないのにキャッシュアウトはできないはず。

    const actualHitCount = hitDetails.some(d => d.bet_type === 'WIN5' && d.isHit)
      ? Math.max(win5Data.currentRace, 1)
      : win5Data.currentRace - 1;

    if (actualHitCount <= 0) return;

    const entryCount = participants.length;
    // 的中数 × 6.5% を分配
    const share = Math.floor((win5Data.totalPrize / entryCount) * (actualHitCount * 0.065));

    if (share > 0) {
      const newBal = myCoins + share;
      useGameStore.getState().setMyCoins(newBal);
      peerManager.reportCoinsToHost(newBal);
    }

    setHasCashedOut(true);
    peerManager.sendToHost({ type: 'win5_cashout', amount: share, playerId: peerManager.myPeerId });
  };

  const handleCloseWin5 = () => {
    setWin5Data(null);
    peerManager.broadcast({ type: 'win5_update', data: null });
    handleBackToLobby();
  };

  const handleWin5Win = () => {
    if (!win5Data) return;
    const share = Math.floor((win5Data.totalPrize + roomCarryover) / win5Data.survivors.length);
    const newBal = myCoins + share;
    useGameStore.getState().setMyCoins(newBal);
    useGameStore.getState().unlockTitle('win5_champion');
    useGameStore.getState().unlockTitle('win5_legend');
    // 賞金首タイトル: キャリーオーバーが大きかった場合
    if (roomCarryover >= 50000) useGameStore.getState().unlockTitle('win5_hunter');
    peerManager.reportCoinsToHost(newBal);
    handleCloseWin5();
  };

  const totalBetAmount = myBets.reduce((s, b) => s + b.amount, 0);
  const profit = totalPayout - totalBetAmount;
  const contVotes = rematchVotes.continue.length;
  const endVotes = rematchVotes.end.length;
  const totalVoters = participants.filter(p => p.id !== 'host').length;

  return (
    <div className="h-screen flex flex-col bg-[#111113] text-gray-200 overflow-hidden" style={{ fontSize: 13 }}>
      {/* ── WIN5 Survive Flash ── */}
      {showSurviveEffect && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-emerald-500/10 animate-fade-in backdrop-blur-[2px]" />
          <div className="relative animate-pop-in text-center">
            <div className="absolute -inset-20 bg-emerald-500/20 blur-[100px] rounded-full animate-pulse" />
            <h2 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-200 via-emerald-400 to-emerald-600 tracking-tighter uppercase italic leading-none drop-shadow-[0_0_50px_rgba(16,185,129,0.5)]">
              Survived
            </h2>
            <div className="mt-4 flex items-center justify-center gap-4 animate-slide-up">
              <div className="h-[2px] w-24 bg-gradient-to-r from-transparent to-emerald-400" />
              <div className="text-xl font-bold text-emerald-400 tracking-[0.5em] uppercase">Stage Clear</div>
              <div className="h-[2px] w-24 bg-gradient-to-l from-transparent to-emerald-400" />
            </div>
            {/* Float up particles */}
            {[...Array(8)].map((_, i) => (
              <div key={i} className="absolute text-emerald-300 animate-float-up text-2xl" 
                style={{ 
                  left: `${Math.random() * 100 - 50}%`, 
                  top: '50%',
                  animationDelay: `${i * 0.2}s`,
                }}>
                ✨
              </div>
            ))}
          </div>
        </div>
      )}


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
              🔄 {win5Data?.isActive ? `第${win5Data.currentRace}関門へ` : '同条件で再レース'}
            </button>
            {!win5Data?.isActive && (
              <button onClick={handleBackToLobby}
                className="px-4 py-2 bg-[#2a2a32] hover:bg-[#35353f] text-gray-300 font-bold text-xs rounded-lg transition-all">
                ← ロビーに戻る
              </button>
            )}
          </div>
        )}

        {/* Client actions — Bug-14: 'client' -> 'guest' に修正 */}
        {role === 'guest' && (
          <div className="flex items-center gap-3">
            {!win5Data?.isActive && (
              <>
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
                <button onClick={handleBackToLobby}
                  className="px-4 py-2 bg-[#2a2a32] hover:bg-[#35353f] text-gray-300 font-bold text-xs rounded-lg transition-all ml-2">
                  ロビーで待機
                </button>
              </>
            )}
            {win5Data?.isActive && (
              <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                WIN5 進行中: 第{win5Data.currentRace}関門
              </div>
            )}
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
                    <td className="px-4 py-3 text-right font-mono text-gray-300 font-bold tabular">{formatFinishTime(r.finish_time)}</td>
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
          {(hitDetails.length > 0 || win5Data?.isActive) && (
            <section className="panel rounded-xl overflow-hidden">
              <div className="panel-header bg-[#202028] text-gray-300 flex justify-between font-black uppercase tracking-widest">
                <span>馬券明細 / WIN5状況</span>
                <span>投資 {totalBetAmount.toLocaleString()}C</span>
              </div>
              <div className="divide-y divide-[#1e1e22]">
                {hitDetails.map((d, i) => (
                  <div key={i} className={`flex items-center justify-between px-4 py-3 animate-fade-in ${d.isHit ? 'bg-yellow-500/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className={`bet-chip ${d.isHit ? (d.bet_type === 'WIN5' ? '!bg-emerald-500 !text-black' : '!bg-yellow-500 !text-black') : ''}`}>{d.bet_type}</span>
                      <span className="font-mono font-black text-gray-200 tabular">{d.horse_numbers.join('-')}</span>
                      <span className="text-gray-500 text-xs font-bold">{d.amount.toLocaleString()}C</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-black tabular ${d.isHit ? 'text-yellow-500' : 'text-gray-600'}`}>
                        {d.isHit ? (d.bet_type === 'WIN5' ? 'サバイバル成功！' : `+${d.payout.toLocaleString()}C`) : 'ハズレ / 脱落'}
                      </div>
                      {d.isHit && d.bet_type !== 'WIN5' && <div style={{ fontSize: 10 }} className="text-yellow-600 font-black">{d.payoutOdds.toFixed(1)}倍</div>}
                    </div>
                  </div>
                ))}
                {win5Data?.isActive && (
                  <div className="bg-[#111114] p-4">
                    <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-3">Survivor Log</div>
                    <div className="space-y-2">
                      {participants.map(p => {
                        const isSurvivor = win5Data.survivors.includes(p.id);
                        return (
                          <div key={p.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={isSurvivor ? 'text-white' : 'text-gray-600 line-through'}>{p.name}</span>
                              {isSurvivor ? (
                                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-black border border-emerald-500/20 uppercase">Survivor</span>
                              ) : (
                                <span className="text-[9px] bg-red-500/10 text-red-700 px-1.5 py-0.5 rounded font-black border border-red-500/10 uppercase">Eliminated</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {win5Data.survivors.includes(peerManager.myPeerId || '') && !win5Data.isCompleted && (
                      <button
                        onClick={handleWin5Cashout}
                        disabled={hasCashedOut}
                        className="w-full mt-4 py-2 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-500 border border-yellow-600/30 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
                      >
                        {hasCashedOut ? 'キャッシュアウト済み' : 'WIN5から降りる (キャッシュアウト)'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

        </div>
      </div>

      {/* WIN5 Special Overlays - PREMIUM VERSION */}
      {win5Data?.isCompleted && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl animate-fade-in" />

          {/* Animated golden rays */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
            <div className="w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_45deg,rgba(234,179,8,0.1)_90deg,transparent_135deg)] animate-spin-slow opacity-20" />
          </div>

          <div className="relative w-full max-w-2xl px-6 animate-pop-in">
            {win5Data.survivors.length > 0 ? (
              <div className="bg-[#1a1a20] border border-yellow-500/30 rounded-[48px] shadow-[0_0_100px_rgba(234,179,8,0.2)] overflow-hidden">
                <div className="bg-gradient-to-b from-yellow-500/10 to-transparent p-12 text-center space-y-10">

                  <div className="relative inline-block">
                    <div className="text-8xl mb-2 animate-bounce-subtle drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]">👑</div>
                    <div className="absolute -inset-8 bg-yellow-500/20 blur-3xl rounded-full animate-pulse" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-yellow-500 to-yellow-700 tracking-tighter uppercase italic leading-tight">
                      WIN5 Complete
                    </h2>
                    <div className="h-1 w-32 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mx-auto" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-sm">
                      <div className="text-gray-500 font-black uppercase tracking-widest text-[9px] mb-2">Survivors</div>
                      <div className="flex flex-wrap gap-1.5">
                        {win5Data.survivors.map(id => (
                          <span key={id} className="px-3 py-1 bg-yellow-500 text-black text-[10px] font-black rounded-full">
                            {participants.find(p => p.id === id)?.name || 'Player'}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-6 bg-yellow-500/10 rounded-3xl border border-yellow-500/20 backdrop-blur-sm">
                      <div className="text-yellow-600 font-black uppercase tracking-widest text-[9px] mb-2">Total Prize Pool</div>
                      <div className="text-4xl font-black text-yellow-500 font-mono tracking-tighter">
                        {Math.floor((win5Data.totalPrize + roomCarryover) / win5Data.survivors.length).toLocaleString()}<span className="text-lg ml-1">C</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 space-y-4">
                    {win5Data.survivors.includes(peerManager.myPeerId || '') ? (
                      <button onClick={handleWin5Win}
                        className="group relative w-full py-5 bg-gradient-to-b from-yellow-400 to-yellow-600 text-black font-black rounded-2xl shadow-2xl shadow-yellow-500/40 transition-all hover:scale-[1.02] active:scale-95 text-xl overflow-hidden">
                        <span className="relative z-10">配当を受け取って帰還する</span>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                      </button>
                    ) : (
                      <button onClick={handleCloseWin5} className="w-full py-5 bg-white/5 hover:bg-white/10 text-gray-400 font-black rounded-2xl transition-all">
                        栄光を称えて終了
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#1a1a20] border border-red-500/20 rounded-[48px] p-16 text-center space-y-8">
                <div className="text-8xl grayscale opacity-50 mb-4">💀</div>
                <div className="space-y-2">
                  <h2 className="text-5xl font-black text-red-500 tracking-tighter uppercase italic">WIN5 Failed</h2>
                  <p className="text-gray-500 font-bold">生存者ゼロ... 賞金はキャリーオーバーされます</p>
                </div>
                <div className="p-8 bg-red-500/5 rounded-3xl border border-red-500/10">
                  <div className="text-4xl font-black text-white font-mono tracking-tighter">+{win5Data.totalPrize.toLocaleString()} C</div>
                </div>
                <button onClick={handleCloseWin5} className="w-full py-5 bg-white/5 hover:bg-white/10 text-gray-400 font-black rounded-2xl transition-all">
                  無念の帰還
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
