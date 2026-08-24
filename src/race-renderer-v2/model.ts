export type CameraMode = 'auto' | 'broadcast' | 'leader' | 'overview';
export type MockScene = 'gate' | 'race' | 'final' | 'photo';
export type RunnerStyle = 'horse' | 'marker';

export interface RenderHorse {
  number: number;
  name: string;
  color: string;
  progress: number;
  lane: number;
  rank: number;
  energy: number;
}

export interface MockFrame {
  time: number;
  displayTime: number;
  phase: 'gate' | 'opening' | 'race' | 'final' | 'photo_wait' | 'photo_review' | 'photo_result';
  phaseLabel: string;
  commentary: string;
  gateOpen: number;
  horses: RenderHorse[];
  remaining: number;
  pace: string;
  photoFrame: number;
  photoFrameCount: number;
  officialOrderReady: boolean;
  officialOrder: number[];
}

export const MOCK_DURATION = 62;
export const SCENE_TIMES: Record<MockScene, number> = {
  gate: 1.5,
  race: 18,
  final: 45,
  photo: 52.35,
};

export const PHOTO_REVIEW_START = 55;
export const PHOTO_RESULT_START = 58.5;
const PHOTO_FRAME_COUNT = 7;
const PHOTO_REPLAY_FROM = 51.92;
const PHOTO_REPLAY_TO = 52.42;

const HORSES = [
  ['ノーザンライト', '#ef174f', -0.4, 0.002, 0.006],
  ['ブルーリボン', '#ff6a00', 0.5, 0.012, -0.003],
  ['ゴールドラッシュ', '#f5b400', -1.2, -0.003, 0.002],
  ['グリーンフラッシュ', '#12c96b', 1.4, 0.006, -0.006],
  ['アクアマリン', '#12b7ce', -1.8, -0.008, 0.010],
  ['ロイヤルブルー', '#5269ed', 1.9, 0.009, -0.005],
  ['ヴァイオレット', '#9a13e8', -0.8, -0.004, 0.003],
  ['ローズクイーン', '#ed1771', 0.9, 0.004, 0.009],
  ['ターコイズ', '#16ad9c', -1.5, -0.006, -0.007],
  ['クリムゾン', '#f00f53', 1.6, 0.007, -0.009],
  ['ライムスター', '#55cf09', -0.1, -0.010, 0.005],
  ['スカイブルー', '#169bd5', 0.2, -0.009, -0.010],
] as const;

const smoothstep = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function sampleHorsePositions(positionTime: number): RenderHorse[] {
  const raceT = Math.max(0, positionTime - 5.2);
  const base = Math.min(1.028, raceT / 47.2);
  const launchBlend = smoothstep(0, 0.08, base);
  const finishAtBase = [1.0000, 1.006, 1.010, 1.014, 1.004, 1.008, 1.016, 1.00015, 1.020, 1.012, 1.018, 1.022];
  const horses = HORSES.map(([name, color, runningLane, early, late], index) => {
    const gateLane = index - 5.5;
    const lane = gateLane + (runningLane - gateLane) * launchBlend
      + Math.sin(base * Math.PI * 3 + index * 1.7) * 0.13 * smoothstep(0.12, 0.8, base);
    const earlyShape = Math.sin(Math.min(1, base) * Math.PI);
    const lateShape = smoothstep(0.62, 0.96, base);
    const rhythm = Math.sin(base * 12 + index * 0.91) * 0.0025 * earlyShape;
    let progress = base + early * earlyShape + late * lateShape + rhythm;

    // Every runner keeps its continuous real position. These deterministic finish
    // instants establish the official order without rearranging photo-review frames.
    const finishTarget = 1 + (base - finishAtBase[index]) * 1.4;
    const finishBlend = smoothstep(0.90, 0.975, base);
    progress += (finishTarget - progress) * finishBlend;
    if (positionTime < 5.2) progress = 0;

    return {
      number: index + 1,
      name,
      color,
      progress,
      lane,
      rank: 0,
      energy: Math.max(0.08, 1 - base * (0.58 + index * 0.012)),
    };
  });

  const ordered = [...horses].sort((a, b) => b.progress - a.progress || a.number - b.number);
  ordered.forEach((horse, index) => { horse.rank = index + 1; });
  return horses;
}

export function sampleMockRace(time: number): MockFrame {
  const t = ((time % MOCK_DURATION) + MOCK_DURATION) % MOCK_DURATION;
  const actualBase = Math.min(1.028, Math.max(0, t - 5.2) / 47.2);
  let phase: MockFrame['phase'];
  if (t < 4) phase = 'gate';
  else if (t < 5.2) phase = 'opening';
  else if (actualBase < 0.82) phase = 'race';
  else if (actualBase < 1) phase = 'final';
  else if (t < PHOTO_REVIEW_START) phase = 'photo_wait';
  else if (t < PHOTO_RESULT_START) phase = 'photo_review';
  else phase = 'photo_result';

  let photoFrame = 0;
  let displayTime = t;
  if (phase === 'photo_review' || phase === 'photo_result') {
    photoFrame = phase === 'photo_result'
      ? PHOTO_FRAME_COUNT - 1
      : Math.min(PHOTO_FRAME_COUNT - 1, Math.floor((t - PHOTO_REVIEW_START) / ((PHOTO_RESULT_START - PHOTO_REVIEW_START) / PHOTO_FRAME_COUNT)));
    displayTime = PHOTO_REPLAY_FROM + (PHOTO_REPLAY_TO - PHOTO_REPLAY_FROM) * (photoFrame / (PHOTO_FRAME_COUNT - 1));
  }

  const gateOpen = smoothstep(4, 5.2, displayTime);
  const horses = sampleHorsePositions(displayTime);
  const ordered = [...horses].sort((a, b) => b.progress - a.progress || a.number - b.number);
  const leader = ordered[0];

  const phaseCopy = {
    gate: ['発走準備', '各馬、静かにゲートへ収まります'],
    opening: ['スタート', 'ゲートが開いた！ 12頭一斉に飛び出します'],
    race: ['向正面', `${leader.name}が先頭、馬群はひと固まり`],
    final: ['最後の直線', `${leader.name}先頭！ 後続も一気に迫る`],
    photo_wait: ['写真判定待ち', '1着・2着は写真判定。後続各馬も入線します'],
    photo_review: ['写真判定', `ゴール時点を確認中 ${photoFrame + 1}/${PHOTO_FRAME_COUNT}`],
    photo_result: ['判定結果', 'こっちだ！ 1番ノーザンライトがわずかに先着'],
  } as const;

  return {
    time: t,
    displayTime,
    phase,
    phaseLabel: phaseCopy[phase][0],
    commentary: phaseCopy[phase][1],
    gateOpen,
    horses,
    remaining: Math.max(0, Math.round(1600 * (1 - Math.min(1, leader.progress)))),
    pace: actualBase < 0.58 ? 'ミドルペース' : 'ペース上昇',
    photoFrame,
    photoFrameCount: PHOTO_FRAME_COUNT,
    officialOrderReady: t >= PHOTO_REVIEW_START,
    officialOrder: [1, 8, 5, 2, 6, 3, 10, 4, 7, 11, 9, 12],
  };
}
