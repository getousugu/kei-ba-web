import { DurableObject } from 'cloudflare:workers';
import horseNamesData from '../../src/data/horse_names.json';
import jockeyNamesData from '../../src/data/jockey_names.json';
import { raceSimulator } from '../../src/core/race_simulator';
import { oddsCalculator } from '../../src/core/odds_calculator';

const ACTIVE_PLAYER_TTL_MS = 90_000;
const RACE_INTERVAL_MS = 5 * 60_000;
// 中央競馬場は常に次回レースを発売する。1枠前の発走と同時に次枠を開く。
const BETTING_TIME_MS = RACE_INTERVAL_MS;
const INITIAL_POOL_SIZE = 800;
const MAX_POOL_SIZE = 1_000;
const SEED_BATCH_SIZE = 100;
const FIELD_SIZE = 12;
const STARTING_BALANCE = 10_000;
const VALID_BET_TYPES = ['単勝', '複勝', '馬連', 'ワイド', '馬単', '3連複', '3連単'] as const;

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
  horse_number: number;
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
  conditions?: RaceConditions;
  simulation?: Record<string, unknown>;
}

interface RaceConditions {
  distance: number;
  fieldCondition: string;
  weather: string;
  courseFeature: string;
}

interface CentralBet {
  id: string;
  betType: typeof VALID_BET_TYPES[number];
  horseNumbers: number[];
  amount: number;
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

function generateHorse(index: number): Omit<CentralHorse, 'id' | 'horse_number'> {
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
      CREATE TABLE IF NOT EXISTS accounts (
        player_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 10000,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tickets (
        player_id TEXT NOT NULL,
        race_id TEXT NOT NULL,
        bets_json TEXT NOT NULL,
        reserved_amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, race_id)
      );
      CREATE INDEX IF NOT EXISTS tickets_race_status ON tickets (race_id, status);
      CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        race_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount INTEGER NOT NULL,
        details_json TEXT NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS settlements_player ON settlements (player_id, acknowledged, created_at);
    `);
    this.ensureRaceColumn('conditions_json', "TEXT NOT NULL DEFAULT '{}'");
    this.ensureRaceColumn('simulation_json', 'TEXT');
  }

  private ensureRaceColumn(name: string, definition: string): void {
    const columns = this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(races)').toArray();
    if (!columns.some((column) => column.name === name)) {
      this.ctx.storage.sql.exec(`ALTER TABLE races ADD COLUMN ${name} ${definition}`);
    }
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
    const now = Date.now();
    this.settleDueRaces(now);
    this.cleanupPlayers(now);
    this.ctx.storage.sql.exec('DELETE FROM races WHERE start_at < ?', now - 24 * 60 * 60_000);
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

  private raceConditions(): RaceConditions {
    const distances = [1200, 1400, 1600, 1800, 2000, 2200, 2400, 3000, 3200];
    const fields = ['良', '稍重', '重', '不良'];
    const weathers = ['晴', '曇', '雨', '雪'];
    const features = ['平坦', '坂あり', '直線長', 'コーナー多'];
    return {
      distance: distances[Math.floor(Math.random() * distances.length)],
      fieldCondition: fields[Math.floor(Math.random() * fields.length)],
      weather: weathers[Math.floor(Math.random() * weathers.length)],
      courseFeature: features[Math.floor(Math.random() * features.length)]
    };
  }

  private prepareRaceHorses(horses: CentralHorse[], conditions: RaceConditions): CentralHorse[] {
    const scored = horses.map((horse) => ({
      ...horse,
      score: oddsCalculator.calculateCompositeScore(
        horse,
        conditions.distance,
        conditions.fieldCondition,
        conditions.courseFeature
      )
    }));
    return oddsCalculator.calculateInitialOdds(scored, true) as CentralHorse[];
  }

  private ensureRace(startAt: number): RaceRecord {
    const id = new Date(startAt).toISOString();
    const existing = this.ctx.storage.sql.exec<SqlRow>(
      'SELECT * FROM races WHERE id = ?', id
    ).toArray()[0];
    if (existing) return this.raceFromRow(existing, true);

    const grade = gradeForTime(startAt);
    const conditions = this.raceConditions();
    const horses = this.prepareRaceHorses(this.weightedField(grade), conditions);
    const bettingOpensAt = startAt - BETTING_TIME_MS;
    const status = grade === 'G1' && horses.length < FIELD_SIZE
      ? 'qualification_pending'
      : Date.now() < bettingOpensAt ? 'scheduled' : 'betting';
    this.ctx.storage.sql.exec(
      `INSERT INTO races
        (id, grade, start_at, betting_opens_at, betting_closes_at, status, horses_json, conditions_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      grade,
      startAt,
      bettingOpensAt,
      startAt,
      status,
      JSON.stringify(horses),
      JSON.stringify(conditions),
      Date.now()
    );
    return { id, grade, startAt, bettingOpensAt, bettingClosesAt: startAt, status, horseCount: horses.length, horses, conditions };
  }

