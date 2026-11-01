import { useCallback, useEffect, useRef, useState } from 'react';

import { randomIndex } from './random';
import { nextSandPhrase } from './sandPhrases';

export interface SandChoice {
  title: string;
  phrase: string;
  frames: string[];
  result: string;
  settled: boolean;
  reduced: boolean;
  particles: { x: number; y: number; dx: number; dy: number; duration: number; delay: number }[];
  finish: () => void;
}

export function useSandChoice() {
  const [choice, setChoice] = useState<SandChoice | null>(null);
  const operation = useRef<{ timers: number[] } | null>(null);
  const cancel = useCallback(() => {
    operation.current?.timers.forEach(window.clearTimeout);
    operation.current = null;
    setChoice(null);
  }, []);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        cancel();
      }
    };

    document.addEventListener('visibilitychange', hidden);

    return () => {
      document.removeEventListener('visibilitychange', hidden);
      operation.current?.timers.forEach(window.clearTimeout);
      operation.current = null;
    };
  }, [cancel]);
  const begin = useCallback(
    (title: string, names: string[], apply: (index: number) => void) => {
      if (operation.current || !names.length || document.hidden) {
        return;
      }

      const index = randomIndex(names.length);
      const phrase = nextSandPhrase();
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const current = { timers: [] as number[] };

      operation.current = current;
      const frames = Array.from({ length: 18 }, (_, i) => names[(index + i + 1) % names.length]);

      frames.push(names[index]);
      // Decorative randomness is sampled after the winner and never enters its selection.
      const particles = reduced
        ? []
        : Array.from({ length: 24 }, () => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
            dx: (Math.random() - 0.5) * 160,
            dy: (Math.random() - 0.5) * 120,
            duration: 1200 + Math.random() * 1600,
            delay: -Math.random() * 2400,
          }));
      let completed = false;

      const settle = () => {
        if (operation.current !== current || document.hidden || completed) {
          return;
        }

        completed = true;
        apply(index);
        setChoice({
          title,
          phrase,
          frames,
          result: names[index],
          settled: true,
          reduced,
          particles,
          finish: settle,
        });
        current.timers.push(window.setTimeout(cancel, 3000));
      };

      setChoice({
        title,
        phrase,
        frames,
        result: names[index],
        settled: false,
        reduced,
        particles,
        finish: settle,
      });

      if (reduced) {
        settle();
      }
    },
    [cancel],
  );

  return { choice, begin, cancel };
}
