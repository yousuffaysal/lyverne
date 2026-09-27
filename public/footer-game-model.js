// Frame-rate independent gameplay. No DOM, network, or customer data.
export const MAX_LIVES = 3;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function segmentHitsCircle(a, b, target) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((target.x - a.x) * dx + (target.y - a.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(a.x + dx * t - target.x, a.y + dy * t - target.y) <= target.radius;
}
export function createRound() {
  return { score: 0, lives: MAX_LIVES, combo: 0, bestCombo: 0, lastHit: -Infinity, status: 'ready' };
}
export function loseLife(round) {
  if (round.status !== 'playing') return false;
  round.lives = Math.max(0, round.lives - 1);
  round.combo = 0;
  round.lastHit = -Infinity;
  if (!round.lives) round.status = 'over';
  return true;
}
export function sliceTarget(round, target, time) {
  if (round.status !== 'playing' || target.sliced) return null;
  target.sliced = true;
  if (target.hazard) { loseLife(round); return { points: 0, hazard: true }; }
  round.combo = time - round.lastHit < 0.75 ? Math.min(round.combo + 1, 5) : 1;
  round.lastHit = time;
  round.bestCombo = Math.max(round.bestCombo, round.combo);
  const points = 10 * round.combo;
  round.score += points;
  return { points, combo: round.combo, hazard: false };
}
export function createTarget(width, height, id, score, random = Math.random) {
  const radius = clamp(width * 0.046, 28, 53);
  const x = radius * 2 + random() * Math.max(1, width - radius * 4);
  const gravity = height * 1.3;
  const apex = height * (0.15 + random() * 0.24);
  const y = height + radius * 1.2;
  const travel = width * (0.36 + random() * 0.28);
  return {
    id, x, y, radius, gravity,
    vx: (travel - x) / 1.55,
    vy: -Math.sqrt(2 * gravity * (y - apex)),
    angle: (random() - 0.5) * 1.4, spin: (random() - 0.5) * 2.8,
    // Give the player a few clean throws to learn the gesture.
    hazard: score >= 30 && random() < 0.19,
    image: Math.floor(random() * 3), sliced: false, entered: false
  };
}
export function advanceTarget(target, dt) {
  target.x += target.vx * dt;
  target.y += target.vy * dt + 0.5 * target.gravity * dt * dt;
  target.vy += target.gravity * dt;
  target.angle += target.spin * dt;
  if (target.vy > 0) target.entered = true;
}
