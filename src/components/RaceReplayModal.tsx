import { useEffect, useMemo, useRef, useState } from 'react';
import { HORSE_COLORS } from '../core/constants';

interface Props {
  simulation: any;
  horses: any[];
  onClose: () => void;
}

const SEGMENT_MS = 2200;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function trackPosition(progress: number) {
  const angle = -(progress * Math.PI * 2) + Math.PI / 2;
  return {
    x: 400 + Math.cos(angle) * 300,
    y: 210 + Math.sin(angle) * 145,
  };
}

export default function RaceReplayModal({ simulation, horses, onClose }: Props) {
  const highlights = useMemo(() => simulation?.presentation?.highlights || [], [simulation]);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const startedRef = useRef(performance.now());
  const pausedAtRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (playing) {
        const next = now - startedRef.current;
        setElapsed(next);
        if (next >= highlights.length * SEGMENT_MS) {
          setElapsed(highlights.length * SEGMENT_MS);
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, highlights.length]);

  const replay = () => {
    startedRef.current = performance.now();
    pausedAtRef.current = 0;
    setElapsed(0);
    setPlaying(true);
  };

  const togglePlaying = () => {
    if (playing) {
      pausedAtRef.current = elapsed;
      setPlaying(false);
    } else {
      startedRef.current = performance.now() - pausedAtRef.current;
      setPlaying(true);
    }
  };

  if (!highlights.length) return null;
  const segmentIndex = Math.min(highlights.length - 1, Math.floor(elapsed / SEGMENT_MS));
  const highlight = highlights[segmentIndex];
  const localProgress = Math.min(1, (elapsed % SEGMENT_MS) / SEGMENT_MS);
  const stageIndex = highlight.stageIndex;
  const current = simulation.stages[stageIndex];
  const previous = simulation.stages[Math.max(0, stageIndex - 1)];

  const runners = horses.map(horse => {
    const hn = horse.horse_number;
    const prev = previous?.positions_progress?.[hn] ?? previous?.positions_progress?.[String(hn)] ?? 0;
    const next = current?.positions_progress?.[hn] ?? current?.positions_progress?.[String(hn)] ?? prev;
    const progress = lerp(prev, next, localProgress);
    return { ...horse, progress, ...trackPosition(progress) };
  });

  return (
    <div className="fixed inset-0 z-[400] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="レースハイライト">
      <div className="w-full max-w-5xl bg-[#141718] border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
        <header className="h-14 px-5 flex items-center justify-between border-b border-white/10 bg-[#1b1f20]">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-gray-500 font-black">RACE HIGHLIGHT</div>
            <div className="text-white font-black">{segmentIndex + 1}/{highlights.length}　{highlight.label}</div>
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-bold">閉じる</button>
        </header>

        <div className="relative bg-[#142417] aspect-[16/8] overflow-hidden">
          <svg viewBox="0 0 800 420" className="w-full h-full" aria-label="レースリプレイ映像">
            <rect width="800" height="420" fill="#142417" />
            <ellipse cx="400" cy="210" rx="345" ry="190" fill="#1c3820" />
            <ellipse cx="400" cy="210" rx="330" ry="175" fill="#ad936d" />
            <ellipse cx="400" cy="210" rx="270" ry="115" fill="#1c3820" />
            <line x1="382" x2="418" y1="350" y2="350" stroke="white" strokeWidth="5" />
            {runners.map(runner => (
              <g key={runner.horse_number} transform={`translate(${runner.x} ${runner.y})`}>
                <circle r="11" fill={HORSE_COLORS[runner.horse_number - 1] || '#777'} stroke="white" strokeWidth="2" />
                <text y="4" textAnchor="middle" fill="white" fontSize="10" fontWeight="900">{runner.horse_number}</text>
              </g>
            ))}
          </svg>
          <div className="absolute left-5 bottom-4 bg-black/65 border border-white/10 rounded-lg px-4 py-2">
            <div className="text-[10px] text-gray-500 font-black tracking-widest">REPLAY</div>
            <div className="text-sm text-white font-black">{highlight.label}</div>
          </div>
        </div>

        <footer className="p-4 flex items-center gap-3 border-t border-white/10">
          <button onClick={togglePlaying} className="w-24 px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 font-bold text-sm">
            {playing ? '一時停止' : '再生'}
          </button>
          <button onClick={replay} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 font-bold text-sm">最初から</button>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, elapsed / (highlights.length * SEGMENT_MS) * 100)}%` }} />
          </div>
        </footer>
      </div>
    </div>
  );
}
