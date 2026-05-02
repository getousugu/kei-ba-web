import {
  APTITUDE_MULTIPLIERS,
  CONDITION_MODIFIERS,
  FIELD_CONDITION_MODIFIERS,
  DISTANCE_CATEGORIES,
  MARGINS,
} from './constants';
import type { HorseData } from './odds_calculator';

function randomGauss(mean: number, std: number): number {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * std + mean;
}

export class RaceSimulator {
  STAGES = [
    "start", "early", "middle", "corner3",
    "final_corner", "homestretch_early", "homestretch_final", "goal"
  ];

  STAGE_NAMES_JP = [
    "スタート", "序盤", "中盤", "3コーナー",
    "最終コーナー", "直線前半", "直線後半", "ゴール"
  ];

  simulate(raceData: any, horsesData: any[], luckFactor: number = 5.0) {
    const distance = raceData.distance;
    const fieldCondition = raceData.field_condition || "良";
    const courseFeature = raceData.course_feature || "平坦";
    const weather = raceData.weather || "晴";

    const simHorses = horsesData.map(hd => {
      const horse = hd;
      const params = this._calculateHorseParams(horse, distance, fieldCondition, courseFeature, luckFactor);
      return {
        ...params,
        horse_number: hd.horse_number,
        horse_name: horse.name,
        jockey_name: hd.jockey_name,
        running_style: horse.running_style,
        score: hd.score || 50.0,
      };
    });

    const pace = this._determinePace(simHorses);
    const stagesData: any[] = [];
    const eventsAll: any[] = [];
    const cumulativePositions: Record<number, number> = {};
    
    simHorses.forEach(h => {
      cumulativePositions[h.horse_number] = 0.0;
    });

    this.STAGES.forEach((stageName, stageIdx) => {
      const stageResult = this._simulateStage(
        stageIdx, simHorses, cumulativePositions, distance,
        pace, fieldCondition, courseFeature, weather, luckFactor
      );
      stagesData.push(stageResult);
      if (stageResult.events) {
        eventsAll.push(...stageResult.events);
      }
      Object.entries(stageResult.positions_progress).forEach(([hn, progress]) => {
        cumulativePositions[parseInt(hn)] = progress as number;
      });
    });

    const results = this._calculateFinalResults(simHorses, cumulativePositions, distance, fieldCondition);

    return {
      stages: stagesData,
      results,
      events: eventsAll,
      pace,
      base_time: this._calculateBaseTime(distance, fieldCondition),
    };
  }

  private _calculateHorseParams(horse: any, distance: number, fieldCondition: string, courseFeature: string, luckFactor: number) {
    let { speed, stamina, power, burst, guts, wisdom } = horse;
    
    const fieldMods = FIELD_CONDITION_MODIFIERS[fieldCondition] || { speed: 1.0, stamina: 1.0, power: 1.0 };
    speed *= fieldMods.speed;
    stamina *= fieldMods.stamina;
    power *= fieldMods.power;

    const distCat = this._getDistanceCategory(distance);
    const distApt = typeof horse.distance_apt === 'string' ? JSON.parse(horse.distance_apt) : horse.distance_apt;
    const distRank = distApt[distCat] || "C";
    const distMult = APTITUDE_MULTIPLIERS[distRank] || 1.0;

    const fieldApt = typeof horse.field_apt === 'string' ? JSON.parse(horse.field_apt) : horse.field_apt;
    const fieldRank = fieldApt[fieldCondition] || "C";
    const fieldMult = APTITUDE_MULTIPLIERS[fieldRank] || 1.0;

    const condMult = CONDITION_MODIFIERS[horse.condition] || 1.0;

    let courseBonus = 0;
    if (courseFeature === "坂あり") courseBonus = power * 0.05;
    else if (courseFeature === "直線長") courseBonus = burst * 0.05;
    else if (courseFeature === "コーナー多") courseBonus = wisdom * 0.05;

    const style = horse.running_style;
    let earlyPower = speed * 0.3 + guts * 0.4 + wisdom * 0.2;
    if (style === "逃げ") earlyPower *= 1.4;
    else if (style === "先行") earlyPower *= 1.2;
    else if (style === "差し") earlyPower *= 0.8;
    else if (style === "追込") earlyPower *= 0.6;

    let middlePower = stamina * 0.4 + wisdom * 0.3 + speed * 0.2;
    if (style === "逃げ" || style === "先行") middlePower *= 1.1;
    else middlePower *= 0.95;

    let latePower = burst * 0.4 + speed * 0.3 + guts * 0.2;
    if (style === "追込") latePower *= 1.5;
    else if (style === "差し") latePower *= 1.3;
    else if (style === "先行") latePower *= 1.0;
    else if (style === "逃げ") latePower *= 0.92;

    let staminaFactor = 1.0;
    if (distance >= 2500) staminaFactor = 1 + (stamina - 50) / 200;
    else if (distance >= 1900) staminaFactor = 1 + (stamina - 50) / 350;

    return {
      speed, stamina, power, burst, guts, wisdom,
      early_power: earlyPower * distMult * condMult,
      middle_power: middlePower * distMult * fieldMult * condMult * staminaFactor,
      late_power: latePower * distMult * fieldMult * condMult + courseBonus,
      total_mult: distMult * fieldMult * condMult,
    };
  }

