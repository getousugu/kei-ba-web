import type { CameraMode, MockFrame, RenderHorse } from './model';

type Vec = { x: number; y: number };
type Camera = Vec & { zoom: number };

const RX = 1260;
const RY = 690;
const TRACK_HALF = 190;
const LANE_STEP = 27;

function trackPoint(progress: number, lane = 0) {
  const angle = Math.PI / 2 - progress * Math.PI * 2;
  const radialX = Math.cos(angle);
  const radialY = Math.sin(angle);
  const x = (RX + lane * LANE_STEP) * radialX;
  const y = (RY + lane * LANE_STEP) * radialY;
  const dx = RX * Math.sin(angle);
  const dy = -RY * Math.cos(angle);
  return { x, y, rotation: Math.atan2(dy, dx), angle };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawTrack(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#092b1c';
  ctx.fillRect(-2200, -1500, 4400, 3000);

  ctx.save();
  ctx.strokeStyle = '#7f6748';
  ctx.lineWidth = TRACK_HALF * 2 + 26;
  ctx.beginPath(); ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#c9aa77';
  ctx.lineWidth = TRACK_HALF * 2;
  ctx.beginPath(); ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2); ctx.stroke();

  for (const offset of [-135, -68, 0, 68, 135]) {
    ctx.strokeStyle = offset === 0 ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash(offset === 0 ? [18, 24] : [7, 20]);
    ctx.beginPath(); ctx.ellipse(0, 0, RX + offset, RY + offset, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = '#e7ede9';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.ellipse(0, 0, RX - TRACK_HALF, RY - TRACK_HALF, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, RX + TRACK_HALF, RY + TRACK_HALF, 0, 0, Math.PI * 2); ctx.stroke();

  // Finish line at the same world coordinate used by gate, race, and photo finish.
  const finish = trackPoint(0);
  for (let i = -7; i < 7; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#202420';
      ctx.fillRect(finish.x - 8 + j * 8, finish.y + i * 27, 8, 27);
    }
  }
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, frame: MockFrame) {
  if (frame.phase !== 'gate' && frame.phase !== 'opening') return;
  const open = frame.gateOpen;
  frame.horses.forEach(horse => {
    const p = trackPoint(0, horse.lane);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.strokeStyle = '#cbd5d0';
    ctx.fillStyle = 'rgba(35,47,42,.9)';
    ctx.lineWidth = 3;
    ctx.fillRect(-112, -12, 105, 24);
    ctx.strokeRect(-112, -12, 105, 24);
    ctx.save(); ctx.translate(-7, 0); ctx.rotate(-open * Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(-7, 0); ctx.rotate(open * Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 12); ctx.stroke(); ctx.restore();
    ctx.restore();
  });
}

function drawHorse(ctx: CanvasRenderingContext2D, horse: RenderHorse, frame: MockFrame, now: number, selected: number | null) {
  const p = trackPoint(horse.progress, horse.lane);
  const gateOffset = frame.phase === 'gate' || frame.phase === 'opening' ? -72 * (1 - frame.gateOpen) : 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.translate(gateOffset, 0);

  const bob = frame.phase === 'race' || frame.phase === 'final' ? Math.sin(now * 0.018 + horse.number) * 1.4 : 0;
  ctx.translate(0, bob);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(-2, 5, 23, 10, 0, 0, Math.PI * 2); ctx.fill();

  if (selected === horse.number) {
    ctx.strokeStyle = '#ffd44a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 29, 20, 0, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle = '#3b251b';
  ctx.beginPath(); ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(19, -2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a1711'; ctx.lineWidth = 3;
  const leg = Math.sin(now * 0.026 + horse.number) * 5;
  ctx.beginPath(); ctx.moveTo(-9, 5); ctx.lineTo(-14 + leg, 12); ctx.moveTo(6, 5); ctx.lineTo(11 - leg, 12); ctx.stroke();

  ctx.fillStyle = horse.color;
  ctx.beginPath(); ctx.arc(-1, -7, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

  ctx.fillStyle = '#121416';
  roundedRect(ctx, -11, -4, 16, 12, 3); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 9px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(horse.number), -3, 2);
  ctx.restore();

  if ((frame.phase === 'race' || frame.phase === 'final' || frame.phase === 'photo') && (horse.rank === 1 || selected === horse.number)) {
    ctx.save();
    ctx.translate(p.x, p.y - 30);
    ctx.font = '800 16px system-ui';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 5;
    ctx.strokeText(horse.name, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(horse.name, 0, 0);
    ctx.restore();
  }
}

function targetCamera(frame: MockFrame, mode: CameraMode, width: number, height: number): Camera {
  const ranked = [...frame.horses].sort((a, b) => a.rank - b.rank);
  const leader = trackPoint(ranked[0].progress, ranked[0].lane);
  const pack = ranked.slice(0, 5).map(h => trackPoint(h.progress, h.lane));
  const avg = pack.reduce((sum, p) => ({ x: sum.x + p.x / pack.length, y: sum.y + p.y / pack.length }), { x: 0, y: 0 });
  const overviewZoom = Math.min(width / 3300, height / 2100);

  if (mode === 'overview') return { x: 0, y: 0, zoom: overviewZoom };
  if (mode === 'leader') return { x: leader.x, y: leader.y, zoom: 1.32 };
  if (mode === 'broadcast') return { x: avg.x, y: avg.y, zoom: frame.phase === 'final' ? 1.08 : 0.82 };
  if (frame.phase === 'gate' || frame.phase === 'opening') return { x: 0, y: RY, zoom: 1.15 };
  if (frame.phase === 'final' || frame.phase === 'photo') return { x: 0, y: RY, zoom: 1.2 };
  return { x: avg.x, y: avg.y, zoom: 0.86 };
}

export function renderRaceFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: MockFrame,
  cameraMode: CameraMode,
  camera: Camera,
  selected: number | null,
  now: number,
) {
  const target = targetCamera(frame, cameraMode, width, height);
  const ease = 0.055;
  camera.x = lerp(camera.x, target.x, ease);
  camera.y = lerp(camera.y, target.y, ease);
  camera.zoom = lerp(camera.zoom, target.zoom, 0.04);

  ctx.fillStyle = '#07150e';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  drawTrack(ctx);
  drawGate(ctx, frame);
  [...frame.horses].sort((a, b) => b.rank - a.rank).forEach(horse => drawHorse(ctx, horse, frame, now, selected));
  ctx.restore();
}

export function initialCamera(): Camera {
  return { x: 0, y: RY, zoom: 1.15 };
}
