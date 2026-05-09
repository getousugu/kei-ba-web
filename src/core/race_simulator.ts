import {
  APTITUDE_MULTIPLIERS,
  CONDITION_MODIFIERS,
  FIELD_CONDITION_MODIFIERS,
  DISTANCE_CATEGORIES,
  MARGINS,
} from './constants';

function gauss(mean: number, std: number): number {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std + mean;
}

// ─── 定数（チューニングポイント） ───────────────────────────────────
const DIVISOR        = 900;
const LUCK_FACTOR    = 5.0;   // 12.0から5.0へ。ステータス重視へ引き戻し
const LATE_LUCK_MULT = 1.4;   // 1.6から1.4へ
const MAX_FATIGUE_IMPACT = 0.20;
const DIST_APT_BASE  = 0.8;
const DIST_APT_RATE  = 0.3;

// 脚質ごとの速度カーブ [前半, 中盤, 移行期, 直線]
const STYLE_CURVES: Record<string, [number, number, number, number]> = {
  逃げ:   [1.025, 1.010, 0.960, 0.880], // 序盤をさらに抑えて、終盤の垂れを調整
  先行:   [1.015, 1.015, 0.980, 0.940],
  差し:   [0.985, 0.990, 1.020, 1.100],
  追込:   [0.975, 0.980, 1.040, 1.180],
  暴れ馬: [1.000, 1.000, 1.000, 1.000],
};

// 直線でのburst倍率（脚質ごと）
const BURST_SCALE: Record<string, number> = {
  逃げ: 0.00, 先行: 0.10, 差し: 0.35, 追込: 0.55, 暴れ馬: 0.30,
};

// 前半の疲労負荷（脚質ごと）
const FRONT_LOAD: Record<string, number> = {
  逃げ: 1.50, 先行: 1.20, 差し: 0.80, 追込: 0.50, 暴れ馬: 1.60,
};

export class RaceSimulator {
  STAGES = [
    'start','early','middle','corner3',
    'final_corner','homestretch_early','homestretch_final','goal',
  ];
  STAGE_NAMES_JP = [
    'スタート','序盤','中盤','3コーナー',
    '最終コーナー','直線前半','直線後半','ゴール',
  ];

  simulate(raceData: any, horsesData: any[], luckFactor = LUCK_FACTOR) {
    const distance: number       = raceData.distance       ?? 2000;
    const fieldCondition: string = raceData.field_condition ?? '良';
    const courseFeature: string  = raceData.course_feature  ?? '平坦';
    const weather: string        = raceData.weather         ?? '晴';

    const simHorses = horsesData.map(hd => ({
      ...this._calcParams(hd.horse ?? hd, distance, fieldCondition, courseFeature),
      horse_number:  hd.horse_number,
      horse_name:    (hd.horse ?? hd).name,
      jockey_name:   hd.jockey_name,
      running_style: (hd.horse ?? hd).running_style,
      score:         hd.score ?? 50.0,
      fatigue:       0.0,  // 疲労値（0〜1）
    }));

    const pace = this._determinePace(simHorses);

    const stagesData: any[] = [];
    const eventsAll:  any[] = [];
    const cumPos: Record<number, number> = {};
    const finishedAt: Record<number, number> = {};
    simHorses.forEach(h => { cumPos[h.horse_number] = 0.0; });

    let prevRankings: Record<number, number> = {};
    simHorses.forEach((h, i) => { prevRankings[h.horse_number] = i + 1; });

    // 動的ステージ（全馬ゴールまで継続）
    let si = 0;
    while (true) {
      const result = this._simulateStage(
        si, simHorses, cumPos, finishedAt,
        distance, pace, fieldCondition, courseFeature, weather, luckFactor, prevRankings,
      );
      stagesData.push(result);
      eventsAll.push(...result.events);
      for (const [hn, prog] of Object.entries(result.positions_progress)) {
        cumPos[parseInt(hn)] = prog as number;
      }
      prevRankings = result.rankings;
      si++;

      const allFinished = Object.values(cumPos).every(p => p >= 1.0);
      if (allFinished || si >= 50) {
        if (si >= 50) {
          for (const h of simHorses) {
            if (finishedAt[h.horse_number] === undefined) {
              finishedAt[h.horse_number] = 50 + (1.0 - cumPos[h.horse_number]);
            }
          }
        }
        break;
      }
    }

    const results = this._calcFinalResults(simHorses, finishedAt, distance, fieldCondition);

    return {
      stages:    stagesData,
      results,
      events:    eventsAll,
      pace,
      base_time: this._baseTime(distance, fieldCondition),
    };
  }

