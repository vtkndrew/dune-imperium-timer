export interface WindParticle {
  x: number;
  y: number;
  duration: number;
  phase: number;
  frames: { transform: string; offset: number }[];
}

// One forward pass: cubic spatial curves and temporal easing never bounce or wrap.
export function makeWindParticles(random = Math.random): WindParticle[] {
  const direction = random() < 0.5 ? -1 : 1;
  const slope = (random() - 0.5) * 0.5;

  return Array.from({ length: 24 }, () => {
    const distance = 120 + random() * 100;
    const endY = distance * slope + (random() - 0.5) * 30;
    const firstY = endY / 3 + (random() - 0.5) * 50;
    const secondY = (endY * 2) / 3 + (random() - 0.5) * 50;

    return {
      x: random() * 100,
      y: random() * 100,
      duration: 6000 + random() * 2000,
      phase: random() * 1000,
      frames: Array.from({ length: 65 }, (_, index) => {
        const t = index / 64;
        const y = 3 * (1 - t) ** 2 * t * firstY + 3 * (1 - t) * t ** 2 * secondY + t ** 3 * endY;

        return {
          offset: t,
          transform: `translate(${(direction * distance * t).toFixed(3)}px, ${y.toFixed(3)}px)`,
        };
      }),
    };
  });
}
