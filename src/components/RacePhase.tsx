import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { peerManager } from '../network/peerManager';
import { CommentaryGenerator } from '../core/commentary_generator';
import { HORSE_COLORS } from '../core/constants';

const STAGE_DUR = 2500;  // Time per simulation stage (ms)
const MAX_COUNTDOWN = 5; // カウントダウン上限 (= raceStartTime バッファと揃える)
const GATE_OPEN_DUR = 750; // Keep race progress at zero until the gate transition is complete
const GOAL_STAGE_DUR = 5000; // Extra time for the final stretch
type PhotoPhase = 'none' | 'waiting' | 'review' | 'reveal' | 'complete';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function getTrackPos(progress: number, rx: number, ry: number) {
  const angle = -(progress * 2 * Math.PI) + Math.PI / 2;
  return { x: rx * Math.cos(angle), y: ry * Math.sin(angle), angle };
}

export default function RacePhase() {
  const { horses, raceData, role, sessionHorseWins, lastWinnerHN, raceStartTime } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [countdown, setCountdown] = useState(3);
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [commentary, setCommentary] = useState<{ id: number; text: string; type?: string }[]>([]);
  const [telop, setTelop] = useState<string>('');
  const [rankings, setRankings] = useState<{ hn: number; name: string; progress: number; prevRank?: number; confirmed?: boolean }[]>([]);
  const [pace, setPace] = useState<string>('');
  const [gateOpening, setGateOpening] = useState(false);
  const [photoPhase, setPhotoPhase] = useState<PhotoPhase>('none');
  const [photoFrame, setPhotoFrame] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const rafRef = useRef<number | null>(null);
  const lastStageRef = useRef(-1);
  const winnerCrossedRef = useRef(false);
  const milestonesRef = useRef(new Set<string>());
  const doneRef = useRef(false);
  const prevRankingsRef = useRef<Record<number, number>>({});
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finishedHorsesRef = useRef<Set<number>>(new Set());
  const lastFinishTimeRef = useRef<number>(0);
  const lastOvertakeTimeRef = useRef<number>(0);
  const lastLeaderRef = useRef<number | null>(null);
  const stableRankingsRef = useRef<Record<number, number>>({});
  const suctionStartTimeRef = useRef<number>(0);
  const isIntroTriggered = useRef(false);
  const lastLeadCommentTimeRef = useRef<number>(0);
  const lastCrowdCommentTimeRef = useRef<number>(0);
  // Refs to avoid stale closure inside useCallback loop
  const isStartedRef = useRef(false);
  const isFinishedRef = useRef(false);
  const photoPhaseRef = useRef<PhotoPhase>('none');
  const gateOpenTriggeredRef = useRef(false);
  const lastFrameTimeRef = useRef<number | null>(null);
  // raceStartTime はストアから直接読む。ローカル fallback は使わない（ズレの原因になる）

  const horsesRef = useRef(horses);
  const simRef = useRef(raceData?.simulation);
  // The race begins at the bottom of the oval (0, 800), moving to the right.
  // Start the camera there so the gate view and first race frame connect cleanly.
  const cameraRef = useRef({ x: 0, y: 800, zoom: 1.1 });

  useEffect(() => { horsesRef.current = horses; }, [horses]);
  useEffect(() => { simRef.current = raceData?.simulation; }, [raceData?.simulation]);
  useEffect(() => { photoPhaseRef.current = photoPhase; }, [photoPhase]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [commentary]);

  // ペースをシミュレーションデータから即座にセット（ステージ遷移待ちにしない）
  useEffect(() => {
    const p = raceData?.simulation?.pace;
    if (p) setPace(p);
  }, [raceData?.simulation?.pace]);

  if (!horses || horses.length === 0 || !raceData || !raceData.simulation) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0c100c] text-white">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-black tracking-widest animate-pulse uppercase">Race Data Loading...</p>
      </div>
    );
  }

  const addLog = useCallback((text: string, type?: string) => {
    setCommentary(p => [...p, { id: Date.now() + Math.random(), text, type }].slice(-50));
  }, []);

  const handleNext = useCallback(() => {
    peerManager.broadcast({ type: 'phase_start', phase: 'result' });
    useGameStore.getState().setPhase('result');
  }, []);

  const startPhotoReview = useCallback(() => {
    const sim = simRef.current;
    const plan = sim?.presentation?.photoFinish;
    if (!plan?.enabled || photoPhaseRef.current === 'review' || photoPhaseRef.current === 'reveal') return;

    photoPhaseRef.current = 'review';
    setPhotoPhase('review');
    setPhotoFrame(0);
    setTelop('全馬入線。1着・2着は写真判定です');
    addLog('📷 全馬入線。写真判定を開始します', 'photo');

    const frameCount = plan.frameCount || 7;
    const frameDelay = 320;
    for (let frame = 1; frame < frameCount; frame++) {
      photoTimersRef.current.push(setTimeout(() => setPhotoFrame(frame), 1000 + frame * frameDelay));
    }

    const revealAt = 1000 + frameCount * frameDelay + 650;
    photoTimersRef.current.push(setTimeout(() => {
      const winner = sim.results?.[0];
      photoPhaseRef.current = 'reveal';
      setPhotoPhase('reveal');
      setTelop(`こっちだ！ ${winner?.horse_number}番 ${winner?.horse_name}！`);
      addLog(`🏆 写真判定の結果、${winner?.horse_number}番 ${winner?.horse_name} が1着！`, 'finish');
    }, revealAt));

    photoTimersRef.current.push(setTimeout(() => {
      photoPhaseRef.current = 'complete';
      setPhotoPhase('complete');
      isFinishedRef.current = true;
      setIsFinished(true);
      if (useGameStore.getState().role === 'host') {
        nextTimerRef.current = setTimeout(handleNext, 1400);
      }
    }, revealAt + 1800));
  }, [addLog, handleNext]);

  const loop = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) { rafRef.current = requestAnimationFrame(loop); return; }

    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    // 全プレイヤーで共通の絶対時刻を基準にする。ローカル fallback は使わない
    const raceStart = useGameStore.getState().raceStartTime;
    if (!raceStart) { rafRef.current = requestAnimationFrame(loop); return; }
    const now = Date.now();
    const elapsed = now - raceStart;

    // Countdown logic
    if (elapsed < 0) {
      // MAX_COUNTDOWN でキャップ（接続が早かったゲストが大きな数字を見るのを防ぐ）
      const cd = Math.min(MAX_COUNTDOWN, Math.ceil(Math.abs(elapsed) / 1000));
      setCountdown(cd);

      // Trigger Intro Commentary when countdown reaches 3 or less
      if (cd <= 3 && !isIntroTriggered.current) {
        isIntroTriggered.current = true;
        const intro = CommentaryGenerator.generateIntro();
        intro.forEach(text => {
          setTelop(text);
          setTimeout(() => setTelop(prev => prev === text ? '' : prev), 3000);
        });
        addLog('🏁 まもなく発走します');
      }

      rafRef.current = requestAnimationFrame(loop);
      return;
    } else {
      if (countdown !== 0) setCountdown(0);
      if (!isStartedRef.current) {
        setIsStarted(true);
        isStartedRef.current = true;
        if (!gateOpenTriggeredRef.current) {
          gateOpenTriggeredRef.current = true;
          setGateOpening(true);
          photoTimersRef.current.push(setTimeout(() => setGateOpening(false), GATE_OPEN_DUR));
        }
      }
    }

    // 120s Timeout
    if (elapsed >= 120000 && !doneRef.current) {
      doneRef.current = true;
      isFinishedRef.current = true;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setIsFinished(true);
      setTelop('規定時間超過によりレース終了');
      addLog('⏳ 規定時間超過によりレース終了');

      if (useGameStore.getState().role === 'host') {
        nextTimerRef.current = setTimeout(() => {
          handleNext();
        }, 3000);
      }
      return;
    }

    // The first frame of the race must be the same position shown in the gate.
    // Do not let the hidden simulation advance while the doors are opening.
    const raceElapsed = Math.max(0, elapsed - GATE_OPEN_DUR);
    const totalDur = (sim.stages.length - 1) * STAGE_DUR + GOAL_STAGE_DUR;
    const done = raceElapsed >= totalDur;

    const isGoalStage = raceElapsed >= (sim.stages.length - 1) * STAGE_DUR;
    const stageIdx = isGoalStage ? sim.stages.length - 1 : Math.floor(raceElapsed / STAGE_DUR);

    let stageProg = 0;
    if (isGoalStage) {
      const stageElapsed = raceElapsed - (sim.stages.length - 1) * STAGE_DUR;
      stageProg = Math.min(1.0, stageElapsed / GOAL_STAGE_DUR);
    } else {
      stageProg = (raceElapsed % STAGE_DUR) / STAGE_DUR;
    }

    if (stageIdx !== lastStageRef.current) {
      lastStageRef.current = stageIdx;
      const info = sim.stages[stageIdx];

      if (stageIdx === 0) {
        if (sim.pace) addLog(`🏁 レース開始 (ペース: ${sim.pace})`);
      }

      // Generate rich commentary for Telop only
      const newLines = CommentaryGenerator.generate(stageIdx, sim, horsesRef.current, finishedHorsesRef.current, sessionHorseWins, lastWinnerHN);
      newLines.forEach((text, i) => {
        setTimeout(() => {
          setTelop(text);
          setTimeout(() => setTelop(prev => prev === text ? '' : prev), 3000);
        }, i * 1000);
      });

       // Add plain status logs for special events
       (info.events || []).forEach((ev: any) => {
         if (ev.type === 'bad_start')        addLog(`😱 ${ev.horse_name} が出遅れ`);
         if (ev.type === 'good_start')       addLog(`🚀 ${ev.horse_name} が好スタート！`);
         if (ev.type === 'hana_arasoi')      addLog(`🔥 ${ev.horse_name} がハナ争いに参加`);
         if (ev.type === 'interference')     addLog(`⚠️ ${ev.horse_name} に不利発生`);
         if (ev.type === 'breakthrough')     addLog(`💥 ${ev.horse_name} が前方を突破！`);
         if (ev.type === 'corner_boost')     addLog(`🌪️ ${ev.horse_name} のまくり！`);
         if (ev.type === 'last_spurt')       addLog(`💨 ${ev.horse_name} がラストスパート！`);
         if (ev.type === 'guts_display')     addLog(`🔥 ${ev.horse_name} が根性を見せる`);
         if (ev.type === 'wild_explosion')   addLog(`⚡ ${ev.horse_name} が爆発的加速！`);
         if (ev.type === 'wild_control_lost') addLog(`⚠️ ${ev.horse_name} が制御不能に`);
       });
    }

    const horsesInRace = horsesRef.current.map(h => {
      const hn = h.horse_number;
      const getProg = (idx: number) => {
        const p = sim.stages[idx]?.positions_progress;
        if (!p) return 0;
        return p[hn] ?? p[String(hn)] ?? 0;
      };
      const prev = stageIdx > 0 ? getProg(stageIdx - 1) : 0;
      const next = getProg(stageIdx);
      let prog = prev + (next - prev) * stageProg;

      // 一度ゴールした馬は、シミュレーターの進行度に関わらず1.0以上に固定する（逆走バグ防止）
      if (finishedHorsesRef.current.has(hn)) {
        prog = Math.max(1.0, prog);
      }

      return { hn, name: h.name, progress: prog }; // No Math.min(1.0) here to allow natural finish detection
    });

    // Detect Winner Crossing
    if (!winnerCrossedRef.current && horsesInRace.some(h => h.progress >= 1.0)) {
      winnerCrossedRef.current = true;
      const officialWinner = sim.results?.[0];
      const winner = horsesInRace.find(h => h.hn === officialWinner?.horse_number)
        ?? [...horsesInRace].sort((a, b) => b.progress - a.progress)[0];
      const photoPlan = sim.presentation?.photoFinish;

      if (photoPlan?.enabled) {
        photoPhaseRef.current = 'waiting';
        setPhotoPhase('waiting');
        setTelop('並んだ！ これは分からない、写真判定です！');
        addLog('📷 1着・2着は写真判定となります', 'photo');
      } else {
        const hData = horsesRef.current.find(h => h.horse_number === winner.hn);
        const finishLines = CommentaryGenerator.generateFinish(winner, hData?.popularity || 1);
        finishLines.forEach((text, i) => {
          setTimeout(() => {
            setTelop(text);
            setTimeout(() => setTelop(prev => prev === text ? '' : prev), 3000);
          }, i * 1000);
        });
        addLog(`🏆 1着：${winner.name} 入線`);
      }

      finishedHorsesRef.current.add(winner.hn);
      lastFinishTimeRef.current = Date.now();
    }

    // After 5 horses cross, gently boost remaining horses to approach their final sim progress
    if (finishedHorsesRef.current.size >= 5) {
      if (suctionStartTimeRef.current === 0) suctionStartTimeRef.current = now;
      const suctionDuration = now - suctionStartTimeRef.current;
      // 時間経過で補正割合を計算。6秒で必ず1.0（目標位置に到達）になるようにする。
      const factor = Math.pow(Math.min(1.0, suctionDuration / 6000), 1.5);

      const sim = simRef.current!;
      const finalStage = sim.stages[sim.stages.length - 1];
      horsesInRace.forEach(h => {
        if (!finishedHorsesRef.current.has(h.hn)) {
          // シミュレーター上の最終位置に関わらず、吸い込みの最終目標は1.0（ゴール）にする
          const simFinalProg = finalStage?.positions_progress?.[h.hn] ?? finalStage?.positions_progress?.[String(h.hn)] ?? h.progress;
          const targetProg = Math.max(1.0, simFinalProg);

          if (targetProg > h.progress) {
            h.progress = h.progress + (targetProg - h.progress) * factor;
          }
        }
      });
    }

    // Detect Subsequent Finishers with specific logic
    horsesInRace.forEach(h => {
      if (h.progress >= 0.9999 && !finishedHorsesRef.current.has(h.hn)) {
        const currentFinishCount = finishedHorsesRef.current.size;
        const nowTime = Date.now();
        const timeSinceLast = nowTime - lastFinishTimeRef.current;

        // Rule: Always mention Top 3. 4th+ only if gap >= 2s.
        const isPhotoContender = sim.presentation?.photoFinish?.contenderHorseNumbers?.includes(h.hn);
        if (!isPhotoContender && (currentFinishCount < 3 || timeSinceLast >= 2000)) {
          const rank = currentFinishCount + 1;
          const text = `🏁 ${rank}着：${h.name} 入線`;
          addLog(text, 'finish');
          setTelop(text);
          lastFinishTimeRef.current = nowTime;
        }
        finishedHorsesRef.current.add(h.hn);
      }
    });

    // Handle Finish Order Locking
    const sorted = [...horsesInRace].sort((a, b) => {
      if (a.progress >= 0.9999 && b.progress < 0.9999) return -1;
      if (a.progress < 0.9999 && b.progress >= 0.9999) return 1;

      if (a.progress >= 0.9999 && b.progress >= 0.9999 && sim.results) {
        const rankA = sim.results.findIndex((r: any) => r.horse_number === a.hn);
        const rankB = sim.results.findIndex((r: any) => r.horse_number === b.hn);
        return rankA - rankB;
      }

      return b.progress - a.progress;
    }).map((h, i) => ({ ...h, prevRank: prevRankingsRef.current[h.hn], confirmed: finishedHorsesRef.current.has(h.hn) }));



    setRankings(sorted);

    // Overtake & Leader Change Commentary Logic
    if (isStartedRef.current && !isFinishedRef.current) {
      const top5 = sorted.slice(0, 5);
      const leader = top5[0];

      // Initialize stable rankings if empty
      if (Object.keys(stableRankingsRef.current).length === 0) {
        sorted.forEach((h, i) => { stableRankingsRef.current[h.hn] = i + 1; });
      }

      // 1. Leader Change (Highest Priority)
      if (leader) {
        if (lastLeaderRef.current !== null && leader.hn !== lastLeaderRef.current) {
          const hData = horsesRef.current.find(h => h.horse_number === leader.hn);
          const text = CommentaryGenerator.pick('LEADER_CHANGE', { name: leader.name, jockey: hData?.jockey_name ?? '' });
          if (text) {
            setTelop(text);
            addLog(`🚩 ${leader.name} が先頭に立ちました`);
            lastLeaderRef.current = leader.hn;
            // Update all stable ranks to current
            sorted.forEach((h, i) => { stableRankingsRef.current[h.hn] = i + 1; });
            setTimeout(() => setTelop(prev => prev === text ? '' : prev), 3000);
          }
        } else if (lastLeaderRef.current === null) {
          // Initial leader set
          lastLeaderRef.current = leader.hn;
        }
      }

      // 2. General Overtake (Top 5, with separate debounce)
      const overtakeInterval = sorted[0]?.progress > 0.8 ? 1500 : 3000;
      if (now - lastOvertakeTimeRef.current > overtakeInterval) {
        let overtakeData: { overtaker: any, target: any } | null = null;

        for (const h of top5) {
          const stableRank = stableRankingsRef.current[h.hn] || 99;
          const currentRank = sorted.indexOf(h) + 1;

          if (currentRank < stableRank) {
            // Find who was at this rank in stable rankings
            const targetHn = Object.keys(stableRankingsRef.current).find(key => stableRankingsRef.current[Number(key)] === currentRank);
            if (targetHn && Number(targetHn) !== h.hn) {
              const target = sorted.find(sh => sh.hn === Number(targetHn));
              if (target) {
                overtakeData = { overtaker: h, target };
                break;
              }
            }
          }
        }

        if (overtakeData && overtakeData.overtaker.hn !== (leader?.hn || -1)) {
          const hData = horsesRef.current.find(h => h.horse_number === overtakeData!.overtaker.hn);
          const text = CommentaryGenerator.pick('OVERTAKE', { name: overtakeData.overtaker.name, jockey: hData?.jockey_name ?? '', target: overtakeData.target.name });
          if (text) {
            setTelop(text);
            addLog(`🔄 ${overtakeData.overtaker.name} が ${overtakeData.target.name} を追い越し ${sorted.indexOf(overtakeData.overtaker) + 1}番手に`);
            lastOvertakeTimeRef.current = now;
            // Update all stable ranks to current
            sorted.forEach((h, i) => { stableRankingsRef.current[h.hn] = i + 1; });
            setTimeout(() => setTelop(prev => prev === text ? '' : prev), 3000);
          }
        }
      }

      // 3. Lead Distance Commentary (Dynamic Interval)
      const leadInterval = sorted[0]?.progress > 0.8 ? 3000 : 6000;
      if (now - lastLeadCommentTimeRef.current > leadInterval && sorted.length >= 2) {
        const h1 = sorted[0];
        const h2 = sorted[1];
        const dist = h1.progress - h2.progress;

        let text = "";
        if (dist > 0.08) { // Large lead
          text = CommentaryGenerator.pick('LEAD_BIG', { name: h1.name });
        } else if (dist < 0.01 && h1.progress > 0.2) { // Very close
          text = CommentaryGenerator.pick('LEAD_CLOSE', { name: h1.name });
        }

        if (text) {
          setTelop(text);
          lastLeadCommentTimeRef.current = now;
          setTimeout(() => setTelop(prev => prev === text ? '' : prev), 3000);
        }
      }

      // 4. Random Crowd Roar (Low prob) - Telop only
      if (now - lastCrowdCommentTimeRef.current > 10000 && Math.random() < 0.005) {
        const text = CommentaryGenerator.pick('CROWD_ROAR');
        if (text) {
          setTelop(text);
          lastCrowdCommentTimeRef.current = now;
          setTimeout(() => setTelop(prev => prev === text ? '' : prev), 3000);
        }
      }
    }

    prevRankingsRef.current = sorted.reduce((acc, h, i) => ({ ...acc, [h.hn]: i + 1 }), {});

    // Trigger commentary based on leader's physical position
    const leader = sorted[0];
    if (leader) {
      const p = leader.progress;
      const m = milestonesRef.current;
      const trigger = (key: string, label: string) => {
        if (!m.has(key)) {
          m.add(key);
          const hData = horsesRef.current.find(h => h.horse_number === leader.hn);
          const text = CommentaryGenerator.pick(label, { name: leader.name, jockey: hData?.jockey_name ?? '' });
          if (text) {
            setTelop(text);
            if (label === 'MIDDLE') addLog('🔄 中間地点通過');
            if (label === 'FINAL_CORNER') addLog('🔄 最終コーナー進入');
            if (label === 'HOMESTRETCH') addLog('🔥 最後の直線');
          }
        }
      };
      if (p >= 0.4) trigger('m40', 'MIDDLE');
      if (p >= 0.6) trigger('m60', 'CORNER3');
      if (p >= 0.75) trigger('m75', 'FINAL_CORNER');
      if (p >= 0.9) trigger('m90', 'HOMESTRETCH');
      if (p >= 0.95) trigger('m95', 'WHIP');
    }

    const hPositions: any[] = [];
    const baseRX = 1400, baseRY = 800, trackWidth = 180;
    sorted.forEach((h, rank) => {
      const pos = getTrackPos(h.progress, baseRX, baseRY);
      const laneOffset = (rank / Math.max(1, horsesRef.current.length - 1) - 0.5) * trackWidth * 0.8;
      const nx = Math.cos(pos.angle), ny = Math.sin(pos.angle);
      hPositions.push({ hn: h.hn, x: pos.x + nx * laneOffset, y: pos.y + ny * laneOffset, progress: h.progress, rank: rank + 1, name: h.name });
    });

    const leaderProgress = sorted[0]?.progress ?? 0;
    const focusCount = leaderProgress > 0.84 ? 3 : 5;
    const topPack = hPositions.slice(0, Math.min(focusCount, hPositions.length));
    const avgX = topPack.reduce((s, h) => s + h.x, 0) / topPack.length;
    const avgY = topPack.reduce((s, h) => s + h.y, 0) / topPack.length;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    topPack.forEach(h => { minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x); minY = Math.min(minY, h.y); maxY = Math.max(maxY, h.y); });
    const spread = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
    const targetZoom = Math.min(1.2, Math.max(0.4, 1800 / (spread + 800)));

    const dt = Math.min(0.05, Math.max(0.001, lastFrameTimeRef.current === null ? 1 / 60 : (time - lastFrameTimeRef.current) / 1000));
    lastFrameTimeRef.current = time;
    const positionAlpha = 1 - Math.exp(-5.0 * dt);
    const zoomAlpha = 1 - Math.exp(-2.5 * dt);
    cameraRef.current.x = lerp(cameraRef.current.x, avgX, positionAlpha);
    cameraRef.current.y = lerp(cameraRef.current.y, avgY, positionAlpha);
    cameraRef.current.zoom = lerp(cameraRef.current.zoom, targetZoom, zoomAlpha);

    ctx.save();
    const fc = raceData?.field_condition || '良';
    let grassColor = '#1a2e1a'; let dirtColor = '#c1a173';
    if (fc === '良') { grassColor = '#1a3a1a'; dirtColor = '#d2b48c'; }
    if (fc === '重') { grassColor = '#152515'; dirtColor = '#a68a62'; }
    if (fc === '不良') { grassColor = '#1a1d15'; dirtColor = '#8b7355'; }

    ctx.fillStyle = '#0f140f'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);
    ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

    ctx.beginPath(); ctx.ellipse(0, 0, baseRX + trackWidth, baseRY + trackWidth, 0, 0, Math.PI * 2); ctx.fillStyle = grassColor; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, baseRX + trackWidth, baseRY + trackWidth, 0, 0, Math.PI * 2); ctx.ellipse(0, 0, baseRX - trackWidth, baseRY - trackWidth, 0, 0, Math.PI * 2); ctx.fillStyle = dirtColor; ctx.fill('evenodd');
    ctx.beginPath(); ctx.ellipse(0, 0, baseRX - trackWidth, baseRY - trackWidth, 0, 0, Math.PI * 2); ctx.fillStyle = grassColor; ctx.fill();
    ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, baseRX + trackWidth, baseRY + trackWidth, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, baseRX - trackWidth, baseRY - trackWidth, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-100, baseRY); ctx.lineTo(100, baseRY); ctx.stroke();

    hPositions.forEach(hp => {
      const color = HORSE_COLORS[hp.hn - 1] || '#888';
      const isLeader = hp.rank === 1;
      const bob = Math.sin(time * 0.02 + hp.hn) * 2;
      if (!done) {
        ctx.fillStyle = 'rgba(193, 161, 115, 0.4)';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(hp.x + (Math.random() - 0.5) * 20, hp.y + 15 + (Math.random() - 0.5) * 10, Math.random() * 8, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.save();
      ctx.translate(hp.x, hp.y + bob);

      let drawProg = hp.progress;
      if (drawProg > 1.0) {
        const over = drawProg - 1.0;
        drawProg = 1.0 + 0.03 * (1 - Math.exp(-over / 0.03));
      }

      const { angle } = getTrackPos(drawProg, baseRX, baseRY);
      ctx.save(); ctx.rotate(angle - Math.PI / 2);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(0, -18); ctx.lineTo(6, -10); ctx.fill();
      ctx.restore();
      if (isLeader) { ctx.shadowBlur = 20; ctx.shadowColor = color; }
      ctx.beginPath(); ctx.arc(0, 0, isLeader ? 18 : 14, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${isLeader ? 14 : 11}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(hp.hn), 0, 0);
      if (isLeader || hp.rank <= 3) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000';
        ctx.textAlign = 'center';
        const nameText = hp.progress >= 1.0 ? `🚩 ${hp.name}` : hp.name;
        ctx.fillText(nameText, 0, -35);
      }
      ctx.restore();
    });

    ctx.restore();
    const allFinished = horsesInRace.every(h => h.progress >= 0.999);
    if (allFinished && !doneRef.current) {
      doneRef.current = true;

      if (sim.presentation?.photoFinish?.enabled) {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        startPhotoReview();
        return;
      }

      setTimeout(() => {
        isFinishedRef.current = true;
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setIsFinished(true);

        if (useGameStore.getState().role === 'host') {
          nextTimerRef.current = setTimeout(() => {
            handleNext();
          }, 500);
        }
      }, 500);

      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [addLog, handleNext, raceData?.field_condition, startPhotoReview]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
      photoTimersRef.current.forEach(clearTimeout);
      photoTimersRef.current = [];
    };
  }, [loop]);

  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current; if (!c || !c.parentElement) return;
      c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight;
    };
    window.addEventListener('resize', resize); resize();
    return () => window.removeEventListener('resize', resize);
  }, []);


  const currentDist = useMemo(() => {
    const totalDist = raceData?.distance || 1000;
    if (!rankings.length) return totalDist;
    return Math.max(0, Math.round(totalDist * (1 - rankings[0].progress)));
  }, [rankings, raceData?.distance]);

  const photoPlan = raceData?.simulation?.presentation?.photoFinish;
  const photoPending = !!photoPlan?.enabled && ['waiting', 'review'].includes(photoPhase);
  const contenderSet = new Set<number>(photoPlan?.contenderHorseNumbers || []);
  const displayedRankings = photoPending
    ? [...rankings].sort((a, b) => {
        const aContender = contenderSet.has(a.hn);
        const bContender = contenderSet.has(b.hn);
        if (aContender && bContender) return a.hn - b.hn;
        if (aContender) return -1;
        if (bContender) return 1;
        return b.progress - a.progress;
      })
    : rankings;
  const photoResults = (raceData?.simulation?.results || []).slice(0, 2);
  const photoFrameCount = photoPlan?.frameCount || 7;
  const photoT = photoFrameCount <= 1 ? 1 : photoFrame / (photoFrameCount - 1);

  return (
    <div className="h-screen flex flex-col bg-[#0c100c] text-white overflow-hidden relative font-sans">
      <header className="absolute top-0 left-0 right-0 z-20 h-14 px-6 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-6">
          <div className="bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-lg border border-white/10">
            <div className="text-[10px] text-gray-300 uppercase tracking-widest font-black leading-none mb-1 drop-shadow-md">残り距離</div>
            <div className="font-mono text-2xl font-black text-yellow-300 tabular leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{currentDist}<span className="text-sm ml-1">m</span></div>
          </div>
          {pace && (
            <div className="bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-lg border border-white/10">
              <div className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-1">ペース</div>
              <div className={`text-lg font-black leading-none ${pace === 'ハイペース' ? 'text-red-500' : pace === 'スローペース' ? 'text-blue-400' : 'text-emerald-400'}`}>{pace}</div>
            </div>
          )}
        </div>
        <div className="pointer-events-auto">
          {isFinished && role === 'host' && (
            <button onClick={handleNext} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-black text-sm tracking-widest transition-all shadow-xl shadow-indigo-500/20 animate-fade-in uppercase">結果発表へ →</button>
          )}
        </div>
      </header>

      <div className="flex-1 relative flex overflow-hidden">
        {/* Race Track */}
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="w-full h-full" />

          {/* Commentary Telop */}
          {telop && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-fit max-w-[90%] z-40 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl py-4 px-8 shadow-2xl animate-message-in">
                <p className="text-xl md:text-2xl font-black text-white text-center drop-shadow-md italic tracking-tight leading-tight whitespace-nowrap">
                  {telop}
                </p>
              </div>
            </div>
          )}

          {(countdown > 0 || gateOpening) && (
            <div className="absolute inset-0 z-30 overflow-hidden bg-[#1a3a1a]">
              {/* Top-down start area: same viewpoint and direction as the race canvas. */}
              <div className="absolute inset-x-0 top-[12%] bottom-[12%] bg-[#b39a73] border-y-4 border-white/25" />
              <div className="absolute top-[12%] bottom-[12%] left-1/2 w-1 bg-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" />
              <div className="absolute top-[12%] bottom-[12%] left-1/2 border-l border-dashed border-black/45" />
              <div className="absolute top-5 right-6 min-w-24 rounded-xl bg-black/65 border border-white/15 px-5 py-3 text-center">
                <div className="text-[10px] text-gray-300 font-black tracking-[0.25em]">START</div>
                <div className="text-5xl leading-none font-black text-yellow-400 tabular-nums">{Math.max(0, countdown)}</div>
              </div>
              <div className="absolute left-[44%] top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="flex flex-col border-4 border-[#c9d0cc] bg-[#39443f] shadow-2xl">
                  {horses.slice(0, 18).map((horse, index) => (
                    <div key={horse.horse_number} className="relative w-24 h-9 border-b border-white/20 last:border-b-0 flex items-center justify-center">
                      <div className="absolute left-1 inset-y-1 w-5 bg-[#212a26] text-[9px] text-white/70 font-black flex items-center justify-center">{index + 1}</div>
                      <div className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[11px] text-white font-black transition-transform duration-700 ease-out ${gateOpening ? 'translate-x-16' : ''}`} style={{ background: HORSE_COLORS[horse.horse_number - 1] || '#777' }}>
                        {horse.horse_number}
                      </div>
                      <div className={`absolute right-0 top-0 h-1/2 w-2 bg-[#83908a] border-b border-white/30 origin-top transition-transform duration-500 ${gateOpening ? '-rotate-90' : ''}`} />
                      <div className={`absolute right-0 bottom-0 h-1/2 w-2 bg-[#83908a] border-t border-white/30 origin-bottom transition-transform duration-500 ${gateOpening ? 'rotate-90' : ''}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute left-6 top-7 text-left">
                <div className="text-sm md:text-lg text-white font-black tracking-[0.35em] drop-shadow-lg">
                  {gateOpening ? 'スタート！' : countdown <= 2 ? 'FANFARE' : '各馬ゲートイン'}
                </div>
                <div className="mt-2 text-[11px] text-white/70 font-bold">
                  {gateOpening ? 'ゲートが開きました' : countdown <= 2 ? 'まもなく発走します' : '発走準備が進んでいます'}
                </div>
              </div>
            </div>
          )}

          {photoPlan?.enabled && ['waiting', 'review', 'reveal'].includes(photoPhase) && (
            <div className="absolute inset-0 z-50 bg-[#111514]/90 flex items-center justify-center p-6">
              <div className="w-full max-w-3xl">
                <div className="text-center mb-5">
                  <div className="text-[11px] tracking-[0.4em] text-gray-400 font-black">PHOTO FINISH</div>
                  <div className="mt-2 text-2xl md:text-3xl text-white font-black">
                    {photoPhase === 'waiting' ? '1着・2着 写真判定中' : photoPhase === 'review' ? `判定映像 ${photoFrame + 1}/${photoFrameCount}` : '判定結果'}
                  </div>
                </div>
                <div className="relative h-56 bg-[#b39a73] border-y-4 border-white/30 overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-[68%] w-1 bg-white" />
                  <div className="absolute top-2 bottom-2 left-[68%] border-l border-dashed border-black/50" />
                  {photoResults.map((result: any, index: number) => {
                    const gapPixels = Math.min(18, Math.max(3, Number(photoPlan.rawGapSeconds || 0.05) * 45));
                    const finishX = 68 + (index === 0 ? 2 : 2 - gapPixels / 10);
                    const x = 18 + (finishX - 18) * (photoPhase === 'waiting' ? 0.15 : photoT);
                    return (
                      <div key={result.horse_number} className="absolute flex items-center gap-3 transition-none" style={{ left: `${x}%`, top: index === 0 ? '28%' : '62%', transform: 'translate(-50%, -50%)' }}>
                        <div className="w-10 h-10 rounded-full border-3 border-white flex items-center justify-center text-white font-black" style={{ background: HORSE_COLORS[result.horse_number - 1] || '#777' }}>{result.horse_number}</div>
                        <div className="whitespace-nowrap bg-black/60 px-3 py-1 rounded text-xs text-white font-bold">{result.horse_name}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 text-center text-sm text-gray-300 font-bold">
                  {photoPhase === 'waiting' ? '全馬の入線を待っています' : photoPhase === 'review' ? 'ゴール直前を一コマずつ確認しています' : `こっちだ！ ${photoResults[0]?.horse_number}番 ${photoResults[0]?.horse_name}！`}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Animated Ranking Sidebar */}
        <aside className="w-64 bg-black/20 backdrop-blur-md border-l border-white/5 relative overflow-hidden flex flex-col">
          <div className="p-4 bg-white/5 border-b border-white/10">
            <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest opacity-50">Real-time Ranking</div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {displayedRankings.map((r, i) => {
              const currentRank = i + 1;
              const isOvertaking = r.prevRank !== undefined && currentRank < r.prevRank;
              const isConfirmed = r.confirmed;
              return (
                <div
                  key={r.hn}
                  className={`absolute left-0 right-0 px-4 transition-all duration-700 ease-[cubic-bezier(0.22,1.61,0.36,1)] ${isOvertaking ? 'z-10' : 'z-0'}`}
                  style={{ top: i * 44 + 12, height: 40 }}
                >
                  <div className={`flex items-center gap-3 h-full rounded-lg px-2 border transition-all duration-500 shadow-lg ${isConfirmed ? 'bg-yellow-900/50 border-yellow-500/60 shadow-[0_0_12px_rgba(234,179,8,0.3)]' :
                    isOvertaking ? 'bg-indigo-500 border-white scale-[1.12] shadow-[0_0_30px_rgba(99,102,241,0.8)] brightness-125' :
                      'bg-black/60 border-white/10'
                    }`}>
                    <span className={`w-4 font-mono font-black text-xs text-center ${i < 3 ? 'text-yellow-400' : 'text-gray-300'}`}>{photoPending && contenderSet.has(r.hn) ? '?' : i + 1}</span>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-xl border border-white/20" style={{ background: HORSE_COLORS[r.hn - 1], boxShadow: isOvertaking ? `0 0 20px ${HORSE_COLORS[r.hn - 1]}` : '' }}>{r.hn}</div>
                    <span className="flex-1 font-black text-xs truncate text-white drop-shadow-sm">{r.name}</span>
                    {photoPending && contenderSet.has(r.hn)
                      ? <div className="text-[9px] font-mono text-amber-300 font-black">判定待ち</div>
                      : isConfirmed
                      ? <div className="text-[9px] font-mono text-yellow-400 font-black">確定</div>
                      : <div className="text-[9px] font-mono text-gray-200 font-bold">{(r.progress * 100).toFixed(0)}%</div>
                    }
                  </div>
                </div>
              );
            })}
          </div>
          {/* Bottom Live Feed */}
          <div className="h-32 p-3 bg-black/60 border-t border-white/10 overflow-y-auto text-[10px] space-y-2 font-bold no-scrollbar select-none scroll-smooth">
            {commentary.map(c => (
              <div key={c.id} className="animate-fade-in flex items-start gap-2 drop-shadow-sm">
                <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${c.type === 'finish' ? 'bg-yellow-400 shadow-[0_0_8px_#fbbf24]' : 'bg-indigo-400 shadow-[0_0_4px_#818cf8]'}`} />
                <span className={`leading-relaxed ${c.type === 'finish' ? 'text-yellow-400' : 'text-gray-300'}`}>{c.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </aside>
      </div>

      {isFinished && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-[2px] animate-fade-in pointer-events-none">
          <div className="bg-black/80 border border-yellow-500/50 p-8 rounded-[40px] text-center shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-pop-in">
            <div className="text-yellow-500 font-black text-6xl tracking-widest italic mb-4">FINISH!</div>
            <div className="flex items-center justify-center gap-4">
              <span className="text-5xl">🥇</span>
              <div className="text-left"><div className="text-gray-500 text-xs uppercase tracking-widest font-bold">1st Place</div><div className="text-4xl font-black text-white">{rankings[0]?.name}</div></div>
            </div>
            {useGameStore.getState().role === 'guest' && (
              <div className="mt-8 text-[11px] text-gray-400 font-black tracking-[0.2em] animate-pulse">
                ホストが結果発表へ進むまでお待ちください...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