  // ─── 馬パラメータ計算 ────────────────────────────────────────────
  private _calcParams(horse: any, distance: number, fieldCondition: string, courseFeature: string) {
    let speed   = Number(horse.speed)   || 50;
    let stamina = Number(horse.stamina) || 50;
    let power   = Number(horse.power)   || 50;
    let burst   = Number(horse.burst)   || 50;
    let guts    = Number(horse.guts)    || 50;
    let wisdom  = Number(horse.wisdom)  || 50;
    const weight = Number(horse.weight) || 480;

    // 馬場補正
    const fm = FIELD_CONDITION_MODIFIERS[fieldCondition] ?? { speed: 1.0, stamina: 1.0, power: 1.0 };
    speed   *= fm.speed;
    stamina *= fm.stamina;
    power   *= fm.power;

    // 体重補正（小幅）
    if      (weight < 450) speed *= 1.02;
    else if (weight > 500) power *= 1.02;

    // 距離適性（疲労倍率に使う）
    const distCat  = this._distCat(distance);
    const distApt  = typeof horse.distance_apt === 'string' ? JSON.parse(horse.distance_apt) : horse.distance_apt;
    const distRank = distApt?.[distCat] ?? 'C';
    const aptMult  = APTITUDE_MULTIPLIERS[distRank] ?? 1.0;
    const distAptImpact = DIST_APT_BASE + (distance / 2000) * DIST_APT_RATE;
    // 適性が悪いほど疲労が増える
    const fatigueMult = 1.0 + (1.0 - aptMult) * distAptImpact;

    // 馬場適性
    const fieldApt  = typeof horse.field_apt === 'string' ? JSON.parse(horse.field_apt) : horse.field_apt;
    const fieldRank = fieldApt?.[fieldCondition] ?? 'C';
    const fieldMult = APTITUDE_MULTIPLIERS[fieldRank] ?? 1.0;

    // コンディション（全体への補正）
    const condMult = CONDITION_MODIFIERS[horse.condition] ?? 1.0;

    // コース特性ボーナス（power/burst/wisdomへの加算）
    if      (courseFeature === '坂あり')    power  += power  * 0.04;
    else if (courseFeature === '直線長')    burst  += burst  * 0.04;
    else if (courseFeature === 'コーナー多') wisdom += wisdom * 0.04;

    // 全ステータスにcondMult適用
    speed   *= condMult;
    stamina *= condMult;
    power   *= condMult;
    burst   *= condMult;
    guts    *= condMult;
    wisdom  *= condMult;

    // 基礎速度（全馬ほぼ同じ。speedは±3%のみ）
    const baseSpeed = 50 + (speed - 50) * 0.06;

    return {
      speed, stamina, power, burst, guts, wisdom,
      base_speed:   baseSpeed,
      fatigue_mult: fatigueMult,  // 距離適性による疲労倍率
      field_mult:   fieldMult,    // 馬場適性（terrain lossに使う）
    };
  }

