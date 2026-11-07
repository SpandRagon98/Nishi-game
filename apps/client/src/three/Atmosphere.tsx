import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { runtime } from '../game/runtime';

/**
 * Night mist for Nishipur Junction: height-weighted exponential fog (dense near the ground and in the
 * passage, thinner under the roof), drifting fog banks, dust caught in torch beams, a moon, and a
 * night-sky environment map so wet floors and rails pick up teal and sodium highlights.
 */

export const MIST_COLOR = '#0f1e23';
export const SKY_COLOR = '#060d10';
export const MOON_DIR = new THREE.Vector3(-0.32, 0.3, 0.9).normalize();

// ───────── height fog: patch three's fog chunks once, before any shader compiles ─────────
let patched = false;
export function installHeightFog() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n#endif';
  C.fog_vertex =
    '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogWorld = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;\n#endif';
  C.fog_pars_fragment =
    '#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n\t#ifdef FOG_EXP2\n\t\tuniform float fogDensity;\n\t#else\n\t\tuniform float fogNear;\n\t\tuniform float fogFar;\n\t#endif\n#endif';
  C.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogH = clamp( ( vFogWorld.y + 1.2 ) / 4.5, 0.0, 1.0 );
		float fogN = sin( vFogWorld.x * 0.31 + vFogWorld.z * 0.17 ) * sin( vFogWorld.z * 0.23 - vFogWorld.x * 0.11 ) * 0.5 + 0.5;
		float fogD = fogDensity * mix( 1.75, 0.55, fogH ) * ( 0.8 + 0.4 * fogN );
		float fogFactor = 1.0 - exp( - fogD * fogD * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}
installHeightFog();

