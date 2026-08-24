import type { CameraMode, MockFrame, RenderHorse, RunnerStyle } from './model';

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

function drawHorse(ctx: CanvasRenderingContext2D, horse: RenderHorse, frame: MockFrame, now: number, selectedNumbers: number[], runnerStyle: RunnerStyle) {
  const p = trackPoint(horse.progress, horse.lane);
  const gateOffset = frame.phase === 'gate' || frame.phase === 'opening' ? -72 * (1 - frame.gateOpen) : 0;
  const selectionIndex = selectedNumbers.indexOf(horse.number);
  const isSelected = selectionIndex >= 0;
  const focusColors = ['#ffd44a', '#38d9ff', '#ff62c7'];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.translate(gateOffset, 0);

  const running = frame.phase === 'race' || frame.phase === 'final';
  const cycle = now * 0.024 + horse.number * 0.83;
  const bob = running ? Math.sin(cycle * 2) * 1.15 : 0;
  ctx.translate(0, bob);

  // A long directional shadow reinforces head-to-tail orientation.
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(-1, 6, 31, 9, 0, 0, Math.PI * 2); ctx.fill();

  if (isSelected) {
    ctx.strokeStyle = focusColors[selectionIndex];
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(1, 0, 36, 19, 0, 0, Math.PI * 2); ctx.stroke();
  }

  if (runnerStyle === 'marker') {
    ctx.fillStyle = horse.color;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  } else {

  const coats = ['#44271b', '#5a3422', '#34241f', '#6a4028', '#2d2522'];
  const coat = coats[(horse.number - 1) % coats.length];
  const darkCoat = horse.number % 3 === 0 ? '#221714' : '#2b1a14';
  const stride = running ? Math.sin(cycle) * 7 : 0;

  // Tail: two tapered strokes trailing behind the rump.
  ctx.strokeStyle = darkCoat;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-22, -2); ctx.quadraticCurveTo(-29, -7, -35, -4 + Math.sin(cycle) * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-23, 2); ctx.quadraticCurveTo(-30, 5, -34, 1 + Math.sin(cycle + 1) * 2); ctx.stroke();

  // Legs stay close to the body in a top-down view and cycle front-to-back.
  ctx.strokeStyle = darkCoat;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-11, -6); ctx.lineTo(-18 - stride, -7);
  ctx.moveTo(-10, 6); ctx.lineTo(-18 + stride, 7);
  ctx.moveTo(11, -6); ctx.lineTo(18 + stride, -7);
  ctx.moveTo(10, 6); ctx.lineTo(18 - stride, 7);
  ctx.stroke();

  // Rump, barrel, raised neck and distinct head form one readable horse silhouette.
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.ellipse(-3, 0, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -7); ctx.quadraticCurveTo(17, -12, 22, -8); ctx.lineTo(25, 1); ctx.lineTo(12, 6); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.translate(26, -6);
  ctx.rotate(-0.18);
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = darkCoat;
  ctx.beginPath(); ctx.ellipse(7, 1, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-5, -10); ctx.lineTo(0, -5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(4, -9); ctx.lineTo(6, -3); ctx.fill();
  ctx.fillStyle = '#0b0908'; ctx.beginPath(); ctx.arc(2, -1, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Saddlecloth and a small forward-leaning jockey, instead of a large circular marker.
  ctx.fillStyle = '#111519';
  roundedRect(ctx, -11, -7, 17, 14, 3); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 9px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(horse.number), -2.5, 0.5);

  ctx.fillStyle = horse.color;
  ctx.beginPath(); ctx.ellipse(3, 0, 8, 6, -0.12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(10, -5); ctx.moveTo(1, 4); ctx.lineTo(10, 5); ctx.stroke();
  ctx.fillStyle = horse.color;
  ctx.beginPath(); ctx.arc(10, -1, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = '#181818'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(12, 2); ctx.lineTo(19, 1); ctx.stroke();
  ctx.restore();

  }

  // The number is the primary race-reading affordance. It stays upright and
  // high-contrast regardless of course direction or horse/marker style.
  const badgeX = p.x + Math.cos(p.rotation) * gateOffset;
  const badgeY = p.y + Math.sin(p.rotation) * gateOffset - (runnerStyle === 'horse' ? 22 : 0);
  ctx.save();
  ctx.translate(badgeX, badgeY);
  if (isSelected) {
    ctx.strokeStyle = focusColors[selectionIndex];
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = horse.color;
  ctx.beginPath(); ctx.arc(0, 0, runnerStyle === 'horse' ? 13 : 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '900 12px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(horse.number), 0, 0.5);
  ctx.restore();

  if (!['gate', 'opening'].includes(frame.phase) && horse.rank === 1) {
    ctx.save();
    ctx.translate(p.x, p.y - 35);
    ctx.font = '800 15px system-ui';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 5;
    ctx.strokeText(horse.name, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(horse.name, 0, 0);
    ctx.restore();
  }
}

function targetCamera(frame: MockFrame, mode: CameraMode, width: number, height: number, selectedNumbers: number[]): Camera {
  const ranked = [...frame.horses].sort((a, b) => a.rank - b.rank);
  const leader = trackPoint(ranked[0].progress, ranked[0].lane);
  const selected = ranked.filter(h => selectedNumbers.includes(h.number));
  const focusHorses = selected.length ? [...new Map([ranked[0], ...selected].map(h => [h.number, h])).values()] : ranked.slice(0, 5);
  const pack = focusHorses.map(h => trackPoint(h.progress, h.lane));
  const avg = pack.reduce((sum, p) => ({ x: sum.x + p.x / pack.length, y: sum.y + p.y / pack.length }), { x: 0, y: 0 });
  const overviewZoom = Math.min(width / 3300, height / 2100);

  if (mode === 'overview') return { x: 0, y: 0, zoom: overviewZoom };
  if (mode === 'leader') return { x: leader.x, y: leader.y, zoom: 1.32 };
  if (mode === 'broadcast') return { x: avg.x, y: avg.y, zoom: frame.phase === 'final' ? 1.08 : 0.82 };
  if (frame.phase === 'gate' || frame.phase === 'opening') return { x: 0, y: RY, zoom: 1.15 };
  const finishBlend = Math.max(0, Math.min(1, (ranked[0].progress - 0.82) / 0.18));
  const smoothFinishBlend = finishBlend * finishBlend * (3 - 2 * finishBlend);
  return {
    x: lerp(avg.x, 0, smoothFinishBlend),
    y: lerp(avg.y, RY, smoothFinishBlend),
    zoom: lerp(selected.length > 1 ? 0.76 : 0.86, 1.16, smoothFinishBlend),
  };
}

export function renderRaceFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: MockFrame,
  cameraMode: CameraMode,
  camera: Camera,
  selectedNumbers: number[],
  runnerStyle: RunnerStyle,
  now: number,
) {
  const target = targetCamera(frame, cameraMode, width, height, selectedNumbers);
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
  [...frame.horses].sort((a, b) => b.rank - a.rank).forEach(horse => drawHorse(ctx, horse, frame, now, selectedNumbers, runnerStyle));
  ctx.restore();
}

export function initialCamera(): Camera {
  return { x: 0, y: RY, zoom: 1.15 };
}
