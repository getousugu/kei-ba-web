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
}

export interface RacePresentationPlan {
  photoFinish: PhotoFinishPlan;
  highlights: RaceHighlight[];
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
};

function hashToUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function buildHighlights(stages: any[], photoFinish: boolean): RaceHighlight[] {
  const candidates: RaceHighlight[] = [];
  stages.forEach((stage, stageIndex) => {
    const eventTypes = [...new Set<string>((stage.events || []).map((event: any) => String(event.type)))]
      .filter(type => HIGHLIGHT_LABELS[type]);
    if (!eventTypes.length) return;
    candidates.push({
      stageIndex,
      eventTypes,
      label: HIGHLIGHT_LABELS[eventTypes[0]],
    });
  });

  const preferred = candidates.filter(item => item.eventTypes.some(type => [
    'bad_start', 'hana_arasoi', 'corner_boost', 'leader_change', 'pos_up', 'last_spurt', 'wild_explosion'
  ].includes(type)));
  const selected = (preferred.length ? preferred : candidates).slice(0, 5);
  const finalStageIndex = Math.max(0, stages.length - 1);
  if (!selected.some(item => item.stageIndex === finalStageIndex)) {
    selected.push({
      stageIndex: finalStageIndex,
      eventTypes: photoFinish ? ['photo_finish'] : ['finish'],
      label: photoFinish ? '写真判定' : 'ゴール',
    });
  }
  return selected.slice(-6);
}

/**
 * Creates a display-only plan. It never changes results, times, or positions.
 * A genuinely tiny gap always produces a photo finish. A slightly wider but
 * still plausible gap may be selected by the drama director; the official
 * winner continues to come from results[0].
 */
export function buildRacePresentation(results: any[], stages: any[]): RacePresentationPlan {
  const first = results[0];
  const second = results[1];
  const rawGapSeconds = Number(second?.raw_gap_seconds ?? 999);
  const certainThreshold = 0.12;
  const dramaLimit = 0.34;

  let enabled = rawGapSeconds <= certainThreshold;
  let reason: PhotoFinishReason | undefined = enabled ? 'actual' : undefined;

  if (!enabled && rawGapSeconds <= dramaLimit && first && second) {
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

  return {
    photoFinish,
    highlights: buildHighlights(stages, enabled),
  };
}