  private raceFromRow(row: SqlRow, includeHorses: boolean): RaceRecord {
    const horses = JSON.parse(String(row.horses_json)) as CentralHorse[];
    const conditions = JSON.parse(String(row.conditions_json || '{}')) as RaceConditions;
    const simulation = row.simulation_json ? JSON.parse(String(row.simulation_json)) as Record<string, unknown> : undefined;
    const now = Date.now();
    const storedStatus = String(row.status) as RaceRecord['status'];
    const startAt = Number(row.start_at);
    const status = storedStatus === 'finished' || storedStatus === 'qualification_pending'
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
      conditions,
      ...(includeHorses ? { horses, simulation } : {})
    };
  }

  private isBetHit(bet: CentralBet, results: Array<{ horse_number: number }>): boolean {
    const first = results[0]?.horse_number;
    const second = results[1]?.horse_number;
    const third = results[2]?.horse_number;
    const top3 = [first, second, third].filter((number): number is number => Number.isInteger(number));
    const numbers = bet.horseNumbers;
    if (bet.betType === '単勝') return numbers[0] === first;
    if (bet.betType === '複勝') return top3.includes(numbers[0]);
    if (bet.betType === '馬連') return numbers.includes(first) && numbers.includes(second);
    if (bet.betType === 'ワイド') return numbers.filter((number) => top3.includes(number)).length >= 2;
    if (bet.betType === '馬単') return numbers[0] === first && numbers[1] === second;
    if (bet.betType === '3連複') return numbers.includes(first) && numbers.includes(second) && numbers.includes(third);
    return bet.betType === '3連単' && numbers[0] === first && numbers[1] === second && numbers[2] === third;
  }

  private settleDueRaces(now: number): void {
    const due = this.ctx.storage.sql.exec<{ id: string }>(
      `SELECT id FROM races
       WHERE start_at <= ? AND status NOT IN ('finished', 'qualification_pending')`,
      now
    ).toArray();
    for (const row of due) this.settleRace(row.id, now);
  }

  private settleRace(raceId: string, now: number): void {
    const row = this.ctx.storage.sql.exec<SqlRow>('SELECT * FROM races WHERE id = ?', raceId).toArray()[0];
    if (!row || String(row.status) === 'finished' || String(row.status) === 'qualification_pending') return;

    const horses = JSON.parse(String(row.horses_json)) as CentralHorse[];
    const conditions = JSON.parse(String(row.conditions_json)) as RaceConditions;
    const simulation = raceSimulator.simulate({
      distance: conditions.distance,
      field_condition: conditions.fieldCondition,
      weather: conditions.weather,
      course_feature: conditions.courseFeature,
      presentation_drama: true
    }, horses);
    const results = simulation.results as Array<{ horse_number: number }>;
    const grade = String(row.grade) as RaceGrade;
    const prizes: Record<RaceGrade, [number, number, number]> = {
      GENERAL: [30_000, 12_000, 8_000],
      G3: [100_000, 40_000, 20_000],
      G2: [300_000, 120_000, 60_000],
      G1: [1_000_000, 400_000, 200_000]
    };

    this.ctx.storage.transactionSync(() => {
      const current = this.ctx.storage.sql.exec<{ status: string }>('SELECT status FROM races WHERE id = ?', raceId).toArray()[0];
      if (!current || current.status === 'finished') return;
      this.ctx.storage.sql.exec(
        "UPDATE races SET status = 'finished', simulation_json = ? WHERE id = ?",
        JSON.stringify(simulation),
        raceId
      );

      for (const horse of horses) {
        const rank = results.findIndex((result) => result.horse_number === horse.horse_number);
        const prize = rank >= 0 && rank < 3 ? prizes[grade][rank] : 0;
        this.ctx.storage.sql.exec(
          `UPDATE horses SET
             central_earnings = central_earnings + ?,
             total_races = total_races + 1,
             wins = wins + ?,
             last_race_at = ?
           WHERE id = ?`,
          prize,
          rank === 0 ? 1 : 0,
          now,
          horse.id
        );
      }

      const ticketRows = this.ctx.storage.sql.exec<SqlRow>(
        "SELECT * FROM tickets WHERE race_id = ? AND status = 'active'",
        raceId
      ).toArray();
      for (const ticket of ticketRows) {
        const bets = JSON.parse(String(ticket.bets_json)) as CentralBet[];
        const details = bets.map((bet) => {
          const isHit = this.isBetHit(bet, results);
          const payoutOdds = isHit
            ? oddsCalculator.calculatePayoutOdds(bet.betType, bet.horseNumbers, horses)
            : 0;
          return { ...bet, isHit, payoutOdds, payout: Math.floor(bet.amount * payoutOdds) };
        });
        const payout = details.reduce((sum, detail) => sum + detail.payout, 0);
        if (payout > 0) {
          this.ctx.storage.sql.exec(
            'UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE player_id = ?',
            payout,
            now,
            String(ticket.player_id)
          );
        }
        const settlementId = `${raceId}:${String(ticket.player_id)}`;
        this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO settlements
            (id, player_id, race_id, kind, amount, details_json, acknowledged, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          settlementId,
          String(ticket.player_id),
          raceId,
          payout > 0 ? 'payout' : 'loss',
          payout,
          JSON.stringify({ grade, results: results.slice(0, 3), bets: details }),
          now
        );
        this.ctx.storage.sql.exec(
          "UPDATE tickets SET status = 'settled', updated_at = ? WHERE player_id = ? AND race_id = ?",
          now,
          String(ticket.player_id),
          raceId
        );
      }
    });
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

  private validPlayerId(value: unknown): string | null {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : null;
  }

  private ensureAccount(playerId: string, now: number): number {
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO accounts (player_id, balance, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      playerId,
      STARTING_BALANCE,
      now,
      now
    );
    const row = this.ctx.storage.sql.exec<{ balance: number }>(
      'SELECT balance FROM accounts WHERE player_id = ?',
      playerId
    ).toArray()[0];
    return Number(row?.balance || 0);
  }

  private validateBets(value: unknown, horses: CentralHorse[]): CentralBet[] | null {
    if (!Array.isArray(value) || value.length > 100) return null;
    const validHorseNumbers = new Set(horses.map((horse) => horse.horse_number));
    const requiredCount: Record<CentralBet['betType'], number> = {
      単勝: 1, 複勝: 1, 馬連: 2, ワイド: 2, 馬単: 2, '3連複': 3, '3連単': 3
    };
    const result: CentralBet[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') return null;
      const candidate = raw as Record<string, unknown>;
      const betType = String(candidate.betType) as CentralBet['betType'];
      if (!VALID_BET_TYPES.includes(betType)) return null;
      const horseNumbers = Array.isArray(candidate.horseNumbers)
        ? candidate.horseNumbers.map(Number)
        : [];
      const amount = Number(candidate.amount);
      if (
        horseNumbers.length !== requiredCount[betType]
        || new Set(horseNumbers).size !== horseNumbers.length
        || horseNumbers.some((number) => !Number.isInteger(number) || !validHorseNumbers.has(number))
        || !Number.isInteger(amount) || amount < 100 || amount > 1_000_000
      ) return null;
      result.push({
        id: String(candidate.id || crypto.randomUUID()).slice(0, 80),
        betType,
        horseNumbers,
        amount
      });
    }
    return result;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    this.settleDueRaces(now);

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

    if (request.method === 'GET' && url.pathname.startsWith('/api/central/races/')) {
      const raceId = decodeURIComponent(url.pathname.slice('/api/central/races/'.length));
      const row = this.ctx.storage.sql.exec<SqlRow>('SELECT * FROM races WHERE id = ?', raceId).toArray()[0];
      if (!row) return json({ ok: false, error: 'race_not_found' }, { status: 404 });
      return json({ ok: true, serverTime: now, race: this.raceFromRow(row, true) });
    }

    if (request.method === 'GET' && url.pathname === '/api/central/me') {
      const playerId = this.validPlayerId(url.searchParams.get('playerId'));
      if (!playerId) return json({ ok: false, error: 'invalid_player' }, { status: 400 });
      const balance = this.ensureAccount(playerId, now);
      const tickets = this.ctx.storage.sql.exec<SqlRow>(
        "SELECT race_id, bets_json, reserved_amount, status, updated_at FROM tickets WHERE player_id = ? AND status = 'active' ORDER BY updated_at DESC",
        playerId
      ).toArray().map((row) => ({
        raceId: String(row.race_id),
        bets: JSON.parse(String(row.bets_json)) as CentralBet[],
        reservedAmount: Number(row.reserved_amount),
        status: String(row.status),
        updatedAt: Number(row.updated_at)
      }));
      const settlements = this.ctx.storage.sql.exec<SqlRow>(
        'SELECT * FROM settlements WHERE player_id = ? AND acknowledged = 0 ORDER BY created_at ASC',
        playerId
      ).toArray().map((row) => ({
        id: String(row.id),
        raceId: String(row.race_id),
        kind: String(row.kind),
        amount: Number(row.amount),
        details: JSON.parse(String(row.details_json)),
        createdAt: Number(row.created_at)
      }));
      return json({ ok: true, serverTime: now, balance, tickets, settlements });
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
      const balance = this.ensureAccount(player.id, now);
      const counts = this.activeCounts(now);
      return json({ ok: true, serverTime: now, participants: counts.players, win5Participants: counts.win5, balance });
    }

    if (request.method === 'POST' && url.pathname === '/api/central/bets') {
      const body = await this.readBody(request);
      const playerId = this.validPlayerId(body.playerId);
      const raceId = String(body.raceId || '');
      if (!playerId || !raceId) return json({ ok: false, error: 'invalid_request' }, { status: 400 });
      const raceRow = this.ctx.storage.sql.exec<SqlRow>('SELECT * FROM races WHERE id = ?', raceId).toArray()[0];
      if (!raceRow) return json({ ok: false, error: 'race_not_found' }, { status: 404 });
      const race = this.raceFromRow(raceRow, true);
      if (race.status === 'qualification_pending' || now >= race.bettingClosesAt) {
        return json({ ok: false, error: 'betting_closed' }, { status: 409 });
      }
      const bets = this.validateBets(body.bets, race.horses || []);
      if (!bets) return json({ ok: false, error: 'invalid_bets' }, { status: 400 });
      const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
      let nextBalance = 0;
      let insufficient = false;
      this.ctx.storage.transactionSync(() => {
        const balance = this.ensureAccount(playerId, now);
        const previous = this.ctx.storage.sql.exec<{ reserved_amount: number; status: string }>(
          'SELECT reserved_amount, status FROM tickets WHERE player_id = ? AND race_id = ?',
          playerId,
          raceId
        ).toArray()[0];
        const refundable = previous?.status === 'active' ? Number(previous.reserved_amount) : 0;
        const available = balance + refundable;
        if (total > available) {
          insufficient = true;
          nextBalance = balance;
          return;
        }
        nextBalance = available - total;
        this.ctx.storage.sql.exec(
          'UPDATE accounts SET balance = ?, updated_at = ? WHERE player_id = ?',
          nextBalance,
          now,
          playerId
        );
        this.ctx.storage.sql.exec(
          `INSERT INTO tickets (player_id, race_id, bets_json, reserved_amount, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?)
           ON CONFLICT(player_id, race_id) DO UPDATE SET
             bets_json = excluded.bets_json,
             reserved_amount = excluded.reserved_amount,
             status = 'active',
             updated_at = excluded.updated_at`,
          playerId,
          raceId,
          JSON.stringify(bets),
          total,
          now,
          now
        );
      });
      if (insufficient) return json({ ok: false, error: 'insufficient_balance', balance: nextBalance }, { status: 409 });
      return json({ ok: true, serverTime: now, balance: nextBalance, raceId, bets, reservedAmount: total });
    }

    if (request.method === 'POST' && url.pathname === '/api/central/settlements/ack') {
      const body = await this.readBody(request);
      const playerId = this.validPlayerId(body.playerId);
      const settlementIds = Array.isArray(body.settlementIds) ? body.settlementIds.map(String).slice(0, 100) : [];
      if (!playerId) return json({ ok: false, error: 'invalid_player' }, { status: 400 });
      for (const id of settlementIds) {
        this.ctx.storage.sql.exec(
          'UPDATE settlements SET acknowledged = 1 WHERE id = ? AND player_id = ?',
          id,
          playerId
        );
      }
      return json({ ok: true, serverTime: now });
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
