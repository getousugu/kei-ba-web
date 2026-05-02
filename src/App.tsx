import { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { peerManager } from './network/peerManager';
import LobbyPhase from './components/LobbyPhase';
import RaceSetupPhase from './components/RaceSetupPhase';
import BettingPhase from './components/BettingPhase';
import RacePhase from './components/RacePhase';
import ResultPhase from './components/ResultPhase';

import { TITLES } from './core/constants';

export default function App() {
  const { 
    phase, role, roomId, playerName, playerTitle, ownedTitles, setPlayerName, setPlayerTitle, setPhase, setRole,
    participants, chatMessages, addChatMessage, unlockTitle, myCoins, setMyCoins
  } = useGameStore();

  const [joinId, setJoinId] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTitles, setShowTitles] = useState(false);
  const [secretCode, setSecretCode] = useState('');
  const [showPatchNotes, setShowPatchNotes] = useState(false);

  useEffect(() => {
    console.log('[App] Rendering Phase:', phase);
  }, [phase]);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) { alert('名前を入力してください'); return; }
    setLoading(true);
    try {
      const id = await peerManager.createRoom();
      setRole('host', id);
      setPhase('lobby');
    } catch (e) {
      alert('ルーム作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinId.trim() || !playerName.trim()) { alert('名前とルームIDを入力してください'); return; }
    setLoading(true);
    try {
      await peerManager.joinRoom(joinId.trim());
      setRole('guest', joinId.trim());
      setPhase('lobby');
    } catch (e) {
      alert('ルームへの参加に失敗しました。IDが正しいか確認してください。');
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.slice(0, 16);
    setPlayerName(val);
  };

  const handleSecretCode = () => {
    const code = secretCode.trim();
    if (!code) return;
    
    if (code === '0328') {
      unlockTitle('dev_friend');
      alert('称号「開発者の友達」を獲得しました！');
    } else if (code === 'ヘルメス') {
      unlockTitle('hermes');
      alert('称号「ヘルメス」を獲得しました！');
    } else if (code === 'debaggu004') {
      unlockTitle('debugger');
      alert('称号「デバッガー」を獲得しました！');
    } else if (code === 'antigravity') {
      unlockTitle('gravity_master');
      alert('称号「重力使い」を獲得しました！');
    } else if (code === 'Manny') {
      setMyCoins(myCoins + 2000);
      alert('2000C 獲得しました！');
    } else {
      alert(`コード "${code}" は無効です。`);
    }
    setSecretCode('');
  };

  if (phase === 'login') {
    const myTitles = TITLES.filter((t: any) => ownedTitles.includes(t.id));

    return (
      <div className="min-h-screen bg-[#0c0c0e] text-gray-100 flex flex-col items-center justify-center p-6 font-sans relative">
        <div className="w-full max-w-md animate-fade-in space-y-8 z-10">
          
          <div className="text-center">
            <h1 className="text-6xl font-black tracking-tighter text-white mb-2 italic">けいーば</h1>
            <p className="text-[10px] tracking-[0.5em] text-gray-400 uppercase font-bold">Multiplayer AI Horse Racing</p>
          </div>

          <div className="panel rounded-3xl overflow-hidden border-[#2a2a32] shadow-2xl bg-[#16161a]">
            <div className="panel-header px-6 py-3 border-b border-[#2a2a32]">PLAYER PROFILE</div>
            <div className="p-8 space-y-6">
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Your Name</label>
                  <input 
                    type="text" value={playerName} onChange={handleNameChange} placeholder="名前を入力..." 
                    className="w-full bg-[#0c0c0e] border border-[#2a2a32] rounded-2xl px-5 py-4 text-white font-black focus:outline-none focus:border-indigo-500 transition-all text-lg shadow-inner"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Selected Title</label>
                  <button 
                    onClick={() => setShowTitles(!showTitles)}
                    className="w-full bg-[#0c0c0e] border border-[#2a2a32] rounded-2xl px-5 py-3 flex items-center justify-between group hover:border-indigo-500/50 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-bold">称号:</span>
                      <span className={`font-black text-sm ${TITLES.find((t:any)=>t.name===playerTitle)?.color || 'text-indigo-400'}`}>
                        {playerTitle === '称号コレクター' ? `${ownedTitles.length}冠の覇者` : playerTitle}
                      </span>
                    </div>
                    <svg className={`w-4 h-4 text-gray-600 transition-transform ${showTitles?'rotate-180':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                  </button>

                  {showTitles && (
                    <div className="bg-[#0c0c0e] border border-[#2a2a32] rounded-2xl p-2 grid grid-cols-1 gap-1 max-h-48 overflow-y-auto animate-slide-down custom-scrollbar">
                      {myTitles.map((t: any) => (
                        <button 
                          key={t.id}
                          onClick={() => { setPlayerTitle(t.name); setShowTitles(false); }}
                          className={`w-full text-left px-4 py-3 rounded-xl transition-all ${playerTitle === t.name ? 'bg-indigo-600/10 border border-indigo-600/30' : 'hover:bg-white/5 border border-transparent'}`}
                        >
                          <div className={`font-black text-sm ${t.color}`}>
                            {t.id === 'title_collector' ? `${ownedTitles.length}冠の覇者` : t.name}
                          </div>
                          <div className="text-[9px] text-gray-600 font-bold">{t.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Tabs (Host or Join) */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Create New Race</label>
                  <button 
                    onClick={handleCreateRoom}
                    disabled={loading || !playerName.trim()}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-40 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/20 uppercase tracking-[0.2em] text-sm"
                  >
                    {loading ? 'Connecting...' : 'ルームを新規作成'}
                  </button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#2a2a32]/50" /></div>
                  <div className="relative flex justify-center"><span className="px-4 bg-[#16161a] text-gray-700 text-xs font-black">OR JOIN</span></div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Enter Room ID</label>
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={joinId} 
                      onChange={e => setJoinId(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                      placeholder="IDを入力して参加..."
                      className="w-full bg-[#0c0c0e] border border-[#2a2a32] rounded-2xl px-5 py-4 text-white font-mono placeholder-gray-800 focus:outline-none focus:border-indigo-500 transition-all text-sm"
                    />
                    <button 
                      onClick={handleJoinRoom}
                      disabled={loading || !joinId.trim() || !playerName.trim()}
                      className="absolute right-2 top-2 bottom-2 px-6 bg-[#2a2a32] hover:bg-indigo-600 text-white text-xs font-black rounded-xl transition-all disabled:opacity-20"
                    >
                      参加
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="text-center text-[10px] text-gray-700 font-bold uppercase tracking-widest animate-pulse">
            Ready to race? Set your name and get started.
          </div>
        </div>

        {/* Bottom Left: Code Input */}
        <div className="fixed bottom-4 left-4 z-20">
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider ml-1">Secret Code</label>
            <div className="flex items-center space-x-2">
              <input 
                type="text" 
                value={secretCode} 
                onChange={(e) => setSecretCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSecretCode()}
                placeholder="コードを入力..."
                className="bg-[#16161a] border border-[#2a2a32] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all w-40"
              />
              <button 
                onClick={handleSecretCode}
                className="bg-[#2a2a32] hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
              >
                送信
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Right: Patch Notes */}
        <div className="fixed bottom-4 right-4 z-20 flex flex-col items-end">
          {showPatchNotes && (
            <div className="bg-[#16161a] border border-[#2a2a32] rounded-2xl p-5 mb-3 w-80 shadow-2xl animate-fade-in origin-bottom-right">
              <h3 className="text-sm font-black text-white mb-4 border-b border-[#2a2a32] pb-2 flex items-center justify-between">
                <span>パッチノート</span>
                <span className="text-[10px] text-gray-500 bg-[#0c0c0e] px-2 py-1 rounded-full">最新情報</span>
              </h3>
              <ul className="space-y-4 text-xs text-gray-400 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                <li>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-indigo-400 font-bold">v1.0.1</span>
                    <span className="text-[9px] text-gray-600">May 2026</span>
                  </div>
                  <p className="leading-relaxed">正式公開！Web版「けいーば」へようこそ。シークレットコードによる隠し称号機能を追加しました。快適な競馬ライフをお楽しみください。</p>
                </li>
              </ul>
            </div>
          )}
          <button 
            onClick={() => setShowPatchNotes(!showPatchNotes)}
            className="flex items-center space-x-2 text-sm font-bold text-gray-400 hover:text-white transition-colors bg-[#16161a] hover:bg-[#2a2a32] px-5 py-2.5 rounded-xl border border-[#2a2a32] shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v10a2 2 0 01-2 2z" />
            </svg>
            <span>パッチノート</span>
            <svg className={`w-4 h-4 transition-transform ${showPatchNotes ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {phase === 'lobby' && <LobbyPhase />}
      {phase === 'setup' && <RaceSetupPhase />}
      {phase === 'betting' && <BettingPhase />}
      {phase === 'race' && <RacePhase />}
      {phase === 'result' && <ResultPhase />}
    </>
  );
}
