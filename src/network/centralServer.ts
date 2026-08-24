export interface CentralRaceSummary {
  id: string;
  grade: 'G1' | 'G2' | 'G3' | 'GENERAL';
  startAt: number;
  bettingOpensAt: number;
  bettingClosesAt: number;
  status: 'scheduled' | 'betting' | 'closed' | 'running' | 'finished' | 'qualification_pending';
  horseCount: number;
}

export interface CentralStatus {
  ok: true;
  serverTime: number;
  participants: number;
  win5Participants: number;
  horsePool: {
    current: number;
    target: number;
    maximum: number;
  };
  nextRace: CentralRaceSummary;
  rules: {
    raceIntervalSeconds: number;
    bettingSeconds: number;
    g1EveryMinutes: number;
  };
}

const configuredBaseUrl = String(import.meta.env.VITE_CENTRAL_API_URL || '').replace(/\/$/, '');

export const centralApiBaseUrl = configuredBaseUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

export async function fetchCentralStatus(signal?: AbortSignal): Promise<CentralStatus> {
  if (!centralApiBaseUrl) throw new Error('central_server_not_configured');
  const response = await fetch(`${centralApiBaseUrl}/api/central/status`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`central_server_${response.status}`);
  const status = await response.json() as CentralStatus;
  if (!status.ok) throw new Error('central_server_invalid_response');
  return status;
}
