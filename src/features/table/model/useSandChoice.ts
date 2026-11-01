import { useCallback, useEffect, useRef, useState } from 'react';

import { randomIndex } from './random';
import { nextSandPhrase } from './sandPhrases';
import { makeWindParticles, type WindParticle } from './wind';

export interface SandChoice {
  title: string;
  phrase: string;
  frames: string[];
  result: string;
  settled: boolean;
  reduced: boolean;
  particles: WindParticle[];
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
      const particles = reduced ? [] : makeWindParticles();
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
