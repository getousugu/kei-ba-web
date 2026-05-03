import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { RoomSettings } from '../store/gameStore';
import { peerManager } from '../network/peerManager';
import { oddsCalculator } from '../core/odds_calculator';
import { FIELD_CONDITIONS, DISTANCE_CATEGORIES } from '../core/constants';
import { drawHorsesFromPool } from '../db/db';

const WEATHER_OPTIONS = ['random', '晴', '曇', '雨', '雪'];
const WEATHER_ICONS: Record<string, string> = { random: '—', 晴: '☀', 曇: '☁', 雨: '🌧', 雪: '🌨' };

async function buildRace(
  horseCount: number,
  distance: number,
  fieldCondition: string,
  weather: string,
  isRealOdds: boolean = false,
) {
  const drawn = await drawHorsesFromPool(horseCount);
  const horses = drawn.map((h, i) => ({ ...h, horse_number: i + 1 }));
  horses.forEach(h => {
    (h as any).score = oddsCalculator.calculateCompositeScore(h, distance, fieldCondition, '平坦');
  });
  return oddsCalculator.calculateInitialOdds(horses, isRealOdds);
}

export default function RaceSetupPhase() {
  const { role, setPhase, roomSettings, setRoomSettings, raceData } = useGameStore();
  const isHost = role === 'host';
  const [loading, setLoading] = useState(false);

  const [cfg, setCfg] = useState({
    horseCount: roomSettings.horseCount || 12,
    distance: roomSettings.distance || 'random',
    fieldCondition: roomSettings.fieldCondition || 'random',
    weather: roomSettings.weather || 'random',
    bettingTime: roomSettings.bettingTime || 60,
  });

  const resolveConfig = () => {
    const distKeys = Object.keys(DISTANCE_CATEGORIES);
    const distanceCat = cfg.distance === 'random'
      ? distKeys[Math.floor(Math.random() * distKeys.length)]
      : cfg.distance;
    const [lo, hi] = DISTANCE_CATEGORIES[distanceCat];
    const distance = Math.round((Math.random() * (hi - lo) + lo) / 100) * 100;

    const fc = cfg.fieldCondition === 'random'
      ? FIELD_CONDITIONS[Math.floor(Math.random() * FIELD_CONDITIONS.length)]
      : cfg.fieldCondition;

    const wList = ['晴', '曇', '雨', '雪'];
    const weather = cfg.weather === 'random'
      ? wList[Math.floor(Math.random() * wList.length)]
      : cfg.weather;

    return { distance, fieldCondition: fc, weather };
  };

  const handleStartGame = async () => {
    setLoading(true);
    try {
      const { distance, fieldCondition, weather } = resolveConfig();
      const horsesWithOdds = await buildRace(cfg.horseCount, distance, fieldCondition, weather, roomSettings.realOdds);
      const raceData = { distance, field_condition: fieldCondition, weather, course_feature: '平坦' };

      const finalBettingTime = cfg.bettingTime || 120;
      const endTime = Date.now() + Math.max(10, finalBettingTime) * 1000;

      // 同条件再レースのために、選択された設定（'random'等を含む）を roomSettings に保存
      const updatedSettings = {
        ...roomSettings,
        horseCount: cfg.horseCount,
        distance: cfg.distance,
        fieldCondition: cfg.fieldCondition,
        weather: cfg.weather,
        bettingTime: finalBettingTime,
      };
      useGameStore.getState().setRoomSettings(updatedSettings);

      // Broadcast FIRST
      peerManager.broadcast({
        type: 'phase_start',
        phase: 'betting',
        horses: horsesWithOdds,
        raceData,
        bettingEndTime: endTime,
        roomSettings: updatedSettings
      });

      // Update local state SECOND
      useGameStore.getState().updateHorses(horsesWithOdds);
      useGameStore.getState().setRaceData(raceData);
      useGameStore.getState().setBettingEndTime(endTime);
      setPhase('betting');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (key: keyof RoomSettings, val: any) => {
    const newSettings = { ...roomSettings, [key]: val };
    setRoomSettings(newSettings);
    // Bug-17: 'room_state' は handleIncomingData に存在しない → 'update_room_settings' が正しい
    peerManager.broadcast({ type: 'update_room_settings', settings: newSettings });
  };

  const fieldColor: Record<string, string> = {
    良: 'text-green-400', 稍重: 'text-yellow-400', 重: 'text-orange-400', 不良: 'text-red-400',
  };

  return (
    <div className="min-h-screen bg-[#111113] text-gray-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="text-[11px] tracking-[0.35em] text-gray-600 uppercase mb-2">Host Settings</div>
          <h2 className="text-2xl font-black text-white tracking-tight">レース開催設定</h2>
          {role === 'guest' && raceData && (
            <div style={{ fontSize: 11 }} className="text-gray-600 font-mono mt-2">
              {raceData.distance}m · {raceData.field_condition} · {raceData.weather}
            </div>
          )}
          {role === 'guest' && (
            <div className="mt-1 inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg animate-pulse">
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">Waiting for Host Decision...</span>
            </div>
          )}
        </div>

        {!isHost ? (
          <div className="panel rounded-xl p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <div>
              <p className="font-bold text-gray-300">ホストが設定中です</p>
              <p className="text-sm text-gray-600 mt-1">しばらくお待ちください</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* --- Race Conditions --- */}
            <div className="panel rounded-xl overflow-hidden">
              <div className="panel-header flex items-center justify-between">
                <span>出走頭数</span>
                <span className="text-white font-mono font-bold text-sm">{cfg.horseCount} 頭</span>
              </div>
              <div className="p-4">
                <input type="range" min="8" max="18" value={cfg.horseCount}
                  onChange={e => setCfg({ ...cfg, horseCount: parseInt(e.target.value) })}
                  className="w-full accent-indigo-500 h-1.5 bg-[#2a2a32] rounded-lg appearance-none cursor-pointer" />
              </div>
            </div>

            <div className="panel rounded-xl overflow-hidden border border-[#2a2a32]">
              <div className="panel-header flex items-center justify-between bg-[#202028] text-gray-300 font-black uppercase tracking-widest">
                <span>馬券購入 受付時間 (秒)</span>
                <div className="flex gap-1">
                  {[30, 60, 120, 180].map(sec => (
                    <button key={sec} onClick={() => setCfg({ ...cfg, bettingTime: sec })}
                      className={`px-2 py-0.5 rounded text-[10px] font-black transition-all ${cfg.bettingTime === sec ? 'bg-indigo-600 text-white' : 'bg-black/20 text-gray-500 hover:text-gray-300'}`}>
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 bg-[#1a1a1e]">
                <div className="relative">
                  <input type="number" min="10" max="3600" value={cfg.bettingTime || ''}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                      setCfg({ ...cfg, bettingTime: isNaN(val) ? 0 : val });
                    }}
                    className="w-full bg-[#0e0e10] border border-[#2a2a32] rounded-lg px-10 py-2.5 text-lg font-mono font-black text-white focus:outline-none focus:border-indigo-500 transition-all text-center tabular-nums"
                    placeholder="120"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-black text-[10px] uppercase pointer-events-none tracking-widest">SEC</div>
                </div>
              </div>
            </div>

            <div className="panel rounded-xl overflow-hidden">
              <div className="panel-header">コース距離</div>
              <div className="p-3">
                <select value={cfg.distance} onChange={e => setCfg({ ...cfg, distance: e.target.value })}
                  className="w-full bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer">
                  <option value="random" className="bg-[#1a1a1e]">おまかせ (ランダム)</option>
                  <option value="短距離" className="bg-[#1a1a1e]">短距離 — 1000〜1400m</option>
                  <option value="マイル" className="bg-[#1a1a1e]">マイル — 1500〜1800m</option>
                  <option value="中距離" className="bg-[#1a1a1e]">中距離 — 1900〜2400m</option>
                  <option value="長距離" className="bg-[#1a1a1e]">長距離 — 2500〜3600m</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="panel rounded-xl overflow-hidden">
                <div className="panel-header">馬場状態</div>
                <div className="p-3">
                  <select value={cfg.fieldCondition} onChange={e => setCfg({ ...cfg, fieldCondition: e.target.value })}
                    className={`w-full bg-transparent text-sm font-bold focus:outline-none cursor-pointer ${fieldColor[cfg.fieldCondition] || 'text-white'}`}>
                    <option value="random" className="text-white bg-[#1a1a1e]">おまかせ</option>
                    {FIELD_CONDITIONS.map(c => <option key={c} value={c} className="text-white bg-[#1a1a1e]">{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="panel rounded-xl overflow-hidden">
                <div className="panel-header">天候</div>
                <div className="p-3 flex items-center gap-2">
                  <span className="text-lg leading-none">{WEATHER_ICONS[cfg.weather]}</span>
                  <select value={cfg.weather} onChange={e => setCfg({ ...cfg, weather: e.target.value })}
                    className="flex-1 bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer">
                    {WEATHER_OPTIONS.map(w => <option key={w} value={w} className="bg-[#1a1a1e]">{w === 'random' ? 'おまかせ' : w}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* --- Additional Options --- */}
            <div className="panel rounded-xl overflow-hidden">
              <div className="panel-header flex items-center justify-between">
                <span>リアルオッズ (低倍率設定)</span>
                <button 
                  onClick={() => updateSetting('realOdds', !roomSettings.realOdds)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${roomSettings.realOdds ? 'bg-emerald-500' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${roomSettings.realOdds ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="px-4 pb-3">
                <p className="text-[10px] text-gray-500">
                  有効にすると、オッズの算出ロジックを現実に即したシビアなものに変更します。払戻金が少なくなりますが、よりリアルな競馬を体験できます。
                </p>
              </div>
            </div>

            <button onClick={handleStartGame} disabled={loading}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait text-white font-black rounded-xl text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 出走表を生成中...</>
              ) : (
                <>受付を開始してベッティングへ <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