  // ─── ペース判定 ──────────────────────────────────────────────────
  private _determinePace(simHorses: any[]): string {
    const escapeCount = simHorses.filter(h => h.running_style === '逃げ').length;
    const frontCount  = simHorses.filter(h => ['逃げ','先行'].includes(h.running_style)).length;
    const avgWisdom   = simHorses.reduce((s, h) => s + h.wisdom, 0) / simHorses.length;

    if (escapeCount >= 4 || (escapeCount >= 3 && frontCount >= 5)) return 'ハイペース';
    if (escapeCount === 0 || frontCount <= 2)                       return 'スローペース';
    return avgWisdom > 55
      ? (Math.random() > 0.5 ? 'ミドルペース' : 'スローペース')
      : (Math.random() > 0.4 ? 'ミドルペース' : 'ハイペース');
  }

  // ─── 1ステップシミュレーション ──────────────────────────────────
  private _simulateStage(
    si: number, simHorses: any[], cumPos: Record<number, number>,
    finishedAt: Record<number, number>,
    distance: number, pace: string,
    fieldCondition: string, courseFeature: string,
    weather: string, luckFactor: number,
    prevRankings: Record<number, number>,
  ) {
    const events: any[] = [];
    const posProgress: Record<number, number> = {};
    const expectedSteps = 18;

    for (const h of simHorses) {
      const hn  = h.horse_number;
      const prog = cumPos[hn];

      // ゴール済みはそのまま
      if (finishedAt[hn] !== undefined) {
        posProgress[hn] = cumPos[hn];
        continue;
      }

      // ── 区間判定 ──
      const phase = prog < 0.33 ? 'early'
                  : prog < 0.60 ? 'mid'
                  : prog < 0.75 ? 'transition'
                  :               'sprint';
      const isFront = ['逃げ','先行'].includes(h.running_style);

      // staminaで移行期・直線の垂れを緩和（補正値として保持）
      const staminaBonus = (phase === 'transition' || phase === 'sprint') ? Math.min(0.06, (h.stamina - 50) * 0.003) : 0;

      // ── 疲労の蓄積（案C） ──
      const baseFatigueRate = 1.0 / expectedSteps;
      const frontLoad       = FRONT_LOAD[h.running_style] ?? 1.0;
      const paceFrontAdj    = isFront
        ? (pace === 'ハイペース' ? 1.25 : pace === 'スローペース' ? 0.82 : 1.0)
        : (pace === 'スローペース' ? 1.05 : 1.0);
      const wisdomSave = 1.0 - (h.wisdom - 50) / 500;

      let fatigueInc = baseFatigueRate * (
        phase === 'early' || phase === 'mid'
          ? frontLoad * paceFrontAdj * wisdomSave
          : 1.0 - (FRONT_LOAD[h.running_style] ?? 1.0) * 0.3
      ) * h.fatigue_mult;

      // ハナ争い（逃げ×ハイペース×前半）
      if (h.running_style === '逃げ' && pace === 'ハイペース' && prog < 0.15) {
        if (Math.random() > h.wisdom / 200) {
          fatigueInc *= 1.3;
          if (!events.some(e => e.type === 'hana_arasoi' && e.horse_number === hn)) {
            events.push({ type: 'hana_arasoi', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          }
        }
      }

      h.fatigue = Math.min(1.0, h.fatigue + fatigueInc);

      // ── 速度倍率の決定（線形補間で滑らかにする） ──
      const curves = STYLE_CURVES[h.running_style] || [1, 1, 1, 1];
      let styleMulti = 1.0;
      if (prog < 0.33) {
        styleMulti = curves[0];
      } else if (prog < 0.60) {
        const t = (prog - 0.33) / (0.60 - 0.33);
        styleMulti = curves[0] + (curves[1] - curves[0]) * t;
      } else if (prog < 0.85) {
        const t = (prog - 0.60) / (0.85 - 0.60);
        styleMulti = curves[1] + (curves[2] - curves[1]) * t;
      } else {
        const t = Math.min(1.0, (prog - 0.85) / 0.15);
        styleMulti = curves[2] + (curves[3] - curves[2]) * t;
      }
      if (prog >= 0.60 && prog < 0.85) {
        const cornerBoost = (h.power - 50) * 0.001 * ((prog - 0.60) / 0.25);
        styleMulti += cornerBoost;
      }
      styleMulti += staminaBonus;

      // ── 疲労デバフ（全区間で連続的に適用） ──
      const fatigueImpact = h.fatigue * (1.0 - h.stamina / 200);
      styleMulti *= (1.0 - fatigueImpact * MAX_FATIGUE_IMPACT);

      // ── 根性による粘り（後半、疲労度に応じて滑らかに発動） ──
      if (h.fatigue > 0.5) {
        const gutsRamp = (h.fatigue - 0.5) / 0.5;
        styleMulti += (h.guts - 50) * 0.001 * gutsRamp;
      }

      // ── ガス欠イベント（判定は残すが、速度低下は上記で連続化済み） ──
      if (h.fatigue >= 0.95 && !events.some(e => e.type === 'stamina_depleted' && e.horse_number === hn)) {
        events.push({ type: 'stamina_depleted', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
      }

      // （不要なstepLuck変数を削除しました）

      // ── burstボーナス（終盤、徐々に乗せる） ──
      let burstBonus = 0;
      if (prog > 0.85) {
        const t = (prog - 0.85) / 0.15;
        const scale = BURST_SCALE[h.running_style] ?? 0;
        const effectiveBurst = (h.burst * 0.85) + (h.power * 0.15);
        burstBonus = (effectiveBurst - 50) * scale * 0.008 * t;
        if (burstBonus > 0.05 && h.fatigue < 0.8 && Math.random() < 0.1) {
          if (!events.some(e => e.type === 'last_spurt' && e.horse_number === hn)) {
            events.push({ type: 'last_spurt', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          }
        }
      }

      // ── 根性発揮イベント ──
      if (prog > 0.7 && h.guts > 75 && h.fatigue > 0.6 && Math.random() < 0.05) {
        if (!events.some(e => e.type === 'guts_display' && e.horse_number === hn)) {
          // 根性による瞬間的な速度アップ（乗算化）
          styleMulti *= (1.0 + (h.guts - 50) * 0.001);
          events.push({ type: 'guts_display', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
        }
      }

      // ── 速度倍率の補正 ──
      let terrainMod = 1.0;
      if (fieldCondition !== '良') {
        const baseLoss = fieldCondition === '稍重' ? 0.02 : fieldCondition === '重' ? 0.04 : 0.06;
        terrainMod = 1.0 - baseLoss * (1.0 - (h.power - 50) / 400) * (1.0 / h.field_mult);
      }
      let weatherMod = 1.0;
      if      (weather === '雨')  weatherMod = 0.97 + h.power / 5000;
      else if (weather === '強風') weatherMod = isFront ? 0.99 : 1.01;
      else if (weather === '雪')  weatherMod = 0.94 + h.power / 3000;

      // ── ペース補正 ──
      let paceMod = 1.0;
      if (pace === 'ハイペース') {
        paceMod = (phase === 'early' || phase === 'mid')
          ? (isFront ? 1.04 : 0.97)
          : (isFront ? 0.92 : 1.07);
      } else if (pace === 'スローペース') {
        paceMod = (phase === 'early' || phase === 'mid')
          ? 0.96
          : (isFront ? 1.06 : 0.95);
      }

      // ── luck（直線は振れ幅大） ──
      const luckScale = phase === 'sprint' ? luckFactor * LATE_LUCK_MULT : luckFactor;
      let luck = h.running_style === '暴れ馬'
        ? gauss(0, luckScale * 2.5)
        : gauss(0, luckScale);

      // ── イベント（luckへの加減算） ──

      // スタート
      if (prog < 0.02 && !events.some(e => e.horse_number === hn && (e.type === 'bad_start' || e.type === 'good_start'))) {
        const r = Math.random();
        if (h.running_style === '暴れ馬') {
          if (r < 0.25)    { luck -= luckFactor * 3.0; events.push({ type: 'bad_start', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name, wild: true }); }
          else if (r > 0.875) { luck += luckFactor * 1.5; events.push({ type: 'good_start', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name }); }
        } else {
          const badThr  = 0.10 - (h.wisdom - 50) / 1000;
          const goodThr = 0.88 + (h.wisdom - 50) / 2000;
          if (r < badThr)      { luck -= luckFactor * 2.0; events.push({ type: 'bad_start', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name }); }
          else if (r > goodThr){ luck += luckFactor * 1.5; events.push({ type: 'good_start', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name }); }
        }
      }

      // 前詰まり（wisdomで回避）
      if (prog < 0.66) {
        const prob = Math.max(0.05, 0.08 - (h.wisdom - 50) / 2000);
        if (Math.random() < prob) {
          if (h.power >= 75) {
            luck -= luckFactor * 0.9;
            events.push({ type: 'breakthrough', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          } else {
            luck -= luckFactor * 1.8;
            events.push({ type: 'interference', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          }
        }
      }

      // 暴れ馬：中盤制御不能
      if (h.running_style === '暴れ馬' && prog >= 0.20 && prog < 0.55) {
        if (Math.random() < 0.15) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          luck += dir * luckFactor * 4.0;
          events.push({ type: 'wild_control_lost', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name, direction: dir > 0 ? '加速' : '大失速' });
        }
      }

      // 暴れ馬：直線爆発
      if (h.running_style === '暴れ馬' && phase === 'sprint' && h.fatigue < 0.8) {
        if (Math.random() < 0.20) {
          luck += luckFactor * 2.5;
          events.push({ type: 'wild_explosion', horse_number: hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
        }
      }

      // ── 進捗計算 ──
      // 全ての倍率を乗算し、最後にLuckを加算する（Luckはガウス分布で中心は0）
      const effectiveSpeed = h.base_speed * styleMulti * paceMod * terrainMod * weatherMod * (1.0 + burstBonus) + luck;
      const incr = Math.max(0.003, effectiveSpeed / DIVISOR);
      const next = prog + incr;  // 1.0超えても記録（finishedAtで管理）
      posProgress[hn] = next;

      // ゴール判定
      if (next >= 1.0 && finishedAt[hn] === undefined) {
        const fraction = (1.0 - prog) / incr;
        finishedAt[hn] = si + fraction;
      }
    }

    // ── 順位計算 ──
    const sorted = Object.entries(posProgress)
      .map(([hn, p]) => ({ hn: parseInt(hn), p }))
      .sort((a, b) => b.p - a.p);
    const rankings: Record<number, number> = {};
    sorted.forEach((x, i) => { rankings[x.hn] = i + 1; });

    // ── 順位変動イベント ──
    if (si > 0) {
      const newLeaderHn = sorted[0].hn;
      if (prevRankings[newLeaderHn] && prevRankings[newLeaderHn] > 1) {
        const h = simHorses.find(z => z.horse_number === newLeaderHn)!;
        events.push({ type: 'leader_change', horse_number: newLeaderHn, horse_name: h.horse_name, jockey_name: h.jockey_name });
      }

      if (sorted.length > 1) {
        const leadDiff = sorted[0].p - sorted[1].p;
        if (leadDiff > 0.03 && Math.random() < 0.15) {
          const h = simHorses.find(z => z.horse_number === sorted[0].hn)!;
          if (!events.some(e => e.type === 'lead_big')) {
            events.push({ type: 'lead_big', horse_number: sorted[0].hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          }
        } else if (leadDiff < 0.005 && Math.random() < 0.15) {
          const h = simHorses.find(z => z.horse_number === sorted[0].hn)!;
          if (!events.some(e => e.type === 'lead_close')) {
            events.push({ type: 'lead_close', horse_number: sorted[0].hn, horse_name: h.horse_name, jockey_name: h.jockey_name });
          }
        }
      }

      for (const h of simHorses) {
        const currRank = rankings[h.horse_number];
        const prevRank = prevRankings[h.horse_number];
        if (currRank && prevRank && currRank < prevRank) {
          if (prevRank - currRank >= 3 && Math.random() < 0.3) {
            events.push({ type: 'pos_up', horse_number: h.horse_number, horse_name: h.horse_name, jockey_name: h.jockey_name });
          } else if (prevRank - currRank >= 1 && currRank > 1 && Math.random() < 0.15) {
            const targetHn = sorted[currRank]?.hn; // sorted is 0-indexed, so sorted[currRank] is rank+1
            if (targetHn) {
              const target = simHorses.find(z => z.horse_number === targetHn)!;
              events.push({ type: 'overtake', horse_number: h.horse_number, horse_name: h.horse_name, jockey_name: h.jockey_name, target_name: target.horse_name });
            }
          }
        }
      }
    }

    return {
      stage_idx:          si,
      stage_name:         si < this.STAGES.length ? this.STAGES[si] : 'run',
      stage_name_jp:      si < this.STAGE_NAMES_JP.length ? this.STAGE_NAMES_JP[si] : '走行中',
      positions_progress: posProgress,
      rankings,
      events,
      sorted_horses: sorted.map((x, i) => {
        const h = simHorses.find(z => z.horse_number === x.hn)!;
        return {
          horse_number:  x.hn,
          horse_name:    h.horse_name,
          jockey_name:   h.jockey_name,
          running_style: h.running_style,
          position:      i + 1,
          progress:      Math.min(1.0, x.p),
        };
      }),
    };
  }

  // ─── 最終結果 ────────────────────────────────────────────────────
  private _calcFinalResults(
    simHorses: any[], finishedAt: Record<number, number>,
    distance: number, fieldCondition: string,
  ) {
    const baseTime = this._baseTime(distance, fieldCondition);
    const sorted   = Object.entries(finishedAt)
      .map(([hn, fAt]) => ({ hn: parseInt(hn), fAt }))
      .sort((a, b) => a.fAt - b.fAt);

    const firstAt = sorted[0].fAt;
    const results: any[] = [];
    let prevTime: number | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const { hn, fAt } = sorted[i];
      const h = simHorses.find(x => x.horse_number === hn)!;
      const diff = fAt - firstAt;

      let finishTime = baseTime + diff * 14.0;
      if (prevTime !== null && finishTime <= prevTime) finishTime = prevTime + 0.1;
      finishTime = Math.round(finishTime * 10) / 10;

      results.push({
        position:      i + 1,
        horse_number:  hn,
        horse_name:    h.horse_name,
        jockey_name:   h.jockey_name,
        running_style: h.running_style,
        finish_time:   finishTime,
        margin:        i === 0 ? '────' : this._margin(finishTime - prevTime!),
      });
      prevTime = finishTime;
    }
    return results;
  }

  // ─── ユーティリティ ─────────────────────────────────────────────
  private _baseTime(distance: number, fieldCondition: string): number {
    let base = (distance / 200) * 12.0;
    if      (fieldCondition === '稍重') base *= 1.01;
    else if (fieldCondition === '重')   base *= 1.03;
    else if (fieldCondition === '不良') base *= 1.05;
    return Math.round(base * 10) / 10;
  }

  private _margin(diff: number): string {
    for (const [threshold, text] of MARGINS) {
      if (diff <= (threshold as number)) return text as string;
    }
    return '大差';
  }

  private _distCat(distance: number): string {
    for (const [cat, [min, max]] of Object.entries(DISTANCE_CATEGORIES)) {
      if (distance >= min && distance <= max) return cat;
    }
    return distance < 1000 ? '短距離' : '長距離';
  }
}

export const raceSimulator = new RaceSimulator();
