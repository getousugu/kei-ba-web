import { useState } from 'react';
import { db } from '../db/db';
import { useGameStore } from '../store/gameStore';
import { horseGenerator } from '../core/horse_generator';

interface HorseNamingModalProps {
  onClose: () => void;
}

export default function HorseNamingModal({ onClose }: HorseNamingModalProps) {
  const { myCoins, setMyCoins, hasCreatedPermanent, setHasCreatedPermanent } = useGameStore();
  const [createName, setCreateName] = useState('');

  const handleCreatePermanent = async () => {
    const isFree = !hasCreatedPermanent;
    const cost = isFree ? 0 : 150000;

    if (myCoins < cost || !createName.trim()) return;

    if (!confirm(`${createName.trim()} を ${isFree ? '無料' : '150,000 C'} で作成しますか？`)) return;

    // レアリティ抽選: 5% Legendary, 30% Epic, 65% Rare
    const rand = Math.random();
    let rarity = 'Rare';
    if (rand < 0.05) rarity = 'Legendary';
    else if (rand < 0.35) rarity = 'Epic';

    const h = horseGenerator.generateHorse(new Set());
    h.name = createName.trim();
    h.rarity = rarity;

    // ステータス補正 (約5%のボーナス)
    const buff = 1.05;
    const statNames = ["speed", "stamina", "power", "burst", "guts", "wisdom"] as const;
    statNames.forEach(s => {
      h[s] = Math.min(100, Math.round(h[s] * buff));
    });

    const [weight, weight_change] = horseGenerator.generateHorseWeight();
    const jockey_name = horseGenerator.generateJockeyName();

    await db.horses.add({
      ...h,
      jockey_name,
      weight,
      weight_change,
      record: { wins: 0, places: 0, shows: 0, losses: 0 },
      rating: rarity === 'Legendary' ? 1600 : rarity === 'Epic' ? 1400 : 1200,
      total_races: 0,
      wins: 0,
      is_permanent: true,
    });

    if (cost > 0) setMyCoins(myCoins - cost);
    setHasCreatedPermanent(true);
    useGameStore.getState().unlockTitle('owner_debut');
    setCreateName('');
    alert(`${h.name} (${rarity}) を作成しました！`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#16161a] border border-[#2a2a32] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 border-b border-[#2a2a32] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">名付け馬の作成</h2>
            <p className="text-xs text-gray-500 font-bold mt-1">あなただけの名付け馬を作成し、レースに参戦させることができます。</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl hover:bg-white/5 flex items-center justify-center text-gray-400 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* 新規作成セクション */}
        <div className="p-6 bg-[#0c0c0e]/50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
              新規馬の作成 {hasCreatedPermanent ? '(150,000 C)' : '(初回無料！)'}
            </h3>
            <span className={`text-xs font-black ${myCoins >= (hasCreatedPermanent ? 150000 : 0) ? 'text-green-500' : 'text-red-500'}`}>
              所持: {myCoins.toLocaleString()} C
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="新しい馬の名前を入力..."
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="flex-1 bg-[#0c0c0e] border border-[#2a2a32] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-bold"
            />
            <button
              onClick={handleCreatePermanent}
              disabled={(hasCreatedPermanent && myCoins < 150000) || !createName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white px-6 rounded-xl text-sm font-black transition-all"
            >
              {hasCreatedPermanent ? '作成' : '無料で作成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
