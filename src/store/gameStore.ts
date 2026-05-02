import { create } from 'zustand';
import type { HorseData, Bet } from '../core/odds_calculator';

export type GamePhase = 'login' | 'lobby' | 'setup' | 'betting' | 'race' | 'result';

export interface Participant {
  id: string; // Peer ID
  name: string;
  title: string;
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
}

interface GameState {
  phase: GamePhase;
  role: 'host' | 'guest' | null;
  roomId: string | null;
  playerName: string;
  playerTitle: string;
  ownedTitles: string[]; // List of title IDs
  participants: Participant[];
  horses: HorseData[];
  myCoins: number;
  myBets: Bet[];
  chatMessages: ChatMessage[];
  raceData: any | null;
  hostBetPool: Bet[];
  readyPlayers: string[];
  rematchVotes: { continue: string[]; end: string[] };
  roomSettings: RoomSettings;
  bettingEndTime: number | null;
  raceStartTime: number | null;
  isSpectator: boolean;
  roomCoinsInitialized: boolean;

  // Stats for unlocking titles
  stats: {
    totalWins: number;
    totalRaces: number;
    totalPayout: number;
    maxPayoutOdds: number;
  };

  // Actions
  setPlayerName: (name: string) => void;
  setPlayerTitle: (title: string) => void;
  unlockTitle: (titleId: string) => void;
  setPhase: (phase: GamePhase) => void;
  setRole: (role: 'host' | 'guest', roomId: string) => void;
  setRaceData: (data: any) => void;
  updateParticipants: (participants: Participant[]) => void;
  setReadyPlayers: (players?: string[]) => void;
  setHostBetPool: (bets: Bet[]) => void;
  updateHorses: (horses: HorseData[]) => void;
  addBet: (bet: Bet) => void;
  removeBet: (betId: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  resetBets: () => void;
  setRematchVotes: (votes: { continue: string[]; end: string[] }) => void;
  setRoomSettings: (settings: RoomSettings) => void;
  setBettingEndTime: (time: number | null) => void;
  setMyCoins: (coins: number) => void;
  setRoomCoinsInitialized: (val: boolean) => void;
  updateStats: (newStats: Partial<GameState['stats']>) => void;
  setRaceStartTime: (time: number | null) => void;
  setSpectator: (isSpectator: boolean) => void;
}

const savedName = localStorage.getItem('keiba_player_name') || 'プレイヤー';
const savedTitle = localStorage.getItem('keiba_player_title') || '初心者';
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
  },
  bettingEndTime: null,
  raceStartTime: null,
  isSpectator: false,
  roomCoinsInitialized: false,
  stats: savedStats,

  setPlayerName: (name) => {
    localStorage.setItem('keiba_player_name', name);
    set({ playerName: name });
  },
  setPlayerTitle: (title) => {
    localStorage.setItem('keiba_player_title', title);
    set({ playerTitle: title });
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
  resetBets: () => set({ myBets: [] }),
  setRematchVotes: (votes) => set({ rematchVotes: votes }),
  setRoomSettings: (settings) => set((state) => ({
    roomSettings: { ...state.roomSettings, ...settings }
  })),
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
}));
