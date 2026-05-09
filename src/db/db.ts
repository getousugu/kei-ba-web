import Dexie, { type Table } from 'dexie';

export interface PlayerData {
  id: string;
  name: string;
  global_coins: number;
  has_created_permanent?: boolean;
  debt_amount?: number;
  debt_timestamp?: number;
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
  is_permanent?: boolean;
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
export async function ensureHorsePool(targetSize = 100): Promise<void> {
  const allHorses = await db.horses.toArray();
  const temporaryHorses = allHorses.filter(h => !h.is_permanent);
  const count = temporaryHorses.length;
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
    
    // 全ての馬を 0戦0勝 (0-0-0-0) で開始するように変更
    const record = { wins: 0, places: 0, shows: 0, losses: 0 };
    
    toAdd.push({
      ...h,
      jockey_name,
      weight,
      weight_change,
      record,
      rating: h.rating || 1000,
      total_races: 0,
      wins: 0,
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
/** 出走数に応じた引退判定 (Bot版と同じ確率設定) */
export async function checkRetirement(horseId: number, totalRaces: number): Promise<boolean> {
  let prob = 0;
  if (totalRaces < 10) prob = 0;
  else if (totalRaces < 15) prob = 0.10;
  else if (totalRaces < 20) prob = 0.35;
  else prob = 0.85;

  if (Math.random() < prob) {
    const horse = await db.horses.get(horseId);
    if (horse?.is_permanent) return false; // 永続馬は引退しない
    await db.horses.delete(horseId);
    return true;
  }
  return false;
}
