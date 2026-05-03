import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { peerManager } from '../network/peerManager';

export default function LobbyPhase() {
  const {
    role, roomId, participants, chatMessages, addChatMessage, roomSettings, setRoomSettings, setPhase
  } = useGameStore();

  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isHost = role === 'host';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleUpdateSettings = (key: string, value: any) => {
    if (!isHost) return;
    const next = { ...roomSettings, [key]: value };
    setRoomSettings(next);
    peerManager.broadcast({ type: 'update_room_settings', settings: next });
  };

  const handleSendChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sender: useGameStore.getState().playerName,
      text: chatInput.trim(),
      timestamp: Date.now()
    };
    addChatMessage(msg);
    peerManager.sendToHost({ type: 'chat', msg });
    setChatInput('');
  };

  const handleStartSetup = () => {
    if (!isHost) return;
    peerManager.broadcast({ type: 'phase_start', phase: 'setup' });
    setPhase('setup');
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(roomId || '');
    alert('ルームIDをコピーしました');
  };

  return (
    <div className="h-screen flex flex-col bg-[#0c0c0e] text-gray-200 overflow-hidden font-sans">

      {/* Header */}
      <header className="h-14 bg-[#16161a] border-b border-[#2a2a32] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]" />
          <h2 className="font-black text-white tracking-widest uppercase text-sm">Lobby</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg border border-[#2a2a32]">
            <span className="text-[10px] text-gray-400 font-black uppercase">Room ID</span>
            <span className="font-mono text-sm text-indigo-400 font-bold">{roomId}</span>
            <button onClick={handleCopyId} className="hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">

        {/* Left: Room Settings (Meta) */}
        <div className="w-72 border-r border-[#2a2a32] bg-[#111114] flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-[#2a2a32] bg-white/5">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
              Room Settings
            </h3>
          </div>
          <div className="p-5 space-y-6">
            <section>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">最大参加人数</label>
              <select
                value={roomSettings.participantLimit}
                onChange={e => handleUpdateSettings('participantLimit', parseInt(e.target.value))}
                disabled={!isHost}
                className="w-full bg-[#1c1c21] border border-[#2a2a32] rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                {[2, 4, 8, 12, 16, 32, 50].map(n => <option key={n} value={n}>{n}名まで</option>)}
              </select>
            </section>

            <section>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">NPCの参戦</label>
              <div className="flex items-center justify-between p-3 bg-[#1c1c21] border border-[#2a2a32] rounded-xl">
                <span className="text-xs font-bold text-gray-200">{roomSettings.npcEnabled ? 'ON (自動補充)' : 'OFF (対人のみ)'}</span>
                <button
                  onClick={() => handleUpdateSettings('npcEnabled', !roomSettings.npcEnabled)}
                  disabled={!isHost}
                  className={`w-10 h-5 rounded-full transition-all relative ${roomSettings.npcEnabled ? 'bg-indigo-600' : 'bg-gray-700'} disabled:opacity-30`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${roomSettings.npcEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </section>

            <section>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">所持金ルール</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'global', label: 'グローバル (累積)', desc: '過去の戦績を引き継ぐ' },
                  { id: 'room', label: 'ルーム (固定)', desc: '全員10,000Cから開始' }
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleUpdateSettings('coinRule', r.id)}
                    disabled={!isHost}
                    className={`p-3 rounded-xl text-left transition-all border ${roomSettings.coinRule === r.id ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-[#1c1c21] border-[#2a2a32] text-gray-500 hover:border-gray-400'} disabled:opacity-50`}
                  >
                    <div className="text-[11px] font-black">{r.label}</div>
                    <div className="text-[9px] opacity-70 font-bold mt-0.5">{r.desc}</div>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">ホスト自動移譲</label>
              <div className="flex items-center justify-between p-3 bg-[#1c1c21] border border-[#2a2a32] rounded-xl">
                <span className="text-[10px] text-gray-300 font-bold leading-tight mr-4">ホスト切断時に次のプレイヤーが引き継ぐ</span>
                <button
                  onClick={() => handleUpdateSettings('hostMigration', !roomSettings.hostMigration)}
                  disabled={!isHost}
                  className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${roomSettings.hostMigration ? 'bg-indigo-600' : 'bg-gray-700'} disabled:opacity-30`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${roomSettings.hostMigration ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* Center: Participants */}
        <div className="flex-1 flex flex-col bg-[#0c0c0e]">
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-gray-300 uppercase tracking-[0.2em]">Participants</h3>
                <span className="text-[10px] font-mono text-gray-400 tabular">{participants.length} / {roomSettings.participantLimit} Players</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {participants.map(p => (
                  <div key={p.id} className="panel rounded-2xl flex items-center justify-between px-6 py-4 animate-fade-in hover:border-indigo-500/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl shadow-inner border border-white/5">
                        👤
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white">{p.name}</span>
                          <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">{p.title}</span>
                          {p.id === 'host' && <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-black border border-indigo-500/20 tracking-widest">HOST</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e]" />
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Connected</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Balance</div>
                      <div className="font-mono text-lg font-black text-yellow-500 tabular">{p.coins.toLocaleString()} <span className="text-xs ml-0.5">C</span></div>
                    </div>
                  </div>
                ))}
                {participants.length < roomSettings.participantLimit && Array.from({ length: Math.min(3, roomSettings.participantLimit - participants.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="border-2 border-dashed border-[#2a2a32] rounded-2xl px-6 py-4 flex items-center justify-center opacity-30">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Empty Slot</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="h-24 border-t border-[#2a2a32] bg-[#16161a] flex items-center justify-center px-8">
            {isHost ? (
              <button
                onClick={handleStartSetup}
                className="w-full max-w-sm py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 uppercase tracking-[0.3em] text-sm"
              >
                Go to Race Setup
              </button>
            ) : (
              <div className="text-center animate-pulse">
                <span className="text-sm font-black text-gray-400 uppercase tracking-[0.4em]">Waiting for Host to start...</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Lobby Chat */}
        <div className="w-80 border-l border-[#2a2a32] bg-[#111114] flex flex-col">
          <div className="p-4 border-b border-[#2a2a32] bg-white/5 shrink-0">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Lobby Chat
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {chatMessages.length === 0 && <div className="text-center py-20 text-gray-700 text-xs italic">メッセージはありません</div>}
            {chatMessages.map((msg, i) => (
              <div key={i} className="animate-fade-in">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">{msg.sender}</span>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-2xl px-4 py-2 text-xs text-gray-200 leading-relaxed font-medium">
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-[#16161a] border-t border-[#2a2a32]">
            <form onSubmit={handleSendChat} className="relative">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="メッセージを入力..."
                className="w-full bg-[#0c0c0e] border border-[#2a2a32] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all pr-12"
              />
              <button
                type="submit"
                className="absolute right-2 top-2 bottom-2 px-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all active:scale-90"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
