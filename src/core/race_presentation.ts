export type PhotoFinishReason = 'actual' | 'drama';

export interface PhotoFinishPlan {
  enabled: boolean;
  reason?: PhotoFinishReason;
  contenderHorseNumbers: number[];
  rawGapSeconds: number;
  frameCount: number;
}

export interface RaceHighlight {
  stageIndex: number;
  eventTypes: string[];
  label: string;
  description: string;
  horseNumbers: number[];
  importance: number;
}

export type DramaPattern = 'pack_compression' | 'late_charge' | 'escape_tension' | 'head_to_head' | 'second_wind';

export interface DramaMoment {
  stageIndex: number;
  type: DramaPattern;
  label: string;
  commentaryKey: string;
  horseNumbers: number[];
  horseNames: string[];
}

export interface RacePresentationPlan {
  photoFinish: PhotoFinishPlan;
  highlights: RaceHighlight[];
  dramaEnabled: boolean;
  visualOffsets: Record<number, number>[];
  dramaMoments: DramaMoment[];
}

const HIGHLIGHT_LABELS: Record<string, string> = {
  bad_start: '出遅れ',
  good_start: '好スタート',
  hana_arasoi: '激しいハナ争い',
  corner_boost: 'コーナーからのまくり',
  breakthrough: '馬群を突破',
  leader_change: '先頭交代',
  pos_up: '大きな追い上げ',
  last_spurt: 'ラストスパート',
  guts_display: 'ゴール前の粘り',
  wild_explosion: '爆発的な加速',
  close_battle: '先頭争いが激化',
  big_move: '後方から一気',
  dominant_lead: '大きく抜け出す',
  pack_compression: '馬群が凝縮',
  late_charge: '後方から急浮上',
  escape_tension: '逃げ馬がリード',
  head_to_head: '二頭の叩き合い',
  second_wind: 'もうひと伸び',
};

const HIGHLIGHT_WEIGHTS: Record<string, number> = {
  photo_finish: 120,
  leader_change: 90,
  wild_explosion: 86,
  big_move: 82,
  corner_boost: 78,
  pos_up: 74,
  close_battle: 72,
  bad_start: 68,
  hana_arasoi: 64,
  breakthrough: 60,
  last_spurt: 58,
  dominant_lead: 50,
  good_start: 42,
  guts_display: 40,
  pack_compression: 66,
  late_charge: 84,
  escape_tension: 62,
  head_to_head: 88,
  second_wind: 70,
};

function hashToUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function buildVisualDrama(stages: any[], enabled: boolean): {
  visualOffsets: Record<number, number>[];
  dramaMoments: DramaMoment[];
} {
  const visualOffsets = stages.map(() => ({} as Record<number, number>));
  const dramaMoments: DramaMoment[] = [];
  if (!enabled) return { visualOffsets, dramaMoments };

  const addMoment = (stageIndex: number, type: DramaPattern, commentaryKey: string, horses: any[]) => {
    if (dramaMoments.some(moment => moment.type === type && Math.abs(moment.stageIndex - stageIndex) <= 2)) return;
    dramaMoments.push({
      stageIndex,
      type,
      label: HIGHLIGHT_LABELS[type],
      commentaryKey,
      horseNumbers: horses.map(horse => Number(horse.horse_number)).filter(Number.isFinite).slice(0, 3),
      horseNames: horses.map(horse => String(horse.horse_name || `${horse.horse_number}番`)).slice(0, 3),
    });
  };

  stages.forEach((stage, stageIndex) => {
    if (stageIndex === 0) return;
    const order = stage.sorted_horses || [];
    const previous = stages[stageIndex - 1]?.sorted_horses || [];
    const leader = order[0];
    const second = order[1];
    const leaderProgress = Number(leader?.progress || 0);
    // Every display offset is gone before the finish-frame buffer starts.
    if (!leader || leaderProgress < 0.32 || leaderProgress >= 0.90) return;
    const decay = leaderProgress <= 0.78 ? 1 : Math.max(0, (0.90 - leaderProgress) / 0.12);
    const previousRanks = new Map<number, number>(previous.map((horse: any) => [Number(horse.horse_number), Number(horse.position)]));
    const key = `${stageIndex}:${order.map((horse: any) => `${horse.horse_number}:${Number(horse.progress).toFixed(3)}`).join('|')}`;
    const roll = hashToUnit(key);
    const setOffset = (horseNumber: number, value: number) => {
      visualOffsets[stageIndex][horseNumber] = Math.max(-0.01, Math.min(0.01, value * decay));
    };

    const mover = order
      .map((horse: any) => ({ horse, gain: (previousRanks.get(Number(horse.horse_number)) || Number(horse.position)) - Number(horse.position) }))
      .filter((item: any) => item.gain >= 2 && Number(item.horse.position) <= 7)
      .sort((a: any, b: any) => b.gain - a.gain)[0];
    const leadGap = second ? leaderProgress - Number(second.progress) : 1;
    const eligiblePack = order.filter((horse: any) => leaderProgress - Number(horse.progress) <= 0.055);

    if (mover && leaderProgress >= 0.58 && roll < 0.78) {
      setOffset(Number(mover.horse.horse_number), 0.008);
      addMoment(stageIndex, 'late_charge', 'DRAMA_LATE_CHARGE', [mover.horse]);
      return;
    }
    if (second && leaderProgress >= 0.65 && leadGap <= 0.012 && roll < 0.86) {
      const direction = hashToUnit(`${key}:duel`) < 0.5 ? -1 : 1;
      setOffset(Number(leader.horse_number), direction * 0.0025);
      setOffset(Number(second.horse_number), direction * -0.0025);
      addMoment(stageIndex, 'head_to_head', 'DRAMA_HEAD_TO_HEAD', [leader, second]);
      return;
    }
    if (leaderProgress <= 0.82 && eligiblePack.length >= 4 && roll < 0.68) {
      eligiblePack.slice(1, 7).forEach((horse: any) => {
        setOffset(Number(horse.horse_number), Math.min(0.008, (leaderProgress - Number(horse.progress)) * 0.22));
      });
      addMoment(stageIndex, 'pack_compression', 'DRAMA_PACK_COMPRESSION', eligiblePack.slice(0, 3));
      return;
    }
    if (leaderProgress <= 0.76 && leadGap >= 0.025 && leadGap <= 0.070 && roll < 0.56) {
      setOffset(Number(leader.horse_number), 0.006);
      addMoment(stageIndex, 'escape_tension', 'DRAMA_ESCAPE_TENSION', [leader]);
      return;
    }
    const fadingHorse = order.find((horse: any) => {
      const previousRank = previousRanks.get(Number(horse.horse_number)) || Number(horse.position);
      return Number(horse.position) <= 7 && Number(horse.position) - previousRank >= 2;
    });
    if (fadingHorse && leaderProgress >= 0.52 && roll < 0.44) {
      setOffset(Number(fadingHorse.horse_number), 0.005);
      addMoment(stageIndex, 'second_wind', 'DRAMA_SECOND_WIND', [fadingHorse]);
    }
  });

  return { visualOffsets, dramaMoments };
}