// ───────── night environment (for reflections only) ─────────
export function makeNightEnvironment(gl: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uMoon: { value: MOON_DIR.clone() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uMoon; varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 c = mix(vec3(0.02,0.035,0.04), vec3(0.09,0.2,0.22), smoothstep(-0.3, 0.05, y));
          c = mix(c, vec3(0.03,0.07,0.08), smoothstep(0.05, 0.8, y));
          float m = max(dot(vDir, uMoon), 0.0);
          c += vec3(0.55,0.75,0.78) * pow(m, 400.0) * 6.0 + vec3(0.1,0.18,0.2) * pow(m, 12.0);
          // warm sodium lamps along the horizon
          float lamps = pow(max(0.0, 1.0 - abs(y + 0.02) * 20.0), 3.0) * (0.5 + 0.5 * sin(vDir.x * 40.0));
          c += vec3(0.5, 0.28, 0.08) * lamps * 0.6;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(gl);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  sky.geometry.dispose();
  (sky.material as THREE.Material).dispose();
  return tex;
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────── moon ─────────
export function Moon() {
  const ref = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const mats = useMemo(() => {
    const disc = canvasTexture(256, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(236,244,240,1)');
      g.addColorStop(0.42, 'rgba(214,230,228,1)');
      g.addColorStop(0.47, 'rgba(160,200,205,0.35)');
      g.addColorStop(1, 'rgba(120,170,180,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      // maria
      c.globalCompositeOperation = 'multiply';
      for (const [x, y, r] of [[0.42, 0.4, 0.09], [0.56, 0.47, 0.07], [0.47, 0.58, 0.06], [0.6, 0.36, 0.04]]) {
        c.fillStyle = 'rgba(170,185,185,0.7)';
        c.beginPath();
        c.arc(x * s, y * s, r * s, 0, Math.PI * 2);
        c.fill();
      }
    });
    const glow = canvasTexture(256, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(150,210,215,0.55)');
      g.addColorStop(0.3, 'rgba(90,150,160,0.18)');
      g.addColorStop(1, 'rgba(60,110,120,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });
    return {
      disc: new THREE.SpriteMaterial({ map: disc, fog: false, depthWrite: false, transparent: true }),
      halo: new THREE.SpriteMaterial({ map: glow, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }),
    };
  }, []);
  useFrame(() => {
    const e = runtime.eye;
    const p = new THREE.Vector3(e.x, e.y, e.z).addScaledVector(MOON_DIR, 320);
    ref.current?.position.copy(p);
    halo.current?.position.copy(p);
  });
  return (
    <>
      <sprite ref={halo} material={mats.halo} scale={[150, 150, 1]} renderOrder={-2} />
      <sprite ref={ref} material={mats.disc} scale={[34, 34, 1]} renderOrder={-1} />
    </>
  );
}

// ───────── drifting fog banks ─────────
const BANKS: [number, number, number, number][] = [];
{
  // x range, y, z range, count per area
  const areas: [number, number, number, number, number, number][] = [
    [-44, 44, 0.4, 0.5, 7.5, 56], // platform
    [-50, 56, -0.7, 8.5, 19, 64], // track bed
    [-19, -1, 0.6, -13, -1, 12], // waiting hall
    [-29, 29, -3.0, 2.4, 4.6, 20], // passage
    [-12, -8, 0.5, -21, -15, 4], // exit corridor
    [56, 63, 0, 9, 14, 6], // tunnel mouth
  ];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [x0, x1, y, z0, z1, n] of areas) {
    for (let i = 0; i < n; i++) BANKS.push([x0 + rnd() * (x1 - x0), y + rnd() * 0.9, z0 + rnd() * (z1 - z0), 3 + rnd() * 5]);
  }
}

export function MistBanks() {
  const { geo, mat } = useMemo(() => {
    const tex = canvasTexture(128, (c, s) => {
      const img = c.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const dx = x / s - 0.5;
          const dy = y / s - 0.5;
          const r = Math.sqrt(dx * dx + dy * dy) * 2;
          let n = 0;
          let a = 0.5;
          let f = 4;
          for (let o = 0; o < 4; o++) {
            n += a * (Math.sin(x * f * 0.05 + o * 1.7) * Math.sin(y * f * 0.043 + o * 2.3) * 0.5 + 0.5);
            a *= 0.5;
            f *= 2;
          }
          const v = Math.max(0, 1 - r) ** 1.6 * (0.55 + n * 0.6);
          const i = (y * s + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = Math.min(255, v * 255);
        }
      }
      c.putImageData(img, 0, 0);
    });
    tex.colorSpace = THREE.NoColorSpace;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    g.setAttribute('aBank', new THREE.InstancedBufferAttribute(new Float32Array(BANKS.flat()), 4));
    g.instanceCount = BANKS.length;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTex: { value: tex }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#4f7178') } },
      vertexShader: /* glsl */ `
        uniform float uTime; attribute vec4 aBank; varying vec2 vUv; varying float vFade;
        void main() {
          vUv = uv;
          vec3 c = aBank.xyz;
          float k = aBank.x * 1.7 + aBank.z * 0.9;
          c.x += sin(uTime * 0.05 + k) * 1.5 + uTime * 0.08;
          c.x = mod(c.x + 60.0, 124.0) - 60.0;
          c.z += cos(uTime * 0.04 + k) * 0.8;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(0.0, 1.0, 0.0);
          float size = aBank.w;
          vec3 p = c + right * position.x * size * 1.6 + up * position.y * size * 0.55;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vFade = smoothstep(0.8, 4.0, d) * (1.0 - smoothstep(30.0, 45.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uColor; varying vec2 vUv; varying float vFade;
        void main() {
          float a = texture2D(uTex, vUv).a * 0.26 * vFade;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    return { geo: g, mat: m };
  }, []);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}

// ───────── dust motes, visible only inside torch beams ─────────
export const torch = { on: false, strength: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), cos: 0.9 };

export function DustMotes({ count = 900 }: { count?: number }) {
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([Math.random() * 12, Math.random() * 6, Math.random() * 12], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uTorchPos: { value: new THREE.Vector3() },
        uTorchDir: { value: new THREE.Vector3() }, uTorch: { value: 0 }, uCos: { value: 0.9 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uCam; uniform vec3 uTorchPos; uniform vec3 uTorchDir; uniform float uTorch; uniform float uCos;
        attribute float aSeed; varying float vA;
        void main() {
          vec3 p = position;
          p += vec3(sin(uTime * 0.21 + aSeed * 40.0), sin(uTime * 0.13 + aSeed * 17.0) - uTime * 0.02, cos(uTime * 0.17 + aSeed * 23.0)) * 0.6;
          p = mod(p - uCam + vec3(6.0, 3.0, 6.0), vec3(12.0, 6.0, 12.0)) + uCam - vec3(6.0, 3.0, 6.0);
          vec3 d = p - uTorchPos;
          float len = length(d);
          float inBeam = smoothstep(uCos, uCos + 0.04, dot(d / len, uTorchDir)) * (1.0 - smoothstep(4.0, 10.0, len));
          vA = inBeam * uTorch * (0.4 + 0.6 * fract(aSeed * 13.7));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(22.0 / -mv.z, 1.0, 4.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c)) * vA * 0.55;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a);
        }`,
    });
    return { geo: g, mat: m };
  }, [count]);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    u.uTime.value += dt;
    (u.uCam.value as THREE.Vector3).set(runtime.eye.x, runtime.eye.y, runtime.eye.z);
    (u.uTorchPos.value as THREE.Vector3).copy(torch.pos);
    (u.uTorchDir.value as THREE.Vector3).copy(torch.dir);
    u.uTorch.value = torch.on ? torch.strength : 0;
    u.uCos.value = torch.cos;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** Scene-wide fog/background/environment. */
export function useNightSky() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    scene.background = new THREE.Color(SKY_COLOR);
    scene.fog = new THREE.FogExp2(MIST_COLOR, 0.058);
    const env = makeNightEnvironment(gl);
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    return () => env.dispose();
  }, [scene, gl]);
}
