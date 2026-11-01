import { useEffect, useRef } from 'react';

import { Dialog } from '@/shared/ui';

import styles from './SandChoice.module.css';
import { PHRASE_REVEAL_MS, type SandChoice as Choice } from '../model/useSandChoice';
import type { WindParticle } from '../model/wind';

export function SandChoice({ choice, onClose }: { choice: Choice; onClose: () => void }) {
  const visibility = choice.settled ? 'visible' : 'hidden';

  return (
    <Dialog title={choice.title} onClose={onClose}>
      <div className={styles.sand} data-settled={choice.settled}>
        <p className={styles.caption} aria-hidden="true">
          ПЕСКИ СУДЬБЫ
        </p>
        <div className={styles.window} aria-hidden="true">
          <div
            className={styles.ribbon}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) {
                choice.finish();
              }
            }}
          >
            {choice.frames.map((name, i) => (
              <div className={styles.name} key={i}>
                {name}
              </div>
            ))}
          </div>
        </div>
        {!choice.reduced && (
          <div className={styles.particles} aria-hidden="true">
            {choice.particles.map((particle, i) => (
              <SandParticle key={i} particle={particle} />
            ))}
          </div>
        )}
        <div role="status" className={styles.announcement}>
          {choice.settled ? `Выбран: ${choice.result}` : ''}
        </div>
        <p
          className={styles.hint}
          style={{ visibility, animationDuration: `${PHRASE_REVEAL_MS}ms` }}
          aria-hidden="true"
        >
          {choice.phrase}
        </p>
      </div>
    </Dialog>
  );
}

function SandParticle({ particle }: { particle: WindParticle }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const animation = ref.current?.animate(particle.frames, {
      duration: particle.duration,
      delay: -particle.phase,
      easing: 'cubic-bezier(0.42, 0, 0.58, 1)',
      fill: 'both',
      iterations: 1,
    });

    return () => animation?.cancel();
  }, [particle]);

  return <i ref={ref} style={{ left: `${particle.x}%`, top: `${particle.y}%` }} />;
}
