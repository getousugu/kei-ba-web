import horseNamesData from '../data/horse_names.json';
import jockeyNamesData from '../data/jockey_names.json';
import {
  RARITY_DISTRIBUTION,
  WILD_HORSE_STYLE,
  GENDERS,
  GENDER_WEIGHTS,
  COAT_COLORS,
  GROWTH_TYPES,
  GROWTH_TYPE_WEIGHTS,
  APTITUDE_RANKS,
  CONDITIONS,
  CONDITION_WEIGHTS,
  HORSE_WEIGHT_MIN,
  HORSE_WEIGHT_MAX,
  HORSE_WEIGHT_CHANGE_RANGE,
} from './constants';

function randomChoice<T>(choices: T[], weights?: number[]): T {
  if (!weights) {
    return choices[Math.floor(Math.random() * choices.length)];
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < choices.length; i++) {
    r -= weights[i];
    if (r <= 0) return choices[i];
  }
  return choices[choices.length - 1];
}

function randomNormal(mean: number, std: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * std + mean;
}

export class HorseGenerator {
  private _horseNames: string[] | null = null;
  private _jockeyData: any[] | null = null;
  private _usedNames: Set<string> = new Set();

  private _loadHorseNames(): string[] {
    if (!this._horseNames) {
      this._horseNames = [];
      for (const category of Object.values(horseNamesData.categories)) {
        this._horseNames.push(...category);
      }
    }
    return this._horseNames;
  }

  private _loadJockeyData(): any[] {
    if (!this._jockeyData) {
      this._jockeyData = jockeyNamesData.jockeys;
    }
    return this._jockeyData;
  }

  private _pickRarity(): string {
    const rarities = Object.keys(RARITY_DISTRIBUTION);
    const weights = rarities.map(r => RARITY_DISTRIBUTION[r].weight);
    return randomChoice(rarities, weights);
  }

  private _generateStats(rarity: string): Record<string, number> {
    const params = RARITY_DISTRIBUTION[rarity];
    const stats: Record<string, number> = {};
    const statNames = ["speed", "stamina", "power", "burst", "guts", "wisdom"];

    for (const statName of statNames) {
      const value = Math.round(randomNormal(params.mean, params.std));
      stats[statName] = Math.max(0, Math.min(100, value));
    }

    return stats;
  }

  private _generateRunningStyle(stats: Record<string, number>): string {
    const { burst, stamina, guts, wisdom, speed } = stats;

    const regularWeights = [
      Math.max(1, guts * 0.4 + stamina * 0.3 + wisdom * 0.2 - burst * 0.1),
      Math.max(1, wisdom * 0.3 + stamina * 0.2 + guts * 0.2 + burst * 0.1),
      Math.max(1, burst * 0.4 + wisdom * 0.2 + speed * 0.2),
      Math.max(1, burst * 0.5 + speed * 0.3 - stamina * 0.1),
    ];

    const totalRegular = regularWeights.reduce((a, b) => a + b, 0);
    const wildWeight = totalRegular * (3.5 / 96.5);

    const allWeights = [...regularWeights, wildWeight];
    const styles = ["逃げ", "先行", "差し", "追込", WILD_HORSE_STYLE];

    return randomChoice(styles, allWeights);
  }

  private _generateAptitudes(stats: Record<string, number>, runningStyle: string): Record<string, any> {
    const distance_apt: Record<string, string> = {};
    const { stamina, speed, power } = stats;

    const shortWeight = Math.max(0.5, speed * 0.02 - stamina * 0.005);
    const mileWeight = Math.max(0.5, (speed + stamina) * 0.01);
    const midWeight = Math.max(0.5, stamina * 0.015 + power * 0.005);
    const longWeight = Math.max(0.5, stamina * 0.02 - speed * 0.003);

    const distCategories = [
      { name: "短距離", weight: shortWeight },
      { name: "マイル", weight: mileWeight },
      { name: "中距離", weight: midWeight },
      { name: "長距離", weight: longWeight },
    ];

    for (const { name, weight } of distCategories) {
      const r = Math.random() * 2;
      if (r < weight * 0.3) distance_apt[name] = "A";
      else if (r < weight * 0.6) distance_apt[name] = "B";
      else if (r < weight * 0.9) distance_apt[name] = "C";
      else if (r < weight * 1.3) distance_apt[name] = "D";
      else distance_apt[name] = "E";
    }

    if (runningStyle === "逃げ") {
      if (distance_apt["短距離"] === "D" || distance_apt["短距離"] === "E") {
        distance_apt["短距離"] = randomChoice(["B", "C"]);
      }
    }

    const field_apt: Record<string, string> = {};
    const fieldConditions = [
      { cond: "良", base: 0.5 },
      { cond: "稍重", base: 0.5 },
      { cond: "重", base: 0.5 },
      { cond: "不良", base: 0.5 },
    ];

    for (const { cond, base } of fieldConditions) {
      let factor = 0.5;
      if (cond === "重" || cond === "不良") {
        factor = power * 0.015;
      }
      const r = Math.random() * 2;
      if (r < (base + factor) * 0.3) field_apt[cond] = "A";
      else if (r < (base + factor) * 0.6) field_apt[cond] = "B";
      else if (r < (base + factor) * 0.9) field_apt[cond] = "C";
      else if (r < (base + factor) * 1.3) field_apt[cond] = "D";
      else field_apt[cond] = "E";
    }

    const course_apt: Record<string, string> = {};
    for (const course of ["左回り", "右回り", "直線"]) {
      course_apt[course] = randomChoice(APTITUDE_RANKS, [15, 25, 35, 15, 10]);
    }

    return {
      distance_apt,
      field_apt,
      course_apt,
    };
  }

