import { Dialog } from '@/shared/ui';

import styles from './SandChoice.module.css';
import type { SandChoice as Choice } from '../model/useSandChoice';

export function SandChoice({ choice, onClose }: { choice: Choice; onClose: () => void }) {
  return (
    <Dialog title={choice.title} onClose={onClose}>
      <div
        className={`${styles.sand} ${choice.settled ? styles.settled : ''}`}
        data-settled={choice.settled}
      >
        <p className={styles.caption} aria-hidden="true">
          {choice.settled ? 'ВЫБОР СДЕЛАН' : 'ПЕСКИ СУДЬБЫ'}
        </p>
        <div className={styles.window} aria-hidden="true">
          {choice.reduced || choice.settled ? (
            <div className={styles.name}>{choice.result}</div>
          ) : (
            <div className={styles.ribbon}>
              {choice.frames.map((name, i) => (
                <div className={styles.name} key={i}>
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
        {!choice.reduced && <div className={styles.particles} aria-hidden="true" />}
        <div role="status" className={styles.announcement}>
          {choice.settled ? `Выбран: ${choice.result}` : ''}
        </div>
        <p className={styles.hint} aria-hidden="true">
          {choice.settled ? choice.phrase : 'Судьба скрыта в песках Арракиса'}
        </p>
      </div>
      {choice.settled && (
        <button className="primary" onClick={onClose}>
          Готово
        </button>
      )}
    </Dialog>
  );
}
