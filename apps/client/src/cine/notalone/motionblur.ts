import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import * as THREE from 'three';

/**
 * Camera motion blur. Each pixel's world position (from depth) is projected with last frame's camera; the
 * difference is how far it moved across the screen while the shutter was open, and the frame is smeared
 * along that. Normalised to a 60 fps frame, so it looks the same at any frame rate. A cut (the camera
 * jumping) resets the history, so it is never smeared across.
 */
const frag = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform mat4 uPrevViewProj;
uniform float uScale;
uniform float uMaxLen;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec4 view = uProjInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  view /= view.w;
  vec4 prev = uPrevViewProj * (uViewInv * view);
  vec2 vel = (uv - (prev.xy / prev.w * 0.5 + 0.5)) * uScale;
  float len = length(vel);
  if (len > uMaxLen) vel *= uMaxLen / len;
  if (len * 1000.0 < 0.6) {
    outputColor = inputColor;
    return;
  }
  vec4 acc = inputColor;
  for (int i = 0; i < 14; i++) {
    float t = (float(i) + 0.5) / 14.0 - 0.5;
    acc += texture2D(inputBuffer, clamp(uv - vel * t, 0.0, 1.0));
  }
  outputColor = acc / 15.0;
}
`;

export class MotionBlurEffect extends Effect {
  /** shutter: 1 = the full distance moved in one 60 fps frame (heavy); 0.5 is a film camera's 180° */
  strength = 1.4;
  private prev = new THREE.Matrix4();
  private cur = new THREE.Matrix4();
  private lastPos = new THREE.Vector3();
  private lastDir = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private fresh = true;

  constructor(private cam: THREE.Camera) {
    super('MotionBlurEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uProjInv', new THREE.Uniform(new THREE.Matrix4())],
        ['uViewInv', new THREE.Uniform(new THREE.Matrix4())],
        ['uPrevViewProj', new THREE.Uniform(new THREE.Matrix4())],
        ['uScale', new THREE.Uniform(0)],
        ['uMaxLen', new THREE.Uniform(0.06)],
      ]),
    });
  }

  update(_r: THREE.WebGLRenderer, _i: THREE.WebGLRenderTarget, dt?: number) {
    const c = this.cam;
    c.updateMatrixWorld();
    this.cur.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    c.getWorldDirection(this.dir);
    const cut = this.fresh || c.position.distanceTo(this.lastPos) > 0.45 || this.dir.dot(this.lastDir) < 0.85;
    const u = this.uniforms;
    u.get('uProjInv')!.value.copy(c.projectionMatrixInverse);
    u.get('uViewInv')!.value.copy(c.matrixWorld);
    u.get('uPrevViewProj')!.value.copy(cut ? this.cur : this.prev);
    u.get('uScale')!.value = this.strength * Math.min(2, 1 / 60 / Math.max(dt ?? 1 / 60, 1 / 240));
    this.prev.copy(this.cur);
    this.lastPos.copy(c.position);
    this.lastDir.copy(this.dir);
    this.fresh = false;
  }
}