  private _determinePace(simHorses: any[]): string {
    const escapeCount = simHorses.filter(h => h.running_style === "逃げ").length;
    const frontCount = simHorses.filter(h => h.running_style === "逃げ" || h.running_style === "先行").length;
    const avgEarly = simHorses.reduce((sum, h) => sum + h.early_power, 0) / simHorses.length;

    if (escapeCount >= 4 || (escapeCount >= 3 && frontCount >= 5)) return "ハイペース";
    if (escapeCount === 0 || frontCount <= 3) return "スローペース";
    
    if (avgEarly > 48) {
      return Math.random() > 0.5 ? "ミドルペース" : "ハイペース";
    } else {
      return Math.random() > 0.4 ? "ミドルペース" : "スローペース";
    }
  }

  private _simulateStage(
    stageIdx: number, simHorses: any[], cumulativePositions: Record<number, number>,
    distance: number, pace: string, fieldCondition: string, courseFeature: string,
    weather: string, luckFactor: number
  ) {
    const stageName = this.STAGES[stageIdx];
    const events: any[] = [];
    const positionsProgress: Record<number, number> = {};

    const stageWeights = [0.05, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90, 1.0];
    const targetProgress = stageWeights[stageIdx];

    simHorses.forEach(h => {
      const hn = h.horse_number;
      const prevProgress = cumulativePositions[hn];
      let base = 0;

      if (stageIdx <= 1) base = h.early_power;
      else if (stageIdx <= 3) base = h.middle_power;
      else base = h.late_power;

      let paceMod = 1.0;
      if (pace === "ハイペース") {
        if (stageIdx <= 2) {
          paceMod = (h.running_style === "逃げ" || h.running_style === "先行") ? 1.05 : 0.98;
        } else {
          paceMod = (h.running_style === "逃げ" || h.running_style === "先行") ? 0.92 : 1.08;
        }
      } else if (pace === "スローペース") {
        if (stageIdx <= 2) {
          paceMod = 0.95;
        } else {
          paceMod = (h.running_style === "逃げ" || h.running_style === "先行") ? 1.08 : 0.95;
        }
      }

      let luck = (h.running_style === "暴れ馬") ? randomGauss(0, luckFactor * 2.5) : randomGauss(0, luckFactor);

      if (stageIdx === 0) {
        const startRoll = Math.random();
        if (h.running_style === "暴れ馬") {
          if (startRoll < 0.25) {
            luck -= luckFactor * 3.0;
            events.push({ type: "bad_start", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name, wild: true });
          } else if (startRoll > 0.875) {
            luck += luckFactor * 1.5;
            events.push({ type: "good_start", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          }
        } else {
          if (startRoll < 0.08) {
            luck -= luckFactor * 2;
            events.push({ type: "bad_start", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          } else if (startRoll > 0.88) {
            luck += luckFactor * 1.5;
            events.push({ type: "good_start", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          }
        }
      }

      let weatherMod = 1.0;
      if (weather === "雨") weatherMod = 0.98 + h.power / 5000;
      else if (weather === "強風") {
        weatherMod = (h.running_style === "逃げ") ? 0.99 : 1.01;
      }

      if (stageIdx >= 5) {
        if (Math.random() < 0.15 && h.burst > 70) {
          luck += luckFactor * 1.5;
          events.push({ type: "last_spurt", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
        }
        if (Math.random() < 0.10 && h.guts > 75) {
          luck += luckFactor * 1.0;
          events.push({ type: "guts_display", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
        }
      }

      if (h.running_style === "暴れ馬" && (stageIdx === 2 || stageIdx === 3)) {
        if (Math.random() < 0.15) {
          const extreme = Math.random() < 0.5 ? -1 : 1;
          luck += extreme * luckFactor * 4.0;
          events.push({ type: "wild_control_lost", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name, direction: extreme > 0 ? "加速" : "大失速" });
        }
      }

      if ((stageIdx === 2 || stageIdx === 3) && Math.random() < 0.05) {
        luck -= luckFactor * 1.5;
        events.push({ type: "interference", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
      }

      if (h.running_style === "暴れ馬" && stageIdx >= 5) {
        if (Math.random() < 0.20) {
          luck += luckFactor * 2.5;
          events.push({ type: "wild_explosion", horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
        }
      }

      // 改良：段階的なギアチェンジ（0.6から1.6まで徐々に解放）
      const idealIncr = 1.0 / this.STAGES.length; 
      
      // ステージごとに実力差の反映率（compression）を滑らかに変化させる
      // [0.6, 0.6, 0.7, 0.8, 1.0, 1.2, 1.4, 1.6] のようなイメージ
      const compressionCurve = [0.6, 0.6, 0.7, 0.9, 1.1, 1.3, 1.5, 1.7];
      const compression = compressionCurve[stageIdx] || 1.0;

      // 能力ベースの進捗計算
      const basePower = (base * paceMod * weatherMod + luck);
      const abilityDiff = (basePower - 50.0) / 100.0;
      const abilityIncr = 1.0 + (abilityDiff * compression);

      // ラバーバンド補正（競り合いの塩梅を0.06に設定）
      let rubberBand = 0;
      if (stageIdx <= 5) {
        const avgProgress = Object.values(cumulativePositions).reduce((a, b) => a + b, 0) / simHorses.length;
        const gapFromAvg = prevProgress - avgProgress;
        rubberBand = -gapFromAvg * 0.06; 
      }

      // 進捗の更新（最低進捗を保証しつつ、能力を反映）
      const progressIncrement = Math.max(0.03, idealIncr * abilityIncr + rubberBand);
      let nextProgress = prevProgress + progressIncrement;

      // 最終ステージ（ゴール）では全員が1.0以上に到達するように補正し、フリーズを防ぐ
      if (stageIdx === this.STAGES.length - 1) {
        nextProgress = Math.max(1.0, nextProgress);
      }

      cumulativePositions[hn] = nextProgress;
    });

    // 最終ステージ（ゴール）での「吸い込まれ」防止処理
    if (stageIdx === this.STAGES.length - 1) {
      const progs = Object.entries(cumulativePositions).map(([hn, prog]) => ({ hn: parseInt(hn), prog }));
      const minProg = Math.min(...progs.map(p => p.prog));
      const maxProg = Math.max(...progs.map(p => p.prog));
      const currentSpread = maxProg - minProg;

      // 強制的に着差をつける（最低でも進行度0.20、最大0.40の差をつける）
      // 非線形スケーリングをなくし、純粋な線形拡大にすることで後続の「団子」を防ぐ
      const targetSpread = Math.max(0.20, Math.min(0.40, currentSpread * 15));

      progs.forEach(p => {
        const normalized = currentSpread > 0 ? (p.prog - minProg) / currentSpread : 0;
        // 線形スケーリング（そのままの比率で拡大）
        const newProg = minProg + normalized * targetSpread;
        cumulativePositions[p.hn] = newProg;
      });

      // 最下位の馬でも1.0（ゴール）には到達させる
      const newMin = Math.min(...Object.values(cumulativePositions));
      const offset = 1.02 - newMin;
      
      simHorses.forEach(h => {
        cumulativePositions[h.horse_number] += offset;
        positionsProgress[h.horse_number] = cumulativePositions[h.horse_number];
      });
    } else {
      simHorses.forEach(h => {
        positionsProgress[h.horse_number] = cumulativePositions[h.horse_number];
      });
    }

    const sortedHorses = Object.entries(cumulativePositions)
      .map(([hn, prog]) => ({ hn: parseInt(hn), prog }))
      .sort((a, b) => b.prog - a.prog);

    const rankings: Record<number, number> = {};
    sortedHorses.forEach((sh, rank) => {
      rankings[sh.hn] = rank + 1;
    });

    const sortedOutput = sortedHorses.map((sh, idx) => {
      const h = simHorses.find(x => x.horse_number === sh.hn)!;
      return {
        horse_number: sh.hn,
        horse_name: h.horse_name,
        jockey_name: h.jockey_name,
        running_style: h.running_style,
        position: idx + 1,
        progress: sh.prog,
      };
    });

    return {
      stage_idx: stageIdx,
      stage_name: stageName,
      stage_name_jp: this.STAGE_NAMES_JP[stageIdx],
      positions_progress: positionsProgress,
      rankings,
      events,
      sorted_horses: sortedOutput,
    };
  }

  private _calculateFinalResults(simHorses: any[], cumulativePositions: Record<number, number>, distance: number, fieldCondition: string) {
    const baseTime = this._calculateBaseTime(distance, fieldCondition);
    
    const sortedByProgress = Object.entries(cumulativePositions)
      .map(([hn, prog]) => ({ hn: parseInt(hn), prog }))
      .sort((a, b) => b.prog - a.prog);

    const results: any[] = [];
    let prevTime: number | null = null;
    const topProgress = sortedByProgress[0].prog;

    sortedByProgress.forEach((sh, idx) => {
      const rank = idx + 1;
      const h = simHorses.find(x => x.horse_number === sh.hn)!;
      
      let timeRatio = 1.5;
      if (sh.prog > 0) timeRatio = topProgress / sh.prog;
      
      let finishTime = baseTime * timeRatio;
      finishTime += (Math.random() * 0.2) - 0.1;
      finishTime = Math.round(finishTime * 10) / 10;

      let margin = "";
      if (rank === 1) {
        margin = "────";
        prevTime = finishTime;
      } else {
        const timeDiff = finishTime - (prevTime as number);
        margin = this._timeToMargin(timeDiff);
        prevTime = finishTime;
      }

      results.push({
        position: rank,
        horse_number: sh.hn,
        horse_name: h.horse_name,
        jockey_name: h.jockey_name,
        running_style: h.running_style,
        finish_time: finishTime,
        margin,
      });
    });

    return results;
  }

  private _calculateBaseTime(distance: number, fieldCondition: string): number {
    let base = (distance / 200) * 12.0;
    if (fieldCondition === "稍重") base *= 1.01;
    else if (fieldCondition === "重") base *= 1.03;
    else if (fieldCondition === "不良") base *= 1.05;
    return Math.round(base * 10) / 10;
  }

  private _timeToMargin(timeDiff: number): string {
    for (const [threshold, marginText] of MARGINS) {
      if (timeDiff <= (threshold as number)) return marginText as string;
    }
    return '大差';
  }

  private _getDistanceCategory(distance: number): string {
    for (const [cat, [minD, maxD]] of Object.entries(DISTANCE_CATEGORIES)) {
      if (distance >= minD && distance <= maxD) {
        return cat;
      }
    }
    if (distance < 1000) return "短距離";
    return "長距離";
  }
}

export const raceSimulator = new RaceSimulator();
