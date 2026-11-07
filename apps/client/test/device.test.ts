import { describe, expect, it } from 'vitest';
import { classify } from '../src/perf/device';

const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';

describe('device tier classification', () => {
  it('treats phones and tablets as mobile', () => {
    expect(classify({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36', touch: 5, gpu: 'Adreno (TM) 740', cores: 8, memory: 8 })).toBe('mobile');
    expect(classify({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', touch: 5, gpu: 'Apple GPU', cores: 8, memory: 8 })).toBe('mobile');
  });
  it('puts integrated laptop graphics on low or medium', () => {
    expect(classify({ ua: desktop, touch: 0, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', cores: 4, memory: 8 })).toBe('low');
    expect(classify({ ua: desktop, touch: 0, gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', cores: 12, memory: 16 })).toBe('medium');
  });
  it('gives discrete GPUs high and software renderers low', () => {
    expect(classify({ ua: desktop, touch: 0, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11)', cores: 16, memory: 16 })).toBe('high');
    expect(classify({ ua: desktop, touch: 0, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))', cores: 16, memory: 16 })).toBe('low');
  });
});
