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
      setChoice({ title, phrase, frames, result: names[index], settled: false, reduced });

      const settle = () => {
        if (operation.current !== current || document.hidden) {
          return;
        }

        apply(index);
        setChoice({ title, phrase, frames, result: names[index], settled: true, reduced });
        current.timers.push(window.setTimeout(cancel, 3000));
      };

      if (reduced) {
        settle();
      } else {
        current.timers.push(window.setTimeout(settle, 2000));
      }
    },
    [cancel],
  );

  return { choice, begin, cancel };
}
