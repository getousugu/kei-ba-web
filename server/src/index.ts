import { DurableObject } from 'cloudflare:workers';
import horseNamesData from '../../src/data/horse_names.json';
import jockeyNamesData from '../../src/data/jockey_names.json';

const ACTIVE_PLAYER_TTL_MS = 90_000;
const RACE_INTERVAL_MS = 5 * 60_000;
const BETTING_TIME_MS = 120_000;
const INITIAL_POOL_SIZE = 800;
const MAX_POOL_SIZE = 1_000;
const SEED_BATCH_SIZE = 100;
const FIELD_SIZE = 12;

type RaceGrade = 'G1' | 'G2' | 'G3' | 'GENERAL';
type SqlRow = Record<string, SqlStorageValue>;

interface Env {
  CENTRAL_RACECOURSE: DurableObjectNamespace<CentralRacecourse>;
}

interface CentralHorse {
  id: number;
  name: string;
  age: number;
  gender: string;
  coat_color: string;
  rarity: string;
  growth_type: string;
  running_style: string;
  condition: string;
  speed: number;
  stamina: number;
  power: number;
  burst: number;
  guts: number;
  wisdom: number;
  distance_apt: Record<string, string>;
  field_apt: Record<string, string>;
  course_apt: Record<string, string>;
  jockey_name: string;
  weight: number;
  weight_change: number;
  rating: number;
  total_races: number;
  wins: number;
  central_earnings: number;
  is_named_horse: boolean;
  owner_player_id?: string;
  horse_number?: number;
}

interface RaceRecord {
  id: string;
  grade: RaceGrade;
  startAt: number;
  bettingOpensAt: number;
  bettingClosesAt: number;
  status: 'scheduled' | 'betting' | 'closed' | 'running' | 'finished' | 'qualification_pending';
  horseCount: number;
  horses?: CentralHorse[];
}

const PREFIXES = [
  'アーク', 'アサヒ', 'アストラ', 'アドマイヤ', 'アルカナ', 'イースト', 'ウイン', 'エア', 'エターナル', 'エンペラー',
  'オーシャン', 'オリエント', 'カレン', 'キング', 'グランド', 'グリーン', 'クロノ', 'ゴールド', 'サクラ', 'サザン',
  'サンライズ', 'シゲル', 'シャイニング', 'シルバー', 'スカイ', 'スター', 'スノー', 'セイウン', 'ソウル', 'ダーク',
  'ダイヤ', 'テイエム', 'ディープ', 'トーセン', 'ドラゴン', 'ナイト', 'ネオ', 'ノーブル', 'ハーツ', 'ハイランド',
  'ビクトリー', 'フェアリー', 'ブラック', 'ブルー', 'ブレイブ', 'ホワイト', 'マイネル', 'ミッドナイト', 'メイショウ', 'モーニング',
  'ライト', 'ラッキー', 'リバティ', 'レッド', 'ロイヤル', 'ワイルド'
];

const SUFFIXES = [
  'アロー', 'ウイング', 'エース', 'オーラ', 'カイザー', 'キング', 'グローリー', 'コメット', 'サンダー', 'シャドウ',
  'ジャーニー', 'スピリット', 'スター', 'ストーム', 'ソング', 'ソード', 'ダンサー', 'チェイサー', 'ドリーム', 'ナイト',
  'ノヴァ', 'ハート', 'ハヤテ', 'バロン', 'ビート', 'ファルコン', 'フェザー', 'フォース', 'フラッシュ', 'ブリーズ',
  'ブレイド', 'ホープ', 'ボルト', 'マスター', 'ミラクル', 'ムーン', 'メロディ', 'ライジング', 'ライト', 'ランナー',
  'リーフ', 'レイ', 'レジェンド', 'ロード', 'ロマン', 'ワールド'
];

const COAT_COLORS = ['鹿毛', '黒鹿毛', '栗毛', '芦毛', '青鹿毛', '青毛'];
const GENDERS = ['牡', '牝', 'セン'];
const STYLES = ['逃げ', '先行', '差し', '追込'];
const APTITUDE_RANKS = ['A', 'B', 'C', 'D', 'E'];

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function gradeForTime(startAt: number): RaceGrade {
  const minute = new Date(startAt).getUTCMinutes();
  if (minute === 0) return 'G1';
  if (minute === 30) return 'G2';
  if (minute === 15 || minute === 45) return 'G3';
  return 'GENERAL';
}

