import type { CSSProperties } from 'react';

import { Button, Dialog } from '@/shared/ui';

import styles from './SandChoice.module.css';
import type { SandChoice as Choice } from '../model/useSandChoice';

export function SandChoice({ choice, onClose }: { choice: Choice; onClose: () => void }) {
  const visibility = choice.settled ? 'visible' : 'hidden';

  return (
    <Dialog
      title={choice.title}
      onClose={onClose}
      actions={
        <Button
          variant="primary"
          onClick={onClose}
          style={{ visibility }}
          aria-hidden={!choice.settled}
          tabIndex={choice.settled ? 0 : -1}
        >
          Готово
        </Button>
      }
    >
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
              <i
                key={i}
                style={
                  {
                    left: `${particle.x}%`,
                    top: `${particle.y}%`,
                    '--dx': `${particle.dx}px`,
                    '--dy': `${particle.dy}px`,
                    animationDuration: `${particle.duration}ms`,
                    animationDelay: `${particle.delay}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        <div role="status" className={styles.announcement}>
          {choice.settled ? `Выбран: ${choice.result}` : ''}
        </div>
        <p className={styles.hint} style={{ visibility }} aria-hidden="true">
          {choice.phrase}
        </p>
      </div>
    </Dialog>
  );
}
