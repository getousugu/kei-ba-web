import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, Gauge, Pause, Play, RotateCcw } from 'lucide-react';
import { initialCamera, renderRaceFrame } from '../race-renderer-v2/renderer';
import {
  MOCK_DURATION,
  SCENE_TIMES,
  sampleMockRace,
  type CameraMode,
  type MockFrame,
  type MockScene,
} from '../race-renderer-v2/model';

const SCENES: { id: MockScene; label: string }[] = [
  { id: 'gate', label: 'ゲート' },
  { id: 'race', label: '馬群' },
  { id: 'final', label: '最終直線' },
  { id: 'photo', label: '写真判定' },
];

const CAMERAS: { id: CameraMode; label: string }[] = [
  { id: 'auto', label: '自動' },
  { id: 'broadcast', label: '中継' },
  { id: 'leader', label: '先頭' },
  { id: 'overview', label: '全体' },
];

export default function RaceRenderMock() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(SCENE_TIMES.gate);
  const lastTickRef = useRef<number | null>(null);
  const cameraRef = useRef(initialCamera());
  const hudTickRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto');
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [frame, setFrame] = useState<MockFrame>(() => sampleMockRace(SCENE_TIMES.gate));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let animationFrame = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now: number) => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.width / ratio;
      const height = canvas.height / ratio;
      if (lastTickRef.current === null) lastTickRef.current = now;
      const delta = Math.min(0.05, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      if (playing) timeRef.current = (timeRef.current + delta * speed) % MOCK_DURATION;
      const nextFrame = sampleMockRace(timeRef.current);

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderRaceFrame(context, width, height, nextFrame, cameraMode, cameraRef.current, selectedHorse, now);
      if (now - hudTickRef.current > 90) {
        hudTickRef.current = now;
        setFrame(nextFrame);
      }
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      lastTickRef.current = null;
    };
  }, [cameraMode, playing, selectedHorse, speed]);

  const jumpTo = (scene: MockScene) => {
    timeRef.current = SCENE_TIMES[scene];
    cameraRef.current = initialCamera();
    setFrame(sampleMockRace(timeRef.current));
  };

  const ordered = [...frame.horses].sort((a, b) => a.rank - b.rank);
  const selected = frame.horses.find(horse => horse.number === selectedHorse);

  return (
    <main className="h-screen min-h-[620px] bg-[#07100b] text-white overflow-hidden font-sans flex flex-col">
      <header className="h-16 shrink-0 border-b border-white/10 bg-[#0b1510] px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <a href="./" className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 grid place-items-center text-gray-300" aria-label="ゲームに戻る">
            <ChevronLeft size={18} />
          </a>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-400 font-black">Race Vision Prototype</div>
            <h1 className="text-base md:text-lg font-black truncate">新レース描画モック</h1>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-black/25 p-1 rounded-xl border border-white/10" aria-label="場面選択">
          {SCENES.map(scene => (
            <button key={scene.id} onClick={() => jumpTo(scene.id)} className={`px-4 py-2 rounded-lg text-xs font-black transition ${frame.phase === scene.id || (scene.id === 'gate' && frame.phase === 'opening') ? 'bg-emerald-500 text-[#06130c]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              {scene.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={() => { timeRef.current = SCENE_TIMES.gate; cameraRef.current = initialCamera(); }} className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 grid place-items-center" aria-label="最初に戻す">
            <RotateCcw size={16} />
          </button>
          <button onClick={() => setPlaying(value => !value)} className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#06130c] flex items-center gap-2 text-xs font-black">
            {playing ? <Pause size={15} /> : <Play size={15} />}{playing ? '一時停止' : '再生'}
          </button>
        </div>
      </header>

      <section className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative bg-[#07150e] overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          <div className="absolute top-4 left-4 flex items-stretch gap-2 pointer-events-none">
            <div className="bg-[#08100c]/90 backdrop-blur border border-white/10 rounded-xl px-4 py-2.5 shadow-xl">
              <div className="text-[9px] text-gray-500 font-black tracking-[.22em] uppercase">残り距離</div>
              <div className="text-2xl leading-none mt-1 font-mono font-black text-amber-300">{frame.remaining}<span className="text-xs ml-1">m</span></div>
            </div>
            <div className="bg-[#08100c]/90 backdrop-blur border border-white/10 rounded-xl px-4 py-2.5 shadow-xl hidden sm:block">
              <div className="text-[9px] text-gray-500 font-black tracking-[.22em] uppercase">展開</div>
              <div className="text-sm mt-1 font-black text-emerald-300">{frame.pace}</div>
            </div>
          </div>

          <div className="absolute top-4 right-4 bg-[#08100c]/90 backdrop-blur border border-white/10 rounded-xl p-1 flex items-center shadow-xl">
            <div className="w-8 h-8 grid place-items-center text-gray-500"><Camera size={15} /></div>
            {CAMERAS.map(camera => (
              <button key={camera.id} onClick={() => setCameraMode(camera.id)} className={`px-3 h-8 rounded-lg text-[11px] font-black ${cameraMode === camera.id ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>
                {camera.label}
              </button>
            ))}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-5 text-center pointer-events-none">
            <div className="text-[10px] tracking-[.34em] text-white/55 font-black uppercase">{frame.phaseLabel}</div>
          </div>

          {frame.phase === 'photo' && (
            <div className="absolute inset-x-0 top-20 flex justify-center pointer-events-none">
              <div className="bg-[#0b1110]/88 border-y border-white/20 px-8 py-3 text-center shadow-2xl">
                <div className="text-[10px] text-amber-300 tracking-[.45em] font-black">PHOTO FINISH</div>
                <div className="mt-1 text-xl font-black">1着・2着 写真判定中</div>
              </div>
            </div>
          )}

          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[min(760px,88%)] pointer-events-none">
            <div className="bg-[#080d0b]/88 backdrop-blur border border-white/10 rounded-xl px-6 py-3 text-center shadow-2xl">
              <p className="font-black text-base md:text-xl leading-tight">{frame.commentary}</p>
            </div>
          </div>

          {selected && (
            <div className="absolute left-4 bottom-20 bg-[#08100c]/92 border border-amber-300/30 rounded-xl px-4 py-3 shadow-xl pointer-events-none">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full border-2 border-white grid place-items-center font-black" style={{ background: selected.color }}>{selected.number}</span>
                <div><div className="font-black text-sm">{selected.name}</div><div className="text-[10px] text-gray-400">現在 {selected.rank}番手 · 余力 {Math.round(selected.energy * 100)}%</div></div>
              </div>
            </div>
          )}

          <div className="absolute inset-x-4 bottom-3 h-14 bg-[#08100c]/92 backdrop-blur border border-white/10 rounded-xl px-4 flex items-center gap-4 shadow-xl">
            <div className="md:hidden flex gap-1 overflow-x-auto">
              {SCENES.map(scene => <button key={scene.id} onClick={() => jumpTo(scene.id)} className="px-2.5 py-1.5 text-[10px] font-black bg-white/5 rounded">{scene.label}</button>)}
            </div>
            <input aria-label="レース時間" type="range" min="0" max={MOCK_DURATION} step="0.1" value={frame.time} onChange={event => { timeRef.current = Number(event.target.value); setFrame(sampleMockRace(timeRef.current)); }} className="flex-1 accent-emerald-400 min-w-20" />
            <div className="flex items-center gap-1 shrink-0">
              <Gauge size={15} className="text-gray-500 mr-1" />
              {[0.5, 1, 2].map(value => <button key={value} onClick={() => setSpeed(value)} className={`w-9 h-8 rounded-lg text-[10px] font-black ${speed === value ? 'bg-emerald-500 text-[#06130c]' : 'bg-white/5 text-gray-400'}`}>{value}×</button>)}
            </div>
          </div>
        </div>

        <aside className="w-64 xl:w-72 shrink-0 bg-[#080e0b] border-l border-white/10 flex flex-col">
          <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between">
            <div><div className="text-[9px] text-gray-500 tracking-[.25em] font-black uppercase">Live Order</div><div className="text-xs font-black mt-0.5">リアルタイム順位</div></div>
            <span className="text-[10px] text-emerald-400 font-black">1600m</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {ordered.map(horse => (
              <button key={horse.number} onClick={() => setSelectedHorse(current => current === horse.number ? null : horse.number)} className={`w-full h-11 rounded-lg px-2 flex items-center gap-2 text-left border transition ${selectedHorse === horse.number ? 'bg-amber-300/10 border-amber-300/45' : 'bg-white/[.025] border-transparent hover:bg-white/5'}`}>
                <span className={`w-5 text-center text-xs font-black ${horse.rank <= 3 ? 'text-amber-300' : 'text-gray-500'}`}>{horse.rank}</span>
                <span className="w-7 h-7 rounded-full border-2 border-white/90 grid place-items-center text-[10px] font-black" style={{ background: horse.color }}>{horse.number}</span>
                <span className="flex-1 min-w-0 text-xs font-bold truncate">{horse.name}</span>
                <span className="text-[9px] font-mono text-gray-500">{Math.round(horse.energy * 100)}%</span>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-white/10 text-[10px] leading-relaxed text-gray-500">
            馬を選ぶと追跡表示。順位と走行レーンは独立しているため、追い越し時も横へ瞬間移動しません。
          </div>
        </aside>
      </section>
    </main>
  );
}
