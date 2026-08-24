export type CameraMode = 'auto' | 'broadcast' | 'leader' | 'overview';
export type MockScene = 'gate' | 'race' | 'final' | 'photo';

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
  phase: 'gate' | 'opening' | 'race' | 'final' | 'photo';
  phaseLabel: string;
  commentary: string;
  gateOpen: number;
  horses: RenderHorse[];
  remaining: number;
  pace: string;
}

export const MOCK_DURATION = 60;
export const SCENE_TIMES: Record<MockScene, number> = {
  gate: 1.5,
  race: 18,
  final: 45,
  photo: 55,
};

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

export function sampleMockRace(time: number): MockFrame {
  const t = ((time % MOCK_DURATION) + MOCK_DURATION) % MOCK_DURATION;
  const gateOpen = smoothstep(4, 5.2, t);
  const raceT = Math.max(0, t - 5.2);
  const base = Math.min(1.012, raceT / 47.2);
  const launchBlend = smoothstep(0, 0.08, base);

  let phase: MockFrame['phase'];
  if (t < 4) phase = 'gate';
  else if (t < 5.2) phase = 'opening';
  else if (base < 0.82) phase = 'race';
  else if (base < 1) phase = 'final';
  else phase = 'photo';

  const horses = HORSES.map(([name, color, runningLane, early, late], index) => {
    const gateLane = index - 5.5;
    const lane = gateLane + (runningLane - gateLane) * launchBlend
      + Math.sin(base * Math.PI * 3 + index * 1.7) * 0.13 * smoothstep(0.12, 0.8, base);
    const earlyShape = Math.sin(Math.min(1, base) * Math.PI);
    const lateShape = smoothstep(0.62, 0.96, base);
    const rhythm = Math.sin(base * 12 + index * 0.91) * 0.0025 * earlyShape;
    let progress = base + early * earlyShape + late * lateShape + rhythm;

    // The mock's top two converge naturally at the line so photo-finish framing can be judged.
    if (index === 0) progress += 0.0055 * lateShape;
    if (index === 7) progress += 0.0025 * lateShape;
    const finishTargets = [1.0020, 0.985, 0.977, 0.970, 0.992, 0.982, 0.966, 1.0012, 0.958, 0.974, 0.963, 0.952];
    const finishBlend = smoothstep(0.94, 1, base);
    progress += (finishTargets[index] - progress) * finishBlend;
    if (t < 5.2) progress = 0;

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
  const leader = ordered[0];

  const phaseCopy = {
    gate: ['発走準備', '各馬、静かにゲートへ収まります'],
    opening: ['スタート', 'ゲートが開いた！ 12頭一斉に飛び出します'],
    race: ['向正面', `${leader.name}が先頭、馬群はひと固まり`],
    final: ['最後の直線', `${leader.name}先頭！ 後続も一気に迫る`],
    photo: ['写真判定', '並んでゴール！ 勝敗は写真判定へ'],
  } as const;

  return {
    time: t,
    phase,
    phaseLabel: phaseCopy[phase][0],
    commentary: phaseCopy[phase][1],
    gateOpen,
    horses,
    remaining: Math.max(0, Math.round(1600 * (1 - Math.min(1, leader.progress)))),
    pace: base < 0.58 ? 'ミドルペース' : 'ペース上昇',
  };
}
