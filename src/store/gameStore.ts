import { create } from 'zustand';
import type { HorseData, Bet } from '../core/odds_calculator';
import type { RaceData } from '../core/race_simulator';

export type GamePhase = 'login' | 'lobby' | 'setup' | 'betting' | 'race' | 'result';

export interface Participant {
  id: string; // Peer ID
  name: string;
  title: string;
  titleId?: string; // ID for coloring
  coins: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

export interface RoomSettings {
  participantLimit: number;
  coinRule: 'global' | 'room';
  npcEnabled: boolean;
  bettingTime: number;
  horseCount: number;
  distance: string;
  fieldCondition: string;
  weather: string;
  hostMigration: boolean;
  realOdds: boolean;
}

interface GameState {
  phase: GamePhase;
  role: 'host' | 'guest' | null;
  roomId: string | null;
  playerName: string;
  playerTitle: string;
  playerTitleId: string;
  ownedTitles: string[]; // List of title IDs
  participants: Participant[];
  horses: HorseData[];
  myCoins: number;
  myBets: Bet[];
  chatMessages: ChatMessage[];
  raceData: RaceData | null;
  hostBetPool: Bet[];
  readyPlayers: string[];
  rematchVotes: { continue: string[]; end: string[] };
  roomSettings: RoomSettings;
  bettingEndTime: number | null;
  raceStartTime: number | null;
  isSpectator: boolean;
  roomCoinsInitialized: boolean;
  roomCarryover: number;

  // WIN5 (サバイバルモード) 用のState
  win5Data: {
    isActive: boolean;
    currentRace: number; // 1-5
    totalPrize: number;
    minEntryFee: number;
    survivors: string[]; // 生き残っているプレイヤーのID
    isCompleted: boolean;
  } | null;
  stats: {
    totalWins: number;
    totalRaces: number;
    totalPayout: number;
    maxPayoutOdds: number;
  };

