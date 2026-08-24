import { useEffect, useMemo, useRef, useState } from 'react';
import { HORSE_COLORS } from '../core/constants';
import { initialCamera, renderRaceFrame } from '../race-renderer-v2/renderer';
import type { CameraMode, MockFrame, RenderHorse, RunnerStyle } from '../race-renderer-v2/model';

interface Props {
  simulation: any;
  horses: any[];
  onClose: () => void;
}

const STAGE_MS = 900;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function RaceReplayModal({ simulation, horses, onClose }: Props) {
  const stages = useMemo(() => simulation?.stages || [], [simulation]);
  const highlights = useMemo(() => simulation?.presentation?.highlights || [], [simulation]);
  const totalDuration = Math.max(STAGE_MS, stages.length * STAGE_MS);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto');
  const [runnerStyle, setRunnerStyle] = useState<RunnerStyle>(() => window.localStorage.getItem('race-renderer-style') === 'marker' ? 'marker' : 'horse');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(initialCamera());
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      const next = Math.min(totalDuration, elapsedRef.current + delta * speed);
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= totalDuration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, totalDuration]);

  const stageFloat = Math.min(stages.length - 0.0001, elapsed / STAGE_MS);
  const stageIndex = Math.max(0, Math.floor(stageFloat));
  const localProgress = Math.max(0, stageFloat - stageIndex);
  const currentStage = stages[stageIndex];
  const previousStage = stageIndex > 0 ? stages[stageIndex - 1] : null;
  const activeHighlight = highlights.find((highlight: any) => highlight.stageIndex === stageIndex);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentStage) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gatePart = stageIndex === 0 && localProgress < 0.22;
    const interpolation = stageIndex === 0 ? Math.max(0, (localProgress - 0.22) / 0.78) : localProgress;
    const rawRunners = horses.map((horse, rosterIndex) => {
      const hn = horse.horse_number;
      const previous = previousStage?.positions_progress?.[hn] ?? previousStage?.positions_progress?.[String(hn)] ?? 0;
      const current = currentStage.positions_progress?.[hn] ?? currentStage.positions_progress?.[String(hn)] ?? previous;
      const progress = gatePart ? 0 : lerp(previous, current, interpolation);
      const gateLane = rosterIndex - (horses.length - 1) / 2;
      const runningLane = gateLane * 0.38 + ((((hn * 7) % 9) - 4) * 0.045);
      const laneBlend = Math.max(0, Math.min(1, (progress - 0.01) / 0.16));
      const smoothLaneBlend = laneBlend * laneBlend * (3 - 2 * laneBlend);
      return { horse, progress, lane: lerp(gateLane, runningLane, smoothLaneBlend) };
    });
    const order = [...rawRunners].sort((a, b) => b.progress - a.progress);
    const ranks = new Map(order.map((runner, index) => [runner.horse.horse_number, index + 1]));
    const renderHorses: RenderHorse[] = rawRunners.map(({ horse, progress, lane }) => ({
      number: horse.horse_number,
      name: horse.name,
      color: HORSE_COLORS[horse.horse_number - 1] || '#777',
      progress: Math.min(1.025, progress),
      lane,
      rank: ranks.get(horse.horse_number) || horses.length,
      energy: Math.max(0.05, 1 - Math.min(1, progress) * 0.65),
    }));
    const leaderProgress = Math.min(1, order[0]?.progress || 0);
    const phase: MockFrame['phase'] = gatePart ? 'opening' : leaderProgress >= 0.82 ? 'final' : 'race';
    const frame: MockFrame = {
      time: elapsed / 1000,
      displayTime: elapsed / 1000,
      phase,
      phaseLabel: gatePart ? 'スタート' : currentStage.stage_name_jp || 'レース中',
      commentary: activeHighlight?.label || '',
      gateOpen: gatePart ? Math.min(1, localProgress / 0.22) : 1,
      horses: renderHorses,
      remaining: Math.max(0, Math.round((simulation.distance || 1600) * (1 - leaderProgress))),
      pace: simulation.pace || '',
      photoFrame: 0,
      photoFrameCount: 7,
      officialOrderReady: false,
      officialOrder: simulation.results?.map((result: any) => result.horse_number) || [],
      trackCondition: simulation.field_condition,
    };
    renderRaceFrame(ctx, width, height, frame, cameraMode, cameraRef.current, activeHighlight?.horseNumbers || [], runnerStyle, performance.now());
  }, [activeHighlight, cameraMode, currentStage, elapsed, horses, localProgress, previousStage, runnerStyle, simulation, stageIndex]);

  const seek = (nextElapsed: number) => {
    const next = Math.max(0, Math.min(totalDuration, nextElapsed));
    elapsedRef.current = next;
    setElapsed(next);
    cameraRef.current = initialCamera();
  };

  if (!stages.length) return null;

  const currentLeaderProgress = Math.max(...horses.map(horse => {
    const hn = horse.horse_number;
    return Number(currentStage?.positions_progress?.[hn] ?? currentStage?.positions_progress?.[String(hn)] ?? 0);
  }));

  return (
    <div className="fixed inset-0 z-[400] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="レースハイライト">
      <div className="w-full max-w-6xl bg-[#141718] border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
        <header className="min-h-14 px-5 py-2 flex items-center justify-between border-b border-white/10 bg-[#1b1f20]">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-gray-500 font-black">RACE REPLAY</div>
            <div className="text-white font-black">{activeHighlight ? activeHighlight.label : currentStage?.stage_name_jp || 'レース再生'}</div>
            <div className="text-[10px] text-gray-500 font-bold">{activeHighlight?.description || `${stageIndex + 1}/${stages.length}区間`}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-black/40 p-1">
              {([['horse', '馬'], ['marker', '丸']] as const).map(([style, label]) => (
                <button key={style} onClick={() => setRunnerStyle(style)} className={`px-3 py-1.5 rounded-md text-[10px] font-black ${runnerStyle === style ? 'bg-emerald-400 text-black' : 'text-gray-400'}`}>{label}</button>
              ))}
            </div>
            <div className="flex rounded-lg bg-black/40 p-1">
              {([['auto', '自動'], ['broadcast', '中継'], ['overview', '全体']] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => { setCameraMode(mode); cameraRef.current = initialCamera(); }} className={`px-3 py-1.5 rounded-md text-[10px] font-black ${cameraMode === mode ? 'bg-white text-black' : 'text-gray-400'}`}>{label}</button>
              ))}
            </div>
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-bold">閉じる</button>
          </div>
        </header>

        <div className="relative bg-[#07150e] aspect-[16/8] overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full" aria-label="レースリプレイ映像" />
          <div className="absolute left-5 bottom-4 bg-black/70 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-md">
            <div className="text-[9px] text-emerald-300 font-black tracking-[0.25em]">REPLAY · {speed.toFixed(1)}x</div>
            <div className="text-sm text-white font-black">残り 約{Math.max(0, Math.round((simulation.distance || 1600) * (1 - Math.min(1, currentLeaderProgress))))}m</div>
          </div>
          {activeHighlight && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-xl border border-amber-300/40 bg-black/75 px-6 py-2 text-center backdrop-blur-md">
              <div className="text-[9px] font-black tracking-[0.3em] text-amber-300">HIGHLIGHT</div>
              <div className="text-base font-black text-white">{activeHighlight.label}</div>
            </div>
          )}
        </div>

        <div className="px-4 pt-3 flex gap-2 overflow-x-auto border-t border-white/10">
          {highlights.map((highlight: any) => (
            <button key={`${highlight.stageIndex}-${highlight.label}`} onClick={() => seek(highlight.stageIndex * STAGE_MS)} className={`shrink-0 rounded-lg border px-3 py-2 text-left transition ${stageIndex === highlight.stageIndex ? 'border-amber-300 bg-amber-300/10' : 'border-white/10 bg-white/[.03] hover:bg-white/[.07]'}`}>
              <div className="text-[9px] font-black text-gray-500">{highlight.stageIndex + 1}区間</div>
              <div className="text-[11px] font-black text-white">{highlight.label}</div>
            </button>
          ))}
        </div>

        <footer className="p-4 flex items-center gap-3">
          <button onClick={() => setPlaying(value => !value)} className="w-24 px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 font-bold text-sm">{playing ? '一時停止' : '再生'}</button>
          <button onClick={() => { seek(0); setPlaying(true); }} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 font-bold text-sm">最初から</button>
          <div className="flex gap-1 rounded-lg bg-black/30 p-1">
            {[0.75, 1, 1.5, 2].map(value => <button key={value} onClick={() => setSpeed(value)} className={`rounded px-2 py-1 text-[10px] font-black ${speed === value ? 'bg-indigo-500 text-white' : 'text-gray-500'}`}>{value}x</button>)}
          </div>
          <input aria-label="リプレイ位置" type="range" min={0} max={totalDuration} value={elapsed} onChange={event => seek(Number(event.target.value))} className="flex-1 accent-indigo-500" />
          <div className="w-24 text-right text-[10px] font-mono text-gray-500">{Math.floor(elapsed / 1000)}s / {Math.floor(totalDuration / 1000)}s</div>
        </footer>
      </div>
    </div>
  );
}