  private _applyArchetype(stats: Record<string, number>, runningStyle: string, rarity: string): Record<string, number> {
    // 22% chance to apply archetype
    if (Math.random() > 0.22) return stats;

    const scaleMap: Record<string, number> = {
      Legendary: 1.0,
      Epic: 0.8,
      Rare: 0.6,
      Common: 0.5,
    };
    const scale = scaleMap[rarity] || 0.5;

    const archetypes = [
      { name: 'Sprinter', changes: { speed: 15, stamina: -8, guts: -8 } },
      { name: 'Stamina', changes: { stamina: 12, guts: 8, burst: -10 } },
      { name: 'Power', changes: { power: 15, wisdom: -15 } },
      { name: 'Closer', changes: { burst: 12, power: 8, stamina: -12 } },
      { name: 'Smart', changes: { wisdom: 12, guts: 8, speed: -12 } },
      { name: 'Guts', changes: { guts: 15, stamina: 8, burst: -8, speed: -8 } },
      { name: 'Sharp', changes: { burst: 15, wisdom: 8, stamina: -10, power: -10 } },
      { name: 'Inconsistent', changes: {} },
    ];

    const weights = new Array(8).fill(1);
    
    if (runningStyle === '逃げ') { weights[0] = 2; weights[5] = 2; }
    else if (runningStyle === '先行') { weights[1] = 2; weights[4] = 2; }
    else if (runningStyle === '差し') { weights[2] = 2; weights[6] = 2; }
    else if (runningStyle === '追込') { weights[3] = 2; weights[2] = 2; }

    let selectedArchetype = randomChoice(archetypes, weights);
    
    if (runningStyle === WILD_HORSE_STYLE && selectedArchetype.name === 'Inconsistent') {
       const others = archetypes.filter(a => a.name !== 'Inconsistent');
       selectedArchetype = randomChoice(others);
    }

    const newStats = { ...stats };

    if (selectedArchetype.name === 'Inconsistent') {
      const params = RARITY_DISTRIBUTION[rarity];
      const statNames = ["speed", "stamina", "power", "burst", "guts", "wisdom"];
      for (const statName of statNames) {
        const value = Math.round(randomNormal(params.mean, params.std * 2.0));
        newStats[statName] = Math.max(10, Math.min(100, value));
      }
    } else {
      for (const [stat, change] of Object.entries(selectedArchetype.changes)) {
        newStats[stat] = Math.round(newStats[stat] + change * scale);
      }
      for (const stat in newStats) {
        newStats[stat] = Math.max(10, Math.min(100, newStats[stat]));
      }
    }

    return newStats;
  }

  generateHorse(usedNames: Set<string> = this._usedNames): any {
    const allNames = this._loadHorseNames();
    let availableNames = allNames.filter(n => !usedNames.has(n));

    if (availableNames.length === 0) {
      usedNames.clear();
      availableNames = allNames;
    }

    const name = randomChoice(availableNames);
    usedNames.add(name);

    const rarity = this._pickRarity();
    let stats = this._generateStats(rarity);
    const running_style = this._generateRunningStyle(stats);
    stats = this._applyArchetype(stats, running_style, rarity);
    const aptitudes = this._generateAptitudes(stats, running_style);

    const age = Math.floor(Math.random() * 5) + 3; // 3 to 7
    const gender = randomChoice(GENDERS, GENDER_WEIGHTS);
    const coat_color = randomChoice(COAT_COLORS);
    const growth_type = GROWTH_TYPES[Math.floor(Math.random() * GROWTH_TYPES.length)];
    const condition = '普通';

    const ratingMap: Record<string, number> = {
      Legendary: 1600,
      Epic: 1400,
      Rare: 1200,
      Common: 1000
    };

    return {
      name,
      age,       // 一度計算した値を再利用
      gender,
      coat_color,
      rarity,
      growth_type,
      running_style,
      condition,
      rating: ratingMap[rarity] || 1000,
      total_races: 0,
      wins: 0,
      ...stats,
      ...aptitudes,
    };
  }

  generateHorseWeight(): [number, number] {
    const weight = Math.floor(Math.random() * (HORSE_WEIGHT_MAX - HORSE_WEIGHT_MIN + 1)) + HORSE_WEIGHT_MIN;
    const change = Math.floor(Math.random() * (HORSE_WEIGHT_CHANGE_RANGE[1] - HORSE_WEIGHT_CHANGE_RANGE[0] + 1)) + HORSE_WEIGHT_CHANGE_RANGE[0];
    return [weight, change];
  }

  generateJockeyName(): string {
    const jockeys = this._loadJockeyData();
    if (!jockeys || jockeys.length === 0) return '不明';
    const j = randomChoice(jockeys);
    return typeof j === 'string' ? j : (j.name || '不明');
  }

  /** Generate a plausible career record based on rarity */
  generateRecord(rarity: string): { wins: number; places: number; shows: number; losses: number } {
    const totalRaces = Math.floor(Math.random() * 20) + 1;
    const winRate = rarity === 'Legendary' ? 0.4 : rarity === 'Epic' ? 0.25 : rarity === 'Rare' ? 0.15 : 0.08;
    const wins = Math.floor(totalRaces * winRate * (0.7 + Math.random() * 0.6));
    const places = Math.min(totalRaces - wins, Math.floor((totalRaces - wins) * 0.3 * (0.5 + Math.random())));
    const shows = Math.min(totalRaces - wins - places, Math.floor((totalRaces - wins - places) * 0.35));
    const losses = totalRaces - wins - places - shows;
    return { wins, places, shows, losses };
  }
}

export const horseGenerator = new HorseGenerator();