  // Actions
  setPlayerName: (name: string) => void;
  setPlayerTitle: (name: string, id?: string) => void;
  unlockTitle: (titleId: string) => void;
  setPhase: (phase: GamePhase) => void;
  setRole: (role: 'host' | 'guest', roomId: string) => void;
  setRaceData: (data: RaceData | null) => void;
  updateParticipants: (participants: Participant[]) => void;
  setReadyPlayers: (players?: string[]) => void;
  setHostBetPool: (bets: Bet[]) => void;
  updateHorses: (horses: HorseData[]) => void;
  addBet: (bet: Bet) => void;
  removeBet: (betId: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearNpcChatMessages: () => void;
  resetBets: () => void;
  setRematchVotes: (votes: { continue: string[]; end: string[] }) => void;
  setRoomSettings: (settings: RoomSettings) => void;
  setBettingEndTime: (time: number | null) => void;
  setMyCoins: (coins: number) => void;
  setRoomCoinsInitialized: (val: boolean) => void;
  updateStats: (newStats: Partial<GameState['stats']>) => void;
  setRaceStartTime: (time: number | null) => void;
  setSpectator: (isSpectator: boolean) => void;
  setWin5Data: (data: GameState['win5Data']) => void;
  setRoomCarryover: (val: number) => void;
}

const savedName = localStorage.getItem('keiba_player_name') || 'プレイヤー';
const savedTitle = localStorage.getItem('keiba_player_title') || '初心者';
const savedTitleId = localStorage.getItem('keiba_player_title_id') || 'beginner';
// Imp-17: localStorage 破損時のフェイルセーフ
let savedOwnedTitles = ['beginner', 'title_collector'];
try {
  const t = localStorage.getItem('keiba_owned_titles');
  if (t) {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) {
      savedOwnedTitles = [...new Set([...parsed, 'beginner', 'title_collector'])];
    }
  }
} catch (e) { console.error('Failed to parse titles', e); }

let savedStats = {
  totalRaces: 0, totalWins: 0, totalPayout: 0, maxPayoutOdds: 0,
};
try {
  const s = localStorage.getItem('keiba_player_stats');
  if (s) savedStats = JSON.parse(s);
} catch (e) { console.error('Failed to parse stats', e); }

export const useGameStore = create<GameState>((set) => ({
  phase: 'login',
  role: null,
  roomId: null,
  playerName: savedName,
  playerTitle: savedTitle,
  playerTitleId: savedTitleId,
  ownedTitles: savedOwnedTitles,
  participants: [],
  horses: [],
  myCoins: 10000,
  myBets: [],
  chatMessages: [],
  raceData: null,
  hostBetPool: [],
  readyPlayers: [],
  rematchVotes: { continue: [], end: [] },
  roomSettings: {
    participantLimit: 12,
    coinRule: 'global',
    npcEnabled: true,
    bettingTime: 60,
    horseCount: 12,
    distance: 'random',
    fieldCondition: 'random',
    weather: 'random',
    hostMigration: true,
    realOdds: false,
  },
  bettingEndTime: null,
  raceStartTime: null,
  isSpectator: false,
  roomCoinsInitialized: false,
  roomCarryover: 0,
  win5Data: null,
  stats: savedStats,

  setPlayerName: (name) => {
    localStorage.setItem('keiba_player_name', name);
    set({ playerName: name });
  },
  setPlayerTitle: (name, id) => {
    localStorage.setItem('keiba_player_title', name);
    if (id) localStorage.setItem('keiba_player_title_id', id);
    set({ playerTitle: name, playerTitleId: id || 'beginner' });
  },
  unlockTitle: (titleId) => set((state) => {
    if (state.ownedTitles.includes(titleId)) return state;
    const next = [...state.ownedTitles, titleId];
    localStorage.setItem('keiba_owned_titles', JSON.stringify(next));
    return { ownedTitles: next };
  }),
  setPhase: (phase) => set({ phase }),
  setRole: (role, roomId) => set({ role, roomId }),
  setRaceData: (data) => set({ raceData: data }),
  updateParticipants: (participants) => set({ participants }),
  setHostBetPool: (bets) => set({ hostBetPool: bets }),
  setReadyPlayers: (players = []) => set({ readyPlayers: players }),
  updateHorses: (horses) => set({ horses }),
  addBet: (bet) => set((state) => ({ myBets: [...state.myBets, bet] })),
  removeBet: (betId) => set((state) => ({ myBets: state.myBets.filter(b => b.id !== betId) })),
  addChatMessage: (msg) => set((state) => {
    if (state.chatMessages.some(m => m.id === msg.id)) return state;
    return { chatMessages: [...state.chatMessages, msg].slice(-100) };
  }),
  clearNpcChatMessages: () => set((state) => ({
    chatMessages: state.chatMessages.filter(m => !m.text.startsWith('[NPC]'))
  })),
  resetBets: () => set({ myBets: [] }),
  setRematchVotes: (votes) => set({ rematchVotes: votes }),
   setRoomSettings: (settings) => set((state) => {
     const nextSettings = { ...state.roomSettings, ...settings };
     
     // ルール変更時のコイン処理
     if (settings.coinRule && settings.coinRule !== state.roomSettings.coinRule) {
       if (settings.coinRule === 'room') {
         // ルームモードに切り替え: まだ初期化されていなければ10000にリセット
         if (!state.roomCoinsInitialized) {
           setTimeout(() => {
             useGameStore.getState().setMyCoins(10000);
             useGameStore.getState().setRoomCoinsInitialized(true);
           }, 0);
         }
       } else if (settings.coinRule === 'global') {
         // グローバルモードに切り替え: DBから最新の値を読み込む
         import('../db/db').then(({ db }) => {
           db.players.get('me').then(me => {
             if (me) {
               useGameStore.getState().setMyCoins(me.global_coins);
               useGameStore.getState().setRoomCoinsInitialized(false);
             }
           });
         });
       }
     }
     
     return { roomSettings: nextSettings };
   }),
  setBettingEndTime: (bettingEndTime) => set({ bettingEndTime }),
  setMyCoins: (myCoins) => {
    set({ myCoins });
    // Imp-10: coinRule が 'global' の場合のみDBにも永続化する
    const rule = useGameStore.getState().roomSettings.coinRule;
    if (rule === 'global') {
      import('../db/db').then(({ db }) => {
        db.players.update('me', { global_coins: myCoins }).catch(() => {});
      });
    }
  },
  setRoomCoinsInitialized: (roomCoinsInitialized) => set({ roomCoinsInitialized }),
  updateStats: (newStats) => set((state) => {
    const next = { ...state.stats, ...newStats };
    localStorage.setItem('keiba_player_stats', JSON.stringify(next));
    return { stats: next };
  }),
  setRaceStartTime: (raceStartTime) => set({ raceStartTime }),
  setSpectator: (isSpectator) => set({ isSpectator }),
  setWin5Data: (win5Data) => set({ win5Data }),
  setRoomCarryover: (roomCarryover) => set({ roomCarryover }),
}));
