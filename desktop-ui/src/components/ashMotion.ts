// Direct port of core/ui/DisintegrationEffect.kt. Random fields vary per removal,
// as they do in Compose; the front, distributions and trajectories are shared.
export const ASH_DURATION_MS = 1500;
export const ASH_FADE_MS = 300;
const TAU = 6.2831855;
const LIFE = .5;
export const frontWave = (ny: number, phase: number) => Math.sin(ny * TAU * 1.15 + phase) * .045 + Math.sin(ny * TAU * 2.4 + phase * 1.7) * .02;
const clamp = (n: number, low = 0, high = 1) => Math.min(high, Math.max(low, n));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createAshField(width: number, height: number, random = Math.random) {
  const aspect = height / width;
  let cols = 130;
  let rows = Math.max(8, Math.floor(cols * aspect));
  if (cols * rows > 26000) { cols = Math.max(12, Math.floor(Math.sqrt(26000 / aspect))); rows = Math.max(8, Math.floor(cols * aspect)); }
  const wavePhase = random() * TAU;
  const grains = Array.from({ length: cols * rows }, (_, index) => {
    const nx = (index % cols + .5) / cols;
    const ny = (Math.floor(index / cols) + .5) / rows;
    const shade = .8 + random() * .34;
    const front = .52 * (1 - ny) + .48 * nx + frontWave(ny, wavePhase);
    return { nx, ny, shade, delay: clamp((1 - front) * (1 - LIFE) - random() * .05, 0, 1 - LIFE),
      dirX: .55 + (random() - .4) * 1.3, speed: .7 + random() * .7,
      phase: random() * TAU, frequency: 1.1 + random() * 1.8, amplitude: .6 + random() * .9 };
  });
  return { cols, rows, wavePhase, grains };
}
export type AshField = ReturnType<typeof createAshField>;
type AshFrame = { x: number; y: number; scale: number; alpha: number };
export function ashGrainFrame(grain: AshField['grains'][number], p: number, width: number, height: number, output?: AshFrame) {
  const local = (p - grain.delay) / LIFE;
  if (local <= 0 || local >= 1) return null;
  const alpha = 1 - smoothstep(.45, 1, local);
  if (alpha < .02) return null;
  const ease = local * local;
  const soft = local * local * (3 - 2 * local);
  const rise = height * 1.2 * grain.speed * (.15 * soft + .85 * ease * (1 + .4 * local));
  const t1 = grain.phase + local * TAU * grain.frequency;
  const t2 = (grain.nx * 2.3 + grain.ny * 3.7) * TAU + p * TAU;
  const meanderX = (Math.sin(t2) * .65 + Math.sin(t1) * grain.amplitude + Math.cos(t2 * .5 + local * TAU * 1.3) * .4) * width * .14 * soft;
  const meanderY = (Math.cos(t2 * .8) * .5 + Math.sin(t1 * .7 + 1.3) * grain.amplitude * .6) * height * .05 * soft;
  const result = output ?? { x: 0, y: 0, scale: 0, alpha: 0 };
  result.x = grain.nx * width + grain.dirX * ease * width * .6 + meanderX;
  result.y = grain.ny * height - rise + meanderY;
  result.scale = 1 - .4 * soft; result.alpha = alpha;
  return result;
}

/** Compose FastOutSlowInEasing = cubic-bezier(.4, 0, .2, 1). */
export function ashProgress(fraction: number) {
  const x = clamp(fraction);
  let low = 0, high = 1;
  for (let i = 0; i < 18; i++) {
    const t = (low + high) / 2;
    const bezierX = 3 * (1 - t) ** 2 * t * .4 + 3 * (1 - t) * t * t * .2 + t ** 3;
    if (bezierX < x) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1 - t) * t * t + t ** 3;
}
