import { ashGrainFrame, frontWave, type AshField } from './ashMotion';

export type AshRenderer = { canvas: HTMLCanvasElement; draw: (progress: number) => void; dispose: () => void };

function canvasFor(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * 2.6); canvas.height = Math.ceil(height * 3.6);
  Object.assign(canvas.style, { position: 'absolute', left: `${-width * .2}px`, top: `${-height * 2.6}px`, width: `${canvas.width}px`, height: `${canvas.height}px`, pointerEvents: 'none' });
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

const geometry = `
uniform vec2 uSize;
uniform vec2 uCanvas;
vec4 position(vec2 point) {
  vec2 pixel = point + vec2(uSize.x * .2, uSize.y * 2.6);
  return vec4(pixel.x / uCanvas.x * 2. - 1., 1. - pixel.y / uCanvas.y * 2., 0., 1.);
}`;
const wave = `float wave(float y, float phase) {
  return sin(y * 6.2831855 * 1.15 + phase) * .045 + sin(y * 6.2831855 * 2.4 + phase * 1.7) * .02;
}`;
const intactVertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
out vec2 vUv;
${geometry}
void main() { vUv = aCorner + .5; gl_Position = position(vUv * uSize); }`;
const intactFragment = `#version 300 es
precision highp float;
uniform sampler2D uBitmap;
uniform float uProgress;
uniform float uPhase;
in vec2 vUv;
out vec4 color;
${wave}
void main() {
  float threshold = 1. - uProgress / .5;
  // Compose clips with a 28-segment outline rather than a continuous sine.
  float stepY = min(27., floor(vUv.y * 28.));
  float frontWave = mix(wave(stepY / 28., uPhase), wave((stepY + 1.) / 28., uPhase), vUv.y * 28. - stepY);
  float boundary = clamp((threshold - .52 * (1. - vUv.y) - frontWave) / .48, 0., 1.);
  if (threshold <= -.1 || vUv.x > boundary) discard;
  vec4 sampleColor = texture(uBitmap, vUv);
  color = vec4(sampleColor.rgb * sampleColor.a, sampleColor.a);
}`;
const grainVertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aGrid;
layout(location=2) in vec4 aMotion;
layout(location=3) in vec3 aSwirl;
uniform sampler2D uBitmap;
uniform float uProgress;
uniform vec2 uCell;
flat out vec4 vColor;
${geometry}
void main() {
  float local = (uProgress - aMotion.x) / .5;
  float alpha = 1. - smoothstep(.45, 1., local);
  if (local <= 0. || local >= 1. || alpha < .02) {
    gl_Position = vec4(-2., -2., 0., 1.); vColor = vec4(0.); return;
  }
  float ease = local * local;
  float soft = ease * (3. - 2. * local);
  float rise = uSize.y * 1.2 * aMotion.z * (.15 * soft + .85 * ease * (1. + .4 * local));
  float t1 = aSwirl.x + local * 6.2831855 * aSwirl.y;
  float t2 = (aGrid.x * 2.3 + aGrid.y * 3.7) * 6.2831855 + uProgress * 6.2831855;
  float mx = (sin(t2) * .65 + sin(t1) * aSwirl.z + cos(t2 * .5 + local * 6.2831855 * 1.3) * .4) * uSize.x * .14 * soft;
  float my = (cos(t2 * .8) * .5 + sin(t1 * .7 + 1.3) * aSwirl.z * .6) * uSize.y * .05 * soft;
  vec2 center = aGrid * uSize + vec2(aMotion.y * ease * uSize.x * .6 + mx, -rise + my);
  gl_Position = position(center + aCorner * uCell * (1. - .4 * soft));
  vec2 sampleUv = (floor(aGrid * (uSize - 1.)) + .5) / uSize;
  vec4 sampleColor = texture(uBitmap, sampleUv);
  float a = sampleColor.a * alpha;
  vColor = vec4(min(vec3(1.), sampleColor.rgb * aMotion.w) * a, a);
}`;
const grainFragment = `#version 300 es
precision highp float;
flat in vec4 vColor;
out vec4 color;
void main() { color = vColor; }`;

/** Upload once; each display frame changes two uniforms and submits two draws.
 * The same field and motion equations drive the Canvas fallback below. */