export function buildHighlights(stages: any[], photoFinish: boolean, dramaMoments: DramaMoment[] = []): RaceHighlight[] {
  const candidates: RaceHighlight[] = [];
  const firstFinishIndex = stages.findIndex(stage => Number(stage.sorted_horses?.[0]?.progress || 0) >= 1);
  const finishStageIndex = firstFinishIndex >= 0 ? firstFinishIndex : Math.max(0, stages.length - 1);
  stages.forEach((stage, stageIndex) => {
    // 1着馬のゴール後は全馬入線待ち区間。順位変動があってもレースの
    // ハイライトとしては扱わず、実際の決勝線到達を最終章にする。
    if (stageIndex > finishStageIndex) return;
    const previous = stages[Math.max(0, stageIndex - 1)];
    const currentOrder = stage.sorted_horses || [];
    const previousRanks = new Map<number, number>((previous?.sorted_horses || []).map((horse: any) => [horse.horse_number, horse.position]));
    const stageEvents = stage.events || [];
    const eventTypes = [...new Set<string>(stageEvents.map((event: any) => String(event.type)))]
      .filter(type => HIGHLIGHT_LABELS[type]);
    const horseNumbers = new Set<number>(stageEvents.map((event: any) => Number(event.horse_number)).filter(Number.isFinite));

    const biggestMover = currentOrder.reduce((best: { horse_number: number; gain: number } | null, horse: any) => {
      const gain = (previousRanks.get(horse.horse_number) || horse.position) - horse.position;
      return gain > (best?.gain || 0) ? { horse_number: horse.horse_number, gain } : best;
    }, null);
    if (biggestMover && biggestMover.gain >= 3) {
      eventTypes.push('big_move');
      horseNumbers.add(biggestMover.horse_number);
    }

    const leader = currentOrder[0];
    const second = currentOrder[1];
    const leadGap = leader && second ? Number(leader.progress) - Number(second.progress) : 999;
    if (Number(leader?.progress) >= 0.62 && leadGap <= 0.008) eventTypes.push('close_battle');
    if (Number(leader?.progress) >= 0.35 && leadGap >= 0.035) eventTypes.push('dominant_lead');

    const uniqueTypes = [...new Set(eventTypes)];
    if (!uniqueTypes.length) return;
    const primaryType = [...uniqueTypes].sort((a, b) => (HIGHLIGHT_WEIGHTS[b] || 0) - (HIGHLIGHT_WEIGHTS[a] || 0))[0];
    let focusHorseNumbers: number[];
    if (primaryType === 'big_move' && biggestMover) {
      focusHorseNumbers = [biggestMover.horse_number];
    } else if (primaryType === 'close_battle' || primaryType === 'dominant_lead') {
      focusHorseNumbers = currentOrder.slice(0, primaryType === 'close_battle' ? 2 : 1).map((horse: any) => Number(horse.horse_number));
    } else {
      focusHorseNumbers = stageEvents
        .filter((event: any) => String(event.type) === primaryType)
        .map((event: any) => Number(event.horse_number))
        .filter(Number.isFinite);
    }
    if (!focusHorseNumbers.length) focusHorseNumbers = [...horseNumbers];
    const names = focusHorseNumbers.map(horseNumber => {
      const matchingEvent = stageEvents.find((event: any) => Number(event.horse_number) === horseNumber && event.horse_name);
      const matchingHorse = currentOrder.find((horse: any) => Number(horse.horse_number) === horseNumber);
      return String(matchingEvent?.horse_name || matchingHorse?.horse_name || `${horseNumber}番`);
    });
    candidates.push({
      stageIndex,
      eventTypes: uniqueTypes,
      label: HIGHLIGHT_LABELS[primaryType] || 'レースが動く',
      description: names.length ? [...new Set(names)].slice(0, 2).join('・') : stage.stage_name_jp || '重要場面',
      horseNumbers: [...new Set(focusHorseNumbers)].slice(0, 3),
      importance: (HIGHLIGHT_WEIGHTS[primaryType] || 30) + Math.round(Number(leader?.progress || 0) * 10),
    });
  });

  dramaMoments.forEach(moment => {
    candidates.push({
      stageIndex: moment.stageIndex,
      eventTypes: [moment.type],
      label: moment.label,
      description: moment.horseNames.join('・') || '演出場面',
      horseNumbers: moment.horseNumbers,
      importance: HIGHLIGHT_WEIGHTS[moment.type] || 60,
    });
  });

  const selected: RaceHighlight[] = [];
  [...candidates].sort((a, b) => b.importance - a.importance).forEach(candidate => {
    if (selected.length >= 5) return;
    if (selected.some(item => Math.abs(item.stageIndex - candidate.stageIndex) <= 1 && item.label === candidate.label)) return;
    selected.push(candidate);
  });
  if (!selected.some(item => item.stageIndex === finishStageIndex)) {
    selected.push({
      stageIndex: finishStageIndex,
      eventTypes: photoFinish ? ['photo_finish'] : ['finish'],
      label: photoFinish ? '写真判定' : 'ゴール',
      description: photoFinish ? 'わずかな差の決着' : '勝負決着',
      horseNumbers: [],
      importance: photoFinish ? 120 : 100,
    });
  }
  return selected.sort((a, b) => a.stageIndex - b.stageIndex).slice(0, 6);
}

/**
 * Creates a display-only plan. It never changes results, times, or positions.
 * A genuinely tiny gap always produces a photo finish. A slightly wider but
 * still plausible gap may be selected by the drama director; the official
 * winner continues to come from results[0].
 */
export function buildRacePresentation(results: any[], stages: any[], dramaEnabled = true): RacePresentationPlan {
  const first = results[0];
  const second = results[1];
  const rawGapSeconds = Number(second?.raw_gap_seconds ?? 999);
  const certainThreshold = 0.12;
  const dramaLimit = 0.34;
  let enabled = rawGapSeconds <= certainThreshold;
  let reason: PhotoFinishReason | undefined = enabled ? 'actual' : undefined;

  if (!enabled && dramaEnabled && rawGapSeconds <= dramaLimit && first && second) {
    const closeness = 1 - (rawGapSeconds - certainThreshold) / (dramaLimit - certainThreshold);
    const chance = Math.max(0, Math.min(0.42, closeness * 0.42));
    const key = `${first.horse_number}:${second.horse_number}:${first.raw_finish_at}:${second.raw_finish_at}`;
    if (hashToUnit(key) < chance) {
      enabled = true;
      reason = 'drama';
    }
  }

  const photoFinish: PhotoFinishPlan = {
    enabled,
    reason,
    contenderHorseNumbers: enabled ? [first.horse_number, second.horse_number] : [],
    rawGapSeconds: Number.isFinite(rawGapSeconds) ? rawGapSeconds : 999,
    frameCount: 7,
  };
  const { visualOffsets, dramaMoments } = buildVisualDrama(stages, dramaEnabled);

  return {
    photoFinish,
    highlights: buildHighlights(stages, enabled, dramaMoments),
    dramaEnabled,
    visualOffsets,
    dramaMoments,
  };
}
