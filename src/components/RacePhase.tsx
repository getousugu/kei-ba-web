import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { peerManager } from '../network/peerManager';
import { CommentaryGenerator } from '../core/commentary_generator';
import { HORSE_COLORS } from '../core/constants';
import { initialCamera, renderRaceFrame } from '../race-renderer-v2/renderer';
import type { CameraMode, MockFrame, RenderHorse, RunnerStyle } from '../race-renderer-v2/model';

const STAGE_DUR = 2500;  // Time per simulation stage (ms)
const MAX_COUNTDOWN = 5; // カウントダウン上限 (= raceStartTime バッファと揃える)
const GATE_OPEN_DUR = 750; // Keep race progress at zero until the gate transition is complete
const GOAL_STAGE_DUR = 5000; // Extra time for the final stretch
const FOCUS_COLORS = ['#ffd44a', '#38d9ff', '#ff62c7'];
type PhotoPhase = 'none' | 'waiting' | 'review' | 'reveal' | 'complete';
type FinishSnapshot = {
  at: number;
  horses: RenderHorse[];
  camera: { x: number; y: number; zoom: number };
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function toRenderHorses(
  raceHorses: { hn: number; name: string; progress: number }[],
  roster: any[],
): RenderHorse[] {
  return raceHorses.map((horse, rank) => {
    const rosterIndex = Math.max(0, roster.findIndex(item => item.horse_number === horse.hn));
    const gateLane = rosterIndex - (roster.length - 1) / 2;
    // Keep the gate order recognizable after the break. The previous number
    // hash sent 1 and 12 to the same lane and collapsed the field too quickly.
    const laneVariation = (((horse.hn * 7) % 9) - 4) * 0.045;
    const runningLane = gateLane * 0.38 + laneVariation;
    const launchBlend = Math.max(0, Math.min(1, (horse.progress - 0.01) / 0.16));
    const smoothLaunch = launchBlend * launchBlend * (3 - 2 * launchBlend);
    const laneDrift = Math.sin(horse.progress * Math.PI * 4 + horse.hn * 0.91) * 0.12 * Math.min(1, horse.progress / 0.2);
    return {
      number: horse.hn,
      name: horse.name,
      color: HORSE_COLORS[horse.hn - 1] || '#888',
      progress: horse.progress,
      lane: lerp(gateLane, runningLane, smoothLaunch) + laneDrift,
      rank: rank + 1,
      energy: Math.max(0.05, 1 - Math.min(1, horse.progress) * 0.65),
    };
  });
}

function createRaceRenderFrame({
  time,
  phase,
  renderHorses,
  gateOpen,
  pace,
  distance,
  trackCondition,
  officialOrder,
  photoFrame,
  photoFrameCount,
}: {
  time: number;
  phase: MockFrame['phase'];
  renderHorses: RenderHorse[];
  gateOpen: number;
  pace: string;
  distance: number;
  trackCondition?: string;
  officialOrder: number[];
  photoFrame: number;
  photoFrameCount: number;
}): MockFrame {
  const leader = [...renderHorses].sort((a, b) => a.rank - b.rank)[0];
  return {
    time,
    displayTime: time,
    phase,
    phaseLabel: phase === 'gate' ? '発走準備' : phase === 'opening' ? 'スタート' : phase === 'final' ? '最後の直線' : phase.startsWith('photo_') ? '写真判定' : 'レース中',
    commentary: '',
    gateOpen,
    horses: renderHorses,
    remaining: Math.max(0, Math.round(distance * (1 - Math.min(1, leader?.progress || 0)))),
    pace,
    photoFrame,
    photoFrameCount,
    officialOrderReady: phase !== 'photo_wait',
    officialOrder,
    trackCondition,
  };
}

interface RacePhaseProps {
  horses?: any[];
  raceData?: any;
  raceStartTime?: number;
  onComplete?: () => void;
}

export default function RacePhase(props: RacePhaseProps = {}) {
  const game = useGameStore();
  const centralPlayback = !!props.raceData;
  const horses = props.horses ?? game.horses;
  const raceData = props.raceData ?? game.raceData;
  const role = centralPlayback ? 'host' : game.role;
  const sessionHorseWins = centralPlayback ? {} : game.sessionHorseWins;
  const lastWinnerHN = centralPlayback ? null : game.lastWinnerHN;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [countdown, setCountdown] = useState(3);
  const [isFinished, setIsFinished] = useState(false);
  const [commentary, setCommentary] = useState<{ id: number; text: string; type?: string }[]>([]);
  const [telop, setTelop] = useState<string>('');
  const [rankings, setRankings] = useState<{ hn: number; name: string; progress: number; prevRank?: number; confirmed?: boolean }[]>([]);
  const [pace, setPace] = useState<string>(raceData?.simulation?.pace || '');
  const [gateOpening, setGateOpening] = useState(false);
  const [photoPhase, setPhotoPhase] = useState<PhotoPhase>('none');
  const [photoFrame, setPhotoFrame] = useState(0);
  const [runnerStyle, setRunnerStyle] = useState<RunnerStyle>(() => window.localStorage.getItem('race-renderer-style') === 'marker' ? 'marker' : 'horse');
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto');
  const [selectedHorses, setSelectedHorses] = useState<number[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const commentaryIdRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const loopRef = useRef<(time: number) => void>(() => undefined);
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
  const photoFrameRef = useRef(0);
  const gateOpenTriggeredRef = useRef(false);
  const runnerStyleRef = useRef<RunnerStyle>(runnerStyle);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const selectedHorsesRef = useRef<number[]>(selectedHorses);
  const finishFrameBufferRef = useRef<FinishSnapshot[]>([]);
  const photoReviewFramesRef = useRef<FinishSnapshot[]>([]);
  const winnerCrossedAtRef = useRef<number | null>(null);
  const finishFramesLockedRef = useRef(false);
  // raceStartTime はストアから直接読む。ローカル fallback は使わない（ズレの原因になる）

  const horsesRef = useRef(horses);
  const simRef = useRef(raceData?.simulation);
  const cameraRef = useRef(initialCamera());

  useEffect(() => { horsesRef.current = horses; }, [horses]);
  useEffect(() => { simRef.current = raceData?.simulation; }, [raceData?.simulation]);
  useEffect(() => { photoPhaseRef.current = photoPhase; }, [photoPhase]);
  useEffect(() => { photoFrameRef.current = photoFrame; }, [photoFrame]);
  useEffect(() => { runnerStyleRef.current = runnerStyle; window.localStorage.setItem('race-renderer-style', runnerStyle); }, [runnerStyle]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => { selectedHorsesRef.current = selectedHorses; }, [selectedHorses]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [commentary]);

  const addLog = useCallback((text: string, type?: string) => {
    commentaryIdRef.current += 1;
    const id = Date.now() * 1000 + commentaryIdRef.current;
    setCommentary(p => [...p, { id, text, type }].slice(-50));
  }, []);

  const handleNext = useCallback(() => {
    if (centralPlayback) {
      props.onComplete?.();
      return;
    }
    peerManager.broadcast({ type: 'phase_start', phase: 'result' });
    useGameStore.getState().setPhase('result');
  }, [centralPlayback, props.onComplete]);

  const toggleSelectedHorse = useCallback((horseNumber: number) => {
    setSelectedHorses(current => {
      if (current.includes(horseNumber)) return current.filter(number => number !== horseNumber);
      return current.length < 3 ? [...current, horseNumber] : [...current.slice(1), horseNumber];
    });
  }, []);

  const startPhotoReview = useCallback(() => {
    const sim = simRef.current;
    const plan = sim?.presentation?.photoFinish;
    if (!plan?.enabled || photoPhaseRef.current === 'review' || photoPhaseRef.current === 'reveal') return;

    photoPhaseRef.current = 'review';
    setPhotoPhase('review');
    photoFrameRef.current = 0;
    setPhotoFrame(0);
    setTelop('全馬入線。1着・2着は写真判定です');
    addLog('📷 全馬入線。写真判定を開始します', 'photo');

    const frameCount = plan.frameCount || 7;
    const frameDelay = 320;
    for (let frame = 1; frame < frameCount; frame++) {
      photoTimersRef.current.push(setTimeout(() => {
        photoFrameRef.current = frame;
        setPhotoFrame(frame);
      }, 1000 + frame * frameDelay));
    }

    const revealAt = 1000 + frameCount * frameDelay + 650;
    photoTimersRef.current.push(setTimeout(() => {
      const winner = sim.results?.[0];
      photoPhaseRef.current = 'reveal';
      setPhotoPhase('reveal');
      photoFrameRef.current = frameCount - 1;
      setPhotoFrame(frameCount - 1);
      setTelop(`こっちだ！ ${winner?.horse_number}番 ${winner?.horse_name}！`);
      addLog(`🏆 写真判定の結果、${winner?.horse_number}番 ${winner?.horse_name} が1着！`, 'finish');
    }, revealAt));

    photoTimersRef.current.push(setTimeout(() => {
      photoPhaseRef.current = 'complete';
      setPhotoPhase('complete');
      isFinishedRef.current = true;
      setIsFinished(true);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (centralPlayback || useGameStore.getState().role === 'host') {
        nextTimerRef.current = setTimeout(handleNext, 1400);
      }
    }, revealAt + 1800));
  }, [addLog, centralPlayback, handleNext]);

  const loop = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) { rafRef.current = requestAnimationFrame(loopRef.current); return; }

    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    // 全プレイヤーで共通の絶対時刻を基準にする。ローカル fallback は使わない
    const raceStart = props.raceStartTime ?? useGameStore.getState().raceStartTime;
    if (!raceStart) { rafRef.current = requestAnimationFrame(loopRef.current); return; }
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

      const gateHorses = toRenderHorses(
        horsesRef.current.map(horse => ({ hn: horse.horse_number, name: horse.name, progress: 0 })),
        horsesRef.current,
      );
      const gateFrame = createRaceRenderFrame({
        time: elapsed / 1000,
        phase: 'gate',
        renderHorses: gateHorses,
        gateOpen: 0,
        pace: sim.pace || '',
        distance: raceData?.distance || 1000,
        trackCondition: raceData?.field_condition,
        officialOrder: sim.results?.map((result: any) => result.horse_number) || [],
        photoFrame: 0,
        photoFrameCount: sim.presentation?.photoFinish?.frameCount || 7,
      });
      renderRaceFrame(ctx, W, H, gateFrame, cameraModeRef.current, cameraRef.current, selectedHorsesRef.current, runnerStyleRef.current, time);
      rafRef.current = requestAnimationFrame(loopRef.current);
      return;
    } else {
      setCountdown(0);
      if (!isStartedRef.current) {
        isStartedRef.current = true;
        if (!gateOpenTriggeredRef.current) {
          gateOpenTriggeredRef.current = true;
          setGateOpening(true);
          photoTimersRef.current.push(setTimeout(() => setGateOpening(false), GATE_OPEN_DUR));
        }
      }
    }

    if (elapsed < GATE_OPEN_DUR) {
      const gateHorses = toRenderHorses(
        horsesRef.current.map(horse => ({ hn: horse.horse_number, name: horse.name, progress: 0 })),
        horsesRef.current,
      );
      const openingFrame = createRaceRenderFrame({
        time: elapsed / 1000,
        phase: 'opening',
        renderHorses: gateHorses,
        gateOpen: Math.min(1, elapsed / GATE_OPEN_DUR),
        pace: sim.pace || '',
        distance: raceData?.distance || 1000,
        trackCondition: raceData?.field_condition,
        officialOrder: sim.results?.map((result: any) => result.horse_number) || [],
        photoFrame: 0,
        photoFrameCount: sim.presentation?.photoFinish?.frameCount || 7,
      });
      renderRaceFrame(ctx, W, H, openingFrame, cameraModeRef.current, cameraRef.current, selectedHorsesRef.current, runnerStyleRef.current, time);
      rafRef.current = requestAnimationFrame(loopRef.current);
      return;
    }

    // 120s Timeout
    if (elapsed >= 120000 && !doneRef.current) {
      doneRef.current = true;
      isFinishedRef.current = true;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setIsFinished(true);
      setTelop('規定時間超過によりレース終了');
      addLog('⏳ 規定時間超過によりレース終了');

      if (centralPlayback || useGameStore.getState().role === 'host') {
        nextTimerRef.current = setTimeout(() => {
          handleNext();
        }, 3000);
      }
      return;
    }

    // The first frame of the race must be the same position shown in the gate.
    // Do not let the hidden simulation advance while the doors are opening.
    const raceElapsed = Math.max(0, elapsed - GATE_OPEN_DUR);
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
        if (sim.pace) setPace(sim.pace);
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
      const dramaMoment = sim.presentation?.dramaMoments?.find((moment: any) => moment.stageIndex === stageIdx);
      if (dramaMoment) {
        const dramaText = CommentaryGenerator.pick(dramaMoment.commentaryKey, {
          name: dramaMoment.horseNames?.[0] || '一頭',
        });
        if (dramaText) {
          const delay = Math.min(2200, newLines.length * 900);
          setTimeout(() => {
            setTelop(dramaText);
            setTimeout(() => setTelop(prev => prev === dramaText ? '' : prev), 3000);
          }, delay);
          addLog(`🎬 ${dramaMoment.label}`);
        }
      }

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
        const raw = p[hn] ?? p[String(hn)] ?? 0;
        const displayOffset = sim.presentation?.visualOffsets?.[idx]?.[hn]
          ?? sim.presentation?.visualOffsets?.[idx]?.[String(hn)]
          ?? 0;
        return raw + displayOffset;
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
      winnerCrossedAtRef.current = now;
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
        const finishLines = CommentaryGenerator.generateFinish(
          winner,
          hData?.popularity || 1,
          Number(sim.results?.[1]?.raw_gap_seconds ?? 999),
        );
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
    }).map(h => ({ ...h, prevRank: prevRankingsRef.current[h.hn], confirmed: finishedHorsesRef.current.has(h.hn) }));



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

    const liveRenderHorses = toRenderHorses(sorted, horsesRef.current);
    const lastRecorded = finishFrameBufferRef.current.at(-1)?.at || 0;
    if (!finishFramesLockedRef.current && (sorted[0]?.progress || 0) >= 0.94 && now - lastRecorded >= 55) {
      finishFrameBufferRef.current.push({
        at: now,
        horses: liveRenderHorses.map(horse => ({ ...horse })),
        camera: { ...cameraRef.current },
      });
      finishFrameBufferRef.current = finishFrameBufferRef.current.filter(snapshot => now - snapshot.at <= 1800);
    }
    if (winnerCrossedAtRef.current && now - winnerCrossedAtRef.current > 550) {
      finishFramesLockedRef.current = true;
    }

    const reviewSnapshot = photoReviewFramesRef.current[Math.min(photoFrameRef.current, Math.max(0, photoReviewFramesRef.current.length - 1))];
    const isReviewing = ['review', 'reveal', 'complete'].includes(photoPhaseRef.current) && !!reviewSnapshot;
    if (isReviewing) Object.assign(cameraRef.current, reviewSnapshot.camera);
    const renderHorses = isReviewing ? reviewSnapshot.horses : liveRenderHorses;
    const renderPhase: MockFrame['phase'] = photoPhaseRef.current === 'waiting'
      ? 'photo_wait'
      : photoPhaseRef.current === 'review'
        ? 'photo_review'
        : ['reveal', 'complete'].includes(photoPhaseRef.current)
          ? 'photo_result'
          : (sorted[0]?.progress || 0) >= 0.82 ? 'final' : 'race';
    const renderFrame = createRaceRenderFrame({
      time: raceElapsed / 1000,
      phase: renderPhase,
      renderHorses,
      gateOpen: 1,
      pace: sim.pace || '',
      distance: raceData?.distance || 1000,
      trackCondition: raceData?.field_condition,
      officialOrder: sim.results?.map((result: any) => result.horse_number) || [],
      photoFrame: photoFrameRef.current,
      photoFrameCount: sim.presentation?.photoFinish?.frameCount || 7,
    });
    renderRaceFrame(ctx, W, H, renderFrame, cameraModeRef.current, cameraRef.current, selectedHorsesRef.current, runnerStyleRef.current, time);

    const allFinished = horsesInRace.every(h => h.progress >= 0.999);
    if (allFinished && !doneRef.current) {
      doneRef.current = true;

      if (sim.presentation?.photoFinish?.enabled) {
        const frameCount = sim.presentation.photoFinish.frameCount || 7;
        const center = winnerCrossedAtRef.current || now;
        const buffer = finishFrameBufferRef.current;
        const nearFinish = buffer.filter(snapshot => Math.abs(snapshot.at - center) <= 480);
        const source = nearFinish.length >= 2 ? nearFinish : buffer;
        if (source.length) {
          photoReviewFramesRef.current = Array.from({ length: frameCount }, (_, index) => {
            const sourceIndex = frameCount <= 1 ? source.length - 1 : Math.round(index * (source.length - 1) / (frameCount - 1));
            const snapshot = source[Math.max(0, sourceIndex)];
            return {
              at: snapshot.at,
              horses: snapshot.horses.map(horse => ({ ...horse })),
              camera: { ...snapshot.camera },
            };
          });
        }
        startPhotoReview();
        rafRef.current = requestAnimationFrame(loopRef.current);
        return;
      }

      setTimeout(() => {
        isFinishedRef.current = true;
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setIsFinished(true);

        if (centralPlayback || useGameStore.getState().role === 'host') {
          nextTimerRef.current = setTimeout(() => {
            handleNext();
          }, 500);
        }
      }, 500);

      return;
    }
    rafRef.current = requestAnimationFrame(loopRef.current);
  }, [addLog, centralPlayback, handleNext, lastWinnerHN, props.raceStartTime, raceData?.distance, raceData?.field_condition, sessionHorseWins, startPhotoReview]);

  useEffect(() => {
    loopRef.current = loop;
    rafRef.current = requestAnimationFrame(loopRef.current);
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

  // Keep every hook above this guard. Guests can briefly enter the race phase
  // before the atomic race payload is available; returning earlier changed the
  // hook count between renders and could break the gate screen entirely.
  if (!horses || horses.length === 0 || !raceData || !raceData.simulation) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0c100c] text-white">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-black tracking-widest animate-pulse uppercase">Race Data Loading...</p>
      </div>
    );
  }

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
  const photoFrameCount = photoPlan?.frameCount || 7;

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

          <div className={`absolute top-4 z-40 flex flex-col items-end gap-2 transition-[right] ${countdown > 0 || gateOpening ? 'right-32' : 'right-5'}`}>
            <div className="flex rounded-xl border border-white/10 bg-black/65 p-1 shadow-xl backdrop-blur-md">
              {([['horse', '馬'], ['marker', '丸']] as const).map(([style, label]) => (
                <button key={style} onClick={() => setRunnerStyle(style)} className={`h-8 min-w-11 rounded-lg px-3 text-[11px] font-black transition ${runnerStyle === style ? 'bg-emerald-400 text-[#06130c]' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-xl border border-white/10 bg-black/65 p-1 shadow-xl backdrop-blur-md">
              {([['auto', '自動'], ['broadcast', '中継'], ['leader', '先頭'], ['overview', '全体']] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => setCameraMode(mode)} className={`h-8 rounded-lg px-3 text-[11px] font-black transition ${cameraMode === mode ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

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
            <div className="absolute inset-0 z-30 overflow-hidden pointer-events-none">
              <div className="absolute top-5 right-6 min-w-24 rounded-xl bg-black/65 border border-white/15 px-5 py-3 text-center">
                <div className="text-[10px] text-gray-300 font-black tracking-[0.25em]">START</div>
                <div className="text-5xl leading-none font-black text-yellow-400 tabular-nums">{Math.max(0, countdown)}</div>
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 top-7 text-center">
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
            <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 pointer-events-none">
              <div className={`min-w-80 rounded-2xl border px-7 py-3 text-center shadow-2xl backdrop-blur-md ${photoPhase === 'reveal' ? 'border-yellow-300/70 bg-yellow-950/85' : 'border-amber-300/40 bg-black/80'}`}>
                <div className="text-[10px] font-black tracking-[0.35em] text-amber-300">
                  {photoPhase === 'reveal' ? 'OFFICIAL RESULT' : photoPhase === 'review' ? 'PHOTO FINISH' : 'PHOTO FINISH PENDING'}
                </div>
                <div className="mt-1 text-lg font-black text-white">
                  {photoPhase === 'waiting'
                    ? '1着・2着 写真判定待ち'
                    : photoPhase === 'review'
                      ? `写真判定中 ${photoFrame + 1}/${photoFrameCount}`
                      : `こっちだ！ ${raceData.simulation.results?.[0]?.horse_number}番 ${raceData.simulation.results?.[0]?.horse_name}！`}
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-white/70">
                  {photoPhase === 'waiting' ? '全頭の着順決定をお待ちください' : photoPhase === 'review' ? '実際のゴール時点を全馬込みで確認しています' : '着順が確定しました'}
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
              const selectedIndex = selectedHorses.indexOf(r.hn);
              return (
                <div
                  key={r.hn}
                  className={`absolute left-0 right-0 px-4 transition-all duration-700 ease-[cubic-bezier(0.22,1.61,0.36,1)] ${isOvertaking ? 'z-10' : 'z-0'}`}
                  style={{ top: i * 44 + 12, height: 40 }}
                >
                  <button onClick={() => toggleSelectedHorse(r.hn)} className={`flex w-full items-center gap-3 h-full rounded-lg px-2 border text-left transition-all duration-500 shadow-lg ${selectedIndex >= 0 ? 'bg-white/10' : ''} ${isConfirmed ? 'bg-yellow-900/50 border-yellow-500/60 shadow-[0_0_12px_rgba(234,179,8,0.3)]' :
                    isOvertaking ? 'bg-indigo-500 border-white scale-[1.12] shadow-[0_0_30px_rgba(99,102,241,0.8)] brightness-125' :
                      'bg-black/60 border-white/10'
                    }`} style={selectedIndex >= 0 ? { borderColor: FOCUS_COLORS[selectedIndex], boxShadow: `0 0 14px ${FOCUS_COLORS[selectedIndex]}55` } : undefined}>
                    <span className={`w-4 font-mono font-black text-xs text-center ${i < 3 ? 'text-yellow-400' : 'text-gray-300'}`}>{photoPending && contenderSet.has(r.hn) ? '?' : i + 1}</span>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-xl border border-white/20" style={{ background: HORSE_COLORS[r.hn - 1], boxShadow: isOvertaking ? `0 0 20px ${HORSE_COLORS[r.hn - 1]}` : '' }}>{r.hn}</div>
                    <span className="flex-1 font-black text-xs truncate text-white drop-shadow-sm">{r.name}</span>
                    {photoPending && contenderSet.has(r.hn)
                      ? <div className="text-[9px] font-mono text-amber-300 font-black">判定待ち</div>
                      : isConfirmed
                      ? <div className="text-[9px] font-mono text-yellow-400 font-black">確定</div>
                      : <div className="text-[9px] font-mono text-gray-200 font-bold">{(r.progress * 100).toFixed(0)}%</div>
                    }
                  </button>
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
            {!centralPlayback && useGameStore.getState().role === 'guest' && (
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