export function createGpuAshRenderer(bitmap: HTMLCanvasElement, field: AshField): AshRenderer | null {
  const width = bitmap.width, height = bitmap.height;
  const canvas = canvasFor(width, height);
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl || typeof gl.createVertexArray !== 'function') return null;
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = [], buffers: WebGLBuffer[] = [], arrays: WebGLVertexArrayObject[] = [];
  const texture = gl.createTexture();
  const dispose = () => {
    programs.forEach(p => gl.deleteProgram(p)); shaders.forEach(s => gl.deleteShader(s));
    buffers.forEach(b => gl.deleteBuffer(b)); arrays.forEach(a => gl.deleteVertexArray(a)); gl.deleteTexture(texture);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // A tainted bitmap throws here. Keep the established non-CORS fallback.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    const program = (vertex: string, fragment: string) => {
      const result = gl.createProgram()!; programs.push(result);
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
        const shader = gl.createShader(type)!; shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Ash shader unavailable');
        gl.attachShader(result, shader);
      }
      gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error('Ash program unavailable');
      gl.useProgram(result);
      gl.uniform2f(gl.getUniformLocation(result, 'uSize'), width, height);
      gl.uniform2f(gl.getUniformLocation(result, 'uCanvas'), canvas.width, canvas.height);
      gl.uniform1i(gl.getUniformLocation(result, 'uBitmap'), 0);
      return result;
    };
    const intact = program(intactVertex, intactFragment), grains = program(grainVertex, grainFragment);
    const corners = gl.createBuffer()!; buffers.push(corners); gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
    const vao = () => {
      const array = gl.createVertexArray()!; arrays.push(array); gl.bindVertexArray(array); gl.bindBuffer(gl.ARRAY_BUFFER, corners);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); return array;
    };
    const intactArray = vao(), grainArray = vao();
    const data = new Float32Array(field.grains.length * 9);
    field.grains.forEach((g, i) => data.set([g.nx, g.ny, g.delay, g.dirX, g.speed, g.shade, g.phase, g.frequency, g.amplitude], i * 9));
    const instances = gl.createBuffer()!; buffers.push(instances); gl.bindBuffer(gl.ARRAY_BUFFER, instances); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (const [location, size, offset] of [[1, 2, 0], [2, 4, 2], [3, 3, 6]]) {
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 36, offset * 4); gl.vertexAttribDivisor(location, 1);
    }
    gl.useProgram(grains); gl.uniform2f(gl.getUniformLocation(grains, 'uCell'), width / field.cols + .6, height / field.rows + .6);
    gl.useProgram(intact); gl.uniform1f(gl.getUniformLocation(intact, 'uPhase'), field.wavePhase);
    const intactProgress = gl.getUniformLocation(intact, 'uProgress'), grainProgress = gl.getUniformLocation(grains, 'uProgress');
    gl.viewport(0, 0, canvas.width, canvas.height); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Ash graphics unavailable');
    canvas.dataset.ashRenderer = 'webgl2';
    return { canvas, dispose, draw: progress => {
      if (gl.isContextLost()) throw new Error('Ash context lost');
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(intact); gl.uniform1f(intactProgress, progress); gl.bindVertexArray(intactArray); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(grains); gl.uniform1f(grainProgress, progress); gl.bindVertexArray(grainArray); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, field.grains.length);
    } };
  } catch { dispose(); return null; }
}

export function createCanvasAshRenderer(bitmap: HTMLCanvasElement, field: AshField): AshRenderer {
  const width = bitmap.width, height = bitmap.height;
  const canvas = canvasFor(width, height), context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  let colors: string[] | undefined, atlas: HTMLCanvasElement | undefined;
  try {
    const pixels = bitmap.getContext('2d')!.getImageData(0, 0, width, height).data;
    colors = field.grains.map(grain => {
      const offset = (Math.floor(grain.ny * (height - 1)) * width + Math.floor(grain.nx * (width - 1))) * 4;
      return `rgba(${Math.min(255, pixels[offset] * grain.shade)},${Math.min(255, pixels[offset + 1] * grain.shade)},${Math.min(255, pixels[offset + 2] * grain.shade)},${pixels[offset + 3] / 255})`;
    });
  } catch {
    atlas = document.createElement('canvas'); atlas.width = field.cols; atlas.height = field.rows;
    const palette = atlas.getContext('2d')!;
    field.grains.forEach((grain, index) => {
      palette.filter = `brightness(${grain.shade})`;
      palette.drawImage(bitmap, Math.floor(grain.nx * (width - 1)), Math.floor(grain.ny * (height - 1)), 1, 1, index % field.cols, Math.floor(index / field.cols), 1, 1);
    });
  }
  const grainFrame = { x: 0, y: 0, scale: 0, alpha: 0 };
  canvas.dataset.ashRenderer = 'canvas2d';
  return { canvas, dispose: () => {}, draw: p => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save(); context.translate(width * .2, height * 2.6);
    const threshold = 1 - p / .5;
    if (threshold > -.1) {
      context.save(); context.beginPath();
      for (let i = 0; i <= 28; i++) {
        const ny = i / 28;
        const boundary = (threshold - .52 * (1 - ny) - frontWave(ny, field.wavePhase)) / .48;
        const x = Math.min(width, Math.max(0, boundary * width));
        if (i === 0) context.moveTo(x, ny * height); else context.lineTo(x, ny * height);
      }
      context.lineTo(0, height); context.lineTo(0, 0); context.closePath(); context.clip(); context.drawImage(bitmap, 0, 0); context.restore();
    }
    field.grains.forEach((grain, index) => {
      const tile = ashGrainFrame(grain, p, width, height, grainFrame);
      if (!tile) return;
      const w = (width / field.cols + .6) * tile.scale, h = (height / field.rows + .6) * tile.scale;
      context.globalAlpha = tile.alpha;
      if (colors) { context.fillStyle = colors[index]; context.fillRect(tile.x - w / 2, tile.y - h / 2, w, h); }
      else context.drawImage(atlas!, index % field.cols, Math.floor(index / field.cols), 1, 1, tile.x - w / 2, tile.y - h / 2, w, h);
    });
    context.restore();
  } };
}