function nextRaceStart(now: number): number {
  return (Math.floor(now / RACE_INTERVAL_MS) + 1) * RACE_INTERVAL_MS;
}

function createSeededRandom(seed: number): () => number {
  let value = seed | 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4_294_967_296;
  };
}

function normal(random: () => number, mean: number, std: number): number {
  const u = Math.max(Number.EPSILON, random());
  const v = Math.max(Number.EPSILON, random());
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std;
}

function allHorseNames(): string[] {
  return [...new Set(Object.values(horseNamesData.categories).flat())];
}

const BASE_HORSE_NAMES = allHorseNames();
const JOCKEYS = jockeyNamesData.jockeys.map((jockey) => jockey.name);

function uniqueHorseName(index: number): string {
  if (index < BASE_HORSE_NAMES.length) return BASE_HORSE_NAMES[index];
  const combination = index - BASE_HORSE_NAMES.length;
  const prefix = PREFIXES[Math.floor(combination / SUFFIXES.length) % PREFIXES.length];
  const suffix = SUFFIXES[combination % SUFFIXES.length];
  return `${prefix}${suffix}`;
}

function aptitudeMap(random: () => number, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, APTITUDE_RANKS[Math.min(4, Math.floor(random() * 5))]]));
}

function generateHorse(index: number): Omit<CentralHorse, 'id'> {
  const random = createSeededRandom(0x4b454942 ^ ((index + 1) * 2_654_435_761));
  const rarityRoll = random();
  const rarity = rarityRoll < 0.01 ? 'Legendary' : rarityRoll < 0.08 ? 'Epic' : rarityRoll < 0.30 ? 'Rare' : 'Common';
  const mean = rarity === 'Legendary' ? 78 : rarity === 'Epic' ? 68 : rarity === 'Rare' ? 58 : 48;
  const std = rarity === 'Common' ? 13 : 10;
  const stat = () => Math.max(10, Math.min(100, Math.round(normal(random, mean, std))));

  return {
    name: uniqueHorseName(index),
    age: 3 + Math.floor(random() * 5),
    gender: GENDERS[Math.floor(random() * GENDERS.length)],
    coat_color: COAT_COLORS[Math.floor(random() * COAT_COLORS.length)],
    rarity,
    growth_type: ['早熟', '普通', '晩成'][Math.floor(random() * 3)],
    running_style: STYLES[Math.floor(random() * STYLES.length)],
    condition: '普通',
    speed: stat(),
    stamina: stat(),
    power: stat(),
    burst: stat(),
    guts: stat(),
    wisdom: stat(),
    distance_apt: aptitudeMap(random, ['短距離', 'マイル', '中距離', '長距離']),
    field_apt: aptitudeMap(random, ['良', '稍重', '重', '不良']),
    course_apt: aptitudeMap(random, ['左回り', '右回り', '直線']),
    jockey_name: JOCKEYS[index % JOCKEYS.length] || '中央所属',
    weight: 420 + Math.floor(random() * 141),
    weight_change: 0,
    rating: rarity === 'Legendary' ? 1600 : rarity === 'Epic' ? 1400 : rarity === 'Rare' ? 1200 : 1000,
    total_races: 0,
    wins: 0,
    central_earnings: 0,
    is_named_horse: false
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return withCors(json({ ok: true, service: 'kei-ba-central', serverTime: Date.now() }));
    }
    if (!url.pathname.startsWith('/api/central/')) {
      return withCors(json({ ok: false, error: 'not_found' }, { status: 404 }));
    }

    const id = env.CENTRAL_RACECOURSE.idFromName('main');
    const response = await env.CENTRAL_RACECOURSE.get(id).fetch(request);
    return withCors(response);
  }
} satisfies ExportedHandler<Env>;

