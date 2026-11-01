import { expect, it, vi } from 'vitest';

import { makeWindParticles } from './wind';

it('keeps all curves moving with the wind, past the fade, without using selection randomness', () => {
  const cryptoRandom = vi.spyOn(crypto, 'getRandomValues');

  for (const value of [0, 0.2, 0.5, 0.9, 0.999999]) {
    const particles = makeWindParticles(() => value);

    expect(particles).toHaveLength(24);

    for (const p of particles) {
      expect(p.duration - p.phase).toBeGreaterThan(2800);
      expect(p.duration).toBeGreaterThanOrEqual(6000);
      expect(p.duration).toBeLessThanOrEqual(8000);
      const xs = p.frames.map((f) => Number(f.transform.match(/translate\(([-\d.]+)/)?.[1]));

      expect(xs.every((x, i) => i === 0 || (value < 0.5 ? x < xs[i - 1] : x > xs[i - 1]))).toBe(
        true,
      );
      expect(p.frames[0].offset).toBe(0);
      expect(p.frames.at(-1)?.offset).toBe(1);
    }
  }

  expect(cryptoRandom).not.toHaveBeenCalled();
  cryptoRandom.mockRestore();
});
