export type CentralGrade = 'G1' | 'G2' | 'G3' | 'GENERAL';
export type CentralRaceStatus = 'scheduled' | 'betting' | 'closed' | 'running' | 'finished' | 'qualification_pending';
export type CentralBetType = '単勝' | '複勝' | '馬連' | 'ワイド' | '馬単' | '3連複' | '3連単';

export interface CentralHorse {
  id: number;
  name: string;
  horse_number: number;
  age: number;
  gender: string;
  running_style: string;
  condition: string;
  jockey_name: string;
  coat_color: string;
  rarity: string;
  speed: number;
  stamina: number;
  power: number;
  burst: number;
  guts: number;
  wisdom: number;
  distance_apt: Record<string, string>;
  weight: number;
  weight_change: number;
  rating: number;
  central_earnings: number;
  total_races: number;
  wins: number;
  odds_win?: number;
  odds_place?: number;
  popularity?: number;
}

export interface CentralRaceSummary {
  id: string;
  grade: CentralGrade;
  startAt: number;
  bettingOpensAt: number;
  bettingClosesAt: number;
  status: CentralRaceStatus;
  horseCount: number;
}

export interface CentralRace extends CentralRaceSummary {
  horses: CentralHorse[];
  conditions: { distance: number; fieldCondition: string; weather: string; courseFeature: string };
  simulation?: {
    distance?: number;
    field_condition?: string;
    weather?: string;
    course_feature?: string;
    results?: Array<{ horse_number: number; horse_name?: string; time?: number; margin?: string }>;
    [key: string]: unknown;
  };
}

export interface CentralBet {
  id: string;
  betType: CentralBetType;
  horseNumbers: number[];
  amount: number;
}

export interface CentralSettlement {
  id: string;
  raceId: string;
  kind: 'payout' | 'loss';
  amount: number;
  details: {
    grade: CentralGrade;
    results: Array<{ horse_number: number; horse_name?: string }>;
    bets: Array<CentralBet & { isHit: boolean; payoutOdds: number; payout: number }>;
  };
  createdAt: number;
}

export interface CentralMe {
  ok: true;
  serverTime: number;
  balance: number;
  tickets: Array<{ raceId: string; bets: CentralBet[]; reservedAmount: number; status: string; updatedAt: number }>;
  settlements: CentralSettlement[];
}

export interface CentralStatus {
  ok: true;
  serverTime: number;
  participants: number;
  win5Participants: number;
  horsePool: { current: number; target: number; maximum: number };
  nextRace: CentralRaceSummary;
  rules: { raceIntervalSeconds: number; bettingSeconds: number; g1EveryMinutes: number };
}

export interface CentralSyncResponse {
  ok: true;
  serverTime: number;
  race: CentralRace;
  me: CentralMe;
  status: CentralStatus;
}

const configuredBaseUrl = String(import.meta.env.VITE_CENTRAL_API_URL || '').replace(/\/$/, '');
export const centralApiBaseUrl = configuredBaseUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');
const PLAYER_ID_KEY = 'keiba_central_player_id';

export function getCentralPlayerId(): string {
  const stored = localStorage.getItem(PLAYER_ID_KEY);
  if (stored) return stored;
  const id = `player_${crypto.randomUUID().replaceAll('-', '')}`;
  localStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!centralApiBaseUrl) throw new Error('central_server_not_configured');
  const response = await fetch(`${centralApiBaseUrl}${path}`, { cache: 'no-store', ...init });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `central_server_${response.status}`);
  return data;
}

function post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal
  });
}

export function fetchCentralStatus(signal?: AbortSignal): Promise<CentralStatus> {
  return request('/api/central/status', { signal });
}

export async function fetchNextCentralRace(signal?: AbortSignal): Promise<CentralRace> {
  const response = await request<{ ok: true; race: CentralRace }>('/api/central/races/next', { signal });
  return response.race;
}

export async function fetchCentralRace(raceId: string, signal?: AbortSignal): Promise<CentralRace> {
  const response = await request<{ ok: true; race: CentralRace }>(`/api/central/races/${encodeURIComponent(raceId)}`, { signal });
  return response.race;
}

export function fetchCentralMe(signal?: AbortSignal): Promise<CentralMe> {
  return request(`/api/central/me?playerId=${encodeURIComponent(getCentralPlayerId())}`, { signal });
}

export function joinCentral(playerName: string, signal?: AbortSignal) {
  return post<{ ok: true; balance: number; participants: number; win5Participants: number }>('/api/central/join', {
    playerId: getCentralPlayerId(), playerName: playerName.trim() || 'ゲスト', win5Active: false
  }, signal);
}

export function heartbeatCentral(playerName: string, signal?: AbortSignal) {
  return post('/api/central/heartbeat', {
    playerId: getCentralPlayerId(), playerName: playerName.trim() || 'ゲスト', win5Active: false
  }, signal);
}

export function syncCentral(playerName: string, signal?: AbortSignal): Promise<CentralSyncResponse> {
  return post('/api/central/sync', {
    playerId: getCentralPlayerId(), playerName: playerName.trim() || 'ゲスト', win5Active: false
  }, signal);
}

export function leaveCentral(): Promise<unknown> {
  return post('/api/central/leave', { playerId: getCentralPlayerId() });
}

export function replaceCentralBets(raceId: string, bets: CentralBet[]): Promise<{ ok: true; balance: number; bets: CentralBet[]; reservedAmount: number }> {
  return post('/api/central/bets', { playerId: getCentralPlayerId(), raceId, bets });
}

export function acknowledgeCentralSettlements(settlementIds: string[]): Promise<unknown> {
  return post('/api/central/settlements/ack', { playerId: getCentralPlayerId(), settlementIds });
}