export class CentralRacecourse extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.createSchema();
      this.seedHorseBatch(SEED_BATCH_SIZE);
      await this.scheduleMaintenance();
    });
  }

  private createSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS horses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL,
        central_earnings INTEGER NOT NULL DEFAULT 0,
        total_races INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        is_named_horse INTEGER NOT NULL DEFAULT 0,
        owner_player_id TEXT,
        last_race_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS horses_earnings ON horses (central_earnings DESC);
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        last_seen INTEGER NOT NULL,
        win5_active INTEGER NOT NULL DEFAULT 0,
        named_horse_name TEXT
      );
      CREATE INDEX IF NOT EXISTS players_last_seen ON players (last_seen);
      CREATE TABLE IF NOT EXISTS races (
        id TEXT PRIMARY KEY,
        grade TEXT NOT NULL,
        start_at INTEGER NOT NULL,
        betting_opens_at INTEGER NOT NULL,
        betting_closes_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        horses_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS races_start_at ON races (start_at);
    `);
  }

  private horseCount(): number {
    const rows = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM horses').toArray();
    return Number(rows[0]?.count || 0);
  }

  private seedHorseBatch(batchSize: number): number {
    const before = this.horseCount();
    const target = Math.min(INITIAL_POOL_SIZE, before + batchSize);
    const existingNames = new Set(
      this.ctx.storage.sql.exec<{ name: string }>('SELECT name FROM horses').toArray().map((row) => row.name)
    );
    let sourceIndex = 0;

    while (existingNames.size < target && sourceIndex < MAX_POOL_SIZE * 4) {
      const horse = generateHorse(sourceIndex);
      sourceIndex += 1;
      if (existingNames.has(horse.name)) continue;
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO horses
          (name, data, central_earnings, total_races, wins, is_named_horse)
         VALUES (?, ?, 0, 0, 0, 0)`,
        horse.name,
        JSON.stringify(horse)
      );
      existingNames.add(horse.name);
    }
    return this.horseCount();
  }

  private async scheduleMaintenance(): Promise<void> {
    const delay = this.horseCount() < INITIAL_POOL_SIZE ? 5_000 : 60_000;
    await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  async alarm(): Promise<void> {
    if (this.horseCount() < INITIAL_POOL_SIZE) this.seedHorseBatch(SEED_BATCH_SIZE);
    this.cleanupPlayers(Date.now());
    this.ctx.storage.sql.exec('DELETE FROM races WHERE start_at < ?', Date.now() - 24 * 60 * 60_000);
    await this.scheduleMaintenance();
  }

  private cleanupPlayers(now: number): void {
    this.ctx.storage.sql.exec('DELETE FROM players WHERE last_seen < ?', now - ACTIVE_PLAYER_TTL_MS);
  }

  private activeCounts(now: number): { players: number; win5: number } {
    this.cleanupPlayers(now);
    const rows = this.ctx.storage.sql.exec<{ players: number; win5: number }>(
      `SELECT COUNT(*) AS players,
              COALESCE(SUM(CASE WHEN win5_active = 1 THEN 1 ELSE 0 END), 0) AS win5
       FROM players WHERE last_seen >= ?`,
      now - ACTIVE_PLAYER_TTL_MS
    ).toArray();
    return { players: Number(rows[0]?.players || 0), win5: Number(rows[0]?.win5 || 0) };
  }

  private parseHorseRow(row: SqlRow): CentralHorse {
    const data = JSON.parse(String(row.data)) as Omit<CentralHorse, 'id'>;
    return {
      ...data,
      id: Number(row.id),
      central_earnings: Number(row.central_earnings || 0),
      total_races: Number(row.total_races || 0),
      wins: Number(row.wins || 0),
      is_named_horse: Number(row.is_named_horse || 0) === 1,
      owner_player_id: row.owner_player_id ? String(row.owner_player_id) : undefined
    };
  }

  private weightedField(grade: RaceGrade): CentralHorse[] {
    const condition = grade === 'G1' ? 'WHERE central_earnings > 0' : '';
    const rows = this.ctx.storage.sql.exec<SqlRow>(
      `SELECT id, data, central_earnings, total_races, wins, is_named_horse, owner_player_id
       FROM horses ${condition}`
    ).toArray();
    const candidates = rows.map((row) => this.parseHorseRow(row));
    const maxEarnings = Math.max(1, ...candidates.map((horse) => horse.central_earnings));
    const selected: CentralHorse[] = [];

    while (candidates.length > 0 && selected.length < FIELD_SIZE) {
      const weights = candidates.map((horse) => 1 + 0.05 * (horse.central_earnings / maxEarnings));
      const total = weights.reduce((sum, value) => sum + value, 0);
      let roll = Math.random() * total;
      let chosenIndex = candidates.length - 1;
      for (let index = 0; index < weights.length; index += 1) {
        roll -= weights[index];
        if (roll <= 0) {
          chosenIndex = index;
          break;
        }
      }
      selected.push(candidates.splice(chosenIndex, 1)[0]);
    }

    return selected.map((horse, index) => ({ ...horse, horse_number: index + 1 }));
  }

  private ensureRace(startAt: number): RaceRecord {
    const id = new Date(startAt).toISOString();
    const existing = this.ctx.storage.sql.exec<SqlRow>(
      'SELECT * FROM races WHERE id = ?', id
    ).toArray()[0];
    if (existing) return this.raceFromRow(existing, true);

    const grade = gradeForTime(startAt);
    const horses = this.weightedField(grade);
    const bettingOpensAt = startAt - BETTING_TIME_MS;
    const status = grade === 'G1' && horses.length < FIELD_SIZE
      ? 'qualification_pending'
      : Date.now() < bettingOpensAt ? 'scheduled' : 'betting';
    this.ctx.storage.sql.exec(
      `INSERT INTO races
        (id, grade, start_at, betting_opens_at, betting_closes_at, status, horses_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      grade,
      startAt,
      bettingOpensAt,
      startAt,
      status,
      JSON.stringify(horses),
      Date.now()
    );
    return { id, grade, startAt, bettingOpensAt, bettingClosesAt: startAt, status, horseCount: horses.length, horses };
  }

  private raceFromRow(row: SqlRow, includeHorses: boolean): RaceRecord {
    const horses = JSON.parse(String(row.horses_json)) as CentralHorse[];
    const now = Date.now();
    const storedStatus = String(row.status) as RaceRecord['status'];
    const startAt = Number(row.start_at);
    const status = storedStatus === 'qualification_pending'
      ? storedStatus
      : now >= startAt ? 'running'
        : now < Number(row.betting_opens_at) ? 'scheduled'
          : now >= Number(row.betting_closes_at) ? 'closed'
            : 'betting';
    return {
      id: String(row.id),
      grade: String(row.grade) as RaceGrade,
      startAt,
      bettingOpensAt: Number(row.betting_opens_at),
      bettingClosesAt: Number(row.betting_closes_at),
      status,
      horseCount: horses.length,
      ...(includeHorses ? { horses } : {})
    };
  }

  private async readBody(request: Request): Promise<Record<string, unknown>> {
    try {
      return await request.json<Record<string, unknown>>();
    } catch {
      return {};
    }
  }

  private validPlayer(body: Record<string, unknown>): { id: string; name: string } | null {
    const id = String(body.playerId || '').trim();
    const name = String(body.playerName || '').trim().slice(0, 16);
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id) || !name) return null;
    return { id, name };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();

    if (request.method === 'GET' && url.pathname === '/api/central/status') {
      const counts = this.activeCounts(now);
      const race = this.ensureRace(nextRaceStart(now));
      return json({
        ok: true,
        serverTime: now,
        participants: counts.players,
        win5Participants: counts.win5,
        horsePool: { current: this.horseCount(), target: INITIAL_POOL_SIZE, maximum: MAX_POOL_SIZE },
        nextRace: { ...race, horses: undefined },
        rules: { raceIntervalSeconds: RACE_INTERVAL_MS / 1_000, bettingSeconds: BETTING_TIME_MS / 1_000, g1EveryMinutes: 60 }
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/central/races/next') {
      return json({ ok: true, serverTime: now, race: this.ensureRace(nextRaceStart(now)) });
    }

    if (request.method === 'POST' && ['/api/central/join', '/api/central/heartbeat'].includes(url.pathname)) {
      const body = await this.readBody(request);
      const player = this.validPlayer(body);
      if (!player) return json({ ok: false, error: 'invalid_player' }, { status: 400 });
      const win5Active = body.win5Active === true ? 1 : 0;
      const namedHorseName = typeof body.namedHorseName === 'string' ? body.namedHorseName.trim().slice(0, 24) : null;
      this.ctx.storage.sql.exec(
        `INSERT INTO players (id, name, last_seen, win5_active, named_horse_name)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           last_seen = excluded.last_seen,
           win5_active = excluded.win5_active,
           named_horse_name = excluded.named_horse_name`,
        player.id,
        player.name,
        now,
        win5Active,
        namedHorseName
      );
      const counts = this.activeCounts(now);
      return json({ ok: true, serverTime: now, participants: counts.players, win5Participants: counts.win5 });
    }

    if (request.method === 'POST' && url.pathname === '/api/central/leave') {
      const body = await this.readBody(request);
      const id = String(body.playerId || '');
      if (id) this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', id);
      return json({ ok: true, serverTime: now });
    }

    return json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}
