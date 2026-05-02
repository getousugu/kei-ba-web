import Dexie, { type Table } from 'dexie';

export interface PlayerData {
  id: string;
  name: string;
  global_coins: number;
}

export interface HorseRecord {
  id?: number;
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
  distance_apt: any;
  field_apt: any;
  course_apt: any;
  jockey_name?: string;
  weight?: number;
  weight_change?: number;
  rating?: number;
  record?: any;
  total_races: number;
  wins: number;
}

export class KeibaDB extends Dexie {
  players!: Table<PlayerData, string>;
  horses!: Table<HorseRecord, number>;

  constructor() {
    super('KeibaWebDatabase');
    this.version(2).stores({
      players: 'id, name',
      horses: '++id, name, rarity',
    });
  }
}

export const db = new KeibaDB();

export async function initLocalPlayer() {
  const me = await db.players.get('me');
  if (!me) {
    await db.players.put({ id: 'me', name: 'Player', global_coins: 10000 });
  }
}

/** 馬プールの初期生成・補充 */
export async function ensureHorsePool(targetSize = 80): Promise<void> {
  const count = await db.horses.count();
  if (count >= targetSize) return;

  // 動的インポートで循環依存を避ける
  const { horseGenerator } = await import('../core/horse_generator');
  const usedNames = new Set<string>((await db.horses.toArray()).map(h => h.name));
  const needed = targetSize - count;

  const toAdd: HorseRecord[] = [];
  for (let i = 0; i < needed; i++) {
    const h = horseGenerator.generateHorse(usedNames);
    const [weight, weight_change] = horseGenerator.generateHorseWeight();
    const jockey_name = horseGenerator.generateJockeyName();
    const record = horseGenerator.generateRecord(h.rarity);
    toAdd.push({
      ...h,
      jockey_name,
      weight,
      weight_change,
      record,
      rating: Math.round(50 * 10 + Math.random() * 200),
      total_races: record.wins + record.places + record.shows + record.losses,
      wins: record.wins,
    });
  }
  await db.horses.bulkAdd(toAdd);
}

/** 馬プールから指定頭数を抽選 (DBのIDを維持) */
export async function drawHorsesFromPool(count: number): Promise<HorseRecord[]> {
  await ensureHorsePool(Math.max(80, count * 4));
  const all = await db.horses.toArray();
  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  // Return horses with their DB IDs
  return all.slice(0, count);
}
