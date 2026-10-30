// Port of core/ui/jelly/JellySpring.kt and JellyMotion.kt. Units are CSS pixels.
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export class JellySpring {
  velocity = 0;
  constructor(public value: number, private stiffness: number, private dampingRatio: number) {}
  copy() { const spring = new JellySpring(this.value, this.stiffness, this.dampingRatio); spring.velocity = this.velocity; return spring; }
  isAtRest(target: number) { return Math.abs(this.value - target) < .0001 && Math.abs(this.velocity) < .0001; }
  snapTo(target: number) { this.value = target; this.velocity = 0; }
  advance(target: number, seconds: number) {
    if (this.isAtRest(target)) { this.snapTo(target); return; }
    const displacement = this.value - target;
    const frequency = Math.sqrt(this.stiffness);
    if (this.dampingRatio === 1) {
      const decay = Math.exp(-frequency * seconds);
      const coefficient = this.velocity + frequency * displacement;
      this.value = target + (displacement + coefficient * seconds) * decay;
      this.velocity = (this.velocity - frequency * coefficient * seconds) * decay;
    } else {
      const damping = this.dampingRatio * frequency;
      const damped = frequency * Math.sqrt(1 - this.dampingRatio ** 2);
      const decay = Math.exp(-damping * seconds), cosine = Math.cos(damped * seconds), sine = Math.sin(damped * seconds);
      const positionCoefficient = (this.velocity + damping * displacement) / damped;
      const velocityCoefficient = (damping * this.velocity + this.stiffness * displacement) / damped;
      this.value = target + decay * (displacement * cosine + positionCoefficient * sine);
      this.velocity = decay * (this.velocity * cosine - velocityCoefficient * sine);
    }
  }
}
export function jellyRubberBand(distance: number, dimension: number) {
  if (distance === 0 || dimension <= 0) return 0;
  const damped = (1 - 1 / (Math.abs(distance) * .14 / dimension + 1)) * dimension;
  return distance < 0 ? -damped : damped;
}
export function jellyPanelOffset(rawOffset: number, width: number) {
  if (width <= 0 || rawOffset === 0) return 0;
  const fraction = clamp(rawOffset / width, -1, 1), x = Math.abs(fraction);
  let low = 0, high = 1, parameter = x;
  for (let i = 0; i < 10; i++) {
    const bezierX = parameter ** 2 * (3 * (1 - parameter) * .58 + parameter);
    if (bezierX < x) low = parameter; else high = parameter;
    parameter = (low + high) / 2;
  }
  return (fraction < 0 ? -4 : 4) * parameter ** 2 * (3 * (1 - parameter) + parameter);
}
export type JellyFrame = { position: number; pillScaleX: number; pillScaleY: number; contentScale: number; panelOffset: number; trackScale: number; trackScaleX: number; trackOffsetY: number; originX: number; glowY: number; glowOpacity: number };
export class JellyMotion {
  private position: JellySpring;
  private velocity = new JellySpring(0, 300, .5);
  private press = new JellySpring(0, 1000, 1);
  private scaleX = new JellySpring(1, 250, .6);
  private scaleY = new JellySpring(1, 250, .7);
  private panel = new JellySpring(0, 300, 1);
  private trackY = new JellySpring(0, 240 / .9, 18 / (2 * Math.sqrt(240 * .9)));
  private trackX = new JellySpring(1, 240 / .9, 18 / (2 * Math.sqrt(240 * .9)));
  private trackPress = new JellySpring(1, 240 / .9, 18 / (2 * Math.sqrt(240 * .9)));
  private glow = new JellySpring(0, 240 / .9, 18 / (2 * Math.sqrt(240 * .9)));
  private target: number;
  private pressTarget = 0; private shapeTarget = 1; private releasePending = false;
  private downX = 0; private downY = 0; private dragStartTarget = 0; private dragStartPanel = 0; private dragStartY = 0; private movedDistance = 0;
  private originX = 0; private width = 0; private height = 64;
  dragging = false; running = false;
  constructor(initialIndex: number, private count: number) { this.target = Math.max(initialIndex, 0); this.position = new JellySpring(this.target, 1000, 1); }
  copy(): JellyMotion {
    const motion = Object.assign(new JellyMotion(this.target, this.count), this);
    for (const key of ['position', 'velocity', 'press', 'scaleX', 'scaleY', 'panel', 'trackY', 'trackX', 'trackPress', 'glow'] as const) motion[key] = this[key].copy();
    return motion;
  }
  private get maxIndex() { return Math.max(this.count - 1, 0); }
  private get tabWidth() { return Math.max((this.width - 8) / Math.max(this.count, 1), 0); }
  resize(width: number, height: number, count: number) { this.width = width; this.height = height; this.count = count; this.target = clamp(this.target, 0, this.maxIndex); if (!this.dragging) this.originX = width / 2; }
  select(index: number) { this.dragging = false; if (index >= 0) this.target = Math.min(index, this.maxIndex); this.releasePending = true; this.pressTarget = 0; this.shapeTarget = 1; this.running = true; }
  begin(x: number, y: number) {
    this.downX = x; this.downY = clamp(y, 0, this.height); this.originX = clamp(x, 0, this.width); this.dragStartY = this.trackY.value; this.movedDistance = 0;
    if (this.tabWidth > 0) this.target = clamp(Math.floor((x - 4) / this.tabWidth), 0, this.maxIndex);
    this.dragStartTarget = this.target; this.dragStartPanel = this.panel.value; this.dragging = true; this.releasePending = false; this.pressTarget = 1; this.shapeTarget = 1.3; this.panel.velocity = 0; this.running = true;
  }
  drag(dx: number, dy: number, immediate = false) {
    if (!this.dragging || this.tabWidth <= 0) return;
    this.target = clamp(this.dragStartTarget + dx / this.tabWidth, 0, this.maxIndex);
    if (immediate) this.position.snapTo(this.target);
    this.panel.snapTo(this.dragStartPanel + dx); this.trackY.snapTo(this.dragStartY + jellyRubberBand(dy, this.height) * .25); this.trackX.snapTo(1 - Math.min(Math.abs(dy) / 700, 1) * .08); this.originX = clamp(this.downX + dx, 0, this.width); this.movedDistance = Math.max(this.movedDistance, Math.abs(dx), Math.abs(dy));
  }
  finish() {
    const index = this.movedDistance < 4 && this.tabWidth > 0 ? clamp(Math.trunc(this.dragStartTarget), 0, this.maxIndex) : clamp(Math.floor(this.target + .5), 0, this.maxIndex);
    this.dragging = false; this.panel.velocity = 0; this.target = index; this.releasePending = true; this.running = true; return index;
  }
  cancel(selected: number) { this.dragging = false; this.panel.velocity = 0; this.select(selected); }
  settle(selected: number) {
    this.target = clamp(selected, 0, this.maxIndex); this.position.snapTo(this.target); this.velocity.snapTo(0); this.press.snapTo(0); this.scaleX.snapTo(1); this.scaleY.snapTo(1); this.panel.snapTo(0); this.trackY.snapTo(0); this.trackX.snapTo(1); this.trackPress.snapTo(1); this.glow.snapTo(0); this.originX = this.width / 2; this.dragging = false; this.releasePending = false; this.pressTarget = 0; this.shapeTarget = 1; this.running = false;
  }
  advance(seconds: number) {
    const delta = clamp(seconds, 0, .064); this.target = clamp(this.target, 0, this.maxIndex); this.position.advance(this.target, delta); this.velocity.advance(this.dragging && this.maxIndex > 0 ? this.position.velocity / this.maxIndex : 0, delta);
    if (!this.dragging) this.panel.advance(0, delta);
    if (this.releasePending && Math.abs(this.position.value - this.target) < Math.max(1, this.maxIndex) * .025) { this.releasePending = false; this.pressTarget = 0; this.shapeTarget = 1; }
    this.press.advance(this.pressTarget, delta); this.scaleX.advance(this.shapeTarget, delta); this.scaleY.advance(this.shapeTarget, delta); this.trackPress.advance(this.dragging ? 1.025 : 1, delta); this.glow.advance(this.dragging ? 1 : 0, delta);
    if (!this.dragging) { this.trackY.advance(0, delta); this.trackX.advance(1, delta); if (this.trackX.isAtRest(1)) this.originX = this.width / 2; }
    this.running = this.dragging || this.releasePending || !this.position.isAtRest(this.target) || !this.velocity.isAtRest(0) || !this.press.isAtRest(0) || !this.scaleX.isAtRest(1) || !this.scaleY.isAtRest(1) || !this.panel.isAtRest(0) || !this.trackY.isAtRest(0) || !this.trackX.isAtRest(1) || !this.trackPress.isAtRest(1) || !this.glow.isAtRest(0);
  }
  get frame(): JellyFrame {
    const speed = this.velocity.value / 10;
    return { position: this.position.value, pillScaleX: this.scaleX.value / (1 - clamp(speed * .75, -.2, .2)), pillScaleY: this.scaleY.value * (1 - clamp(speed * .25, -.2, .2)), contentScale: 1 + .2 * this.press.value, panelOffset: jellyPanelOffset(this.panel.value, this.width), trackScale: this.trackPress.value, trackScaleX: this.trackX.value, trackOffsetY: this.trackY.value, originX: this.originX, glowY: this.downY, glowOpacity: clamp(this.glow.value, 0, 1) };
  }
}
export function desktopNavigationLabels(style: string, home: boolean, hero: boolean, hovered: boolean, profileOpen: boolean, scrolled: boolean) {
  if (style === 'expanded') return true;
  if (style === 'compact') return false;
  if (hovered || profileOpen) return true;
  if (home && (hero || scrolled)) return false;
  return true;
}
export function jellyPillBounds(frame: JellyFrame, width: number, height: number, count: number) {
  const tabWidth = (width - 8) / count, itemHeight = height - 8;
  const centerX = 4 + (frame.position + .5) * tabWidth;
  const halfWidth = tabWidth * frame.pillScaleX / 2, halfHeight = itemHeight * frame.pillScaleY / 2, radius = Math.min(tabWidth, itemHeight) / 2;
  return { x: centerX - halfWidth, y: height / 2 - halfHeight, width: halfWidth * 2, height: halfHeight * 2, rx: radius * frame.pillScaleX, ry: radius * frame.pillScaleY };
}
export function jellyPillPath(bounds: ReturnType<typeof jellyPillBounds>) {
  const { x, y, width, height, rx, ry } = bounds, right = x + width, bottom = y + height;
  return `M ${x + rx} ${y} H ${right - rx} A ${rx} ${ry} 0 0 1 ${right} ${y + ry} V ${bottom - ry} A ${rx} ${ry} 0 0 1 ${right - rx} ${bottom} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${bottom - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
}
