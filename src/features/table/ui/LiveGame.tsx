import {
  clockOwner,
  formatTime,
  heroFor,
  intervalsAt,
  statistics,
  type Command,
  type Game,
} from '@/entities/game';
import { Stack, Button, SandwormIcon } from '@/shared/ui';

import styles from './Table.module.css';
import { useDisplayTime } from '../model/useDisplayTime';

export function LiveGame({
  game,
  disabled,
  onCommand,
  onAbility,
  onAdjust,
  onFinish,
}: {
  game: Game;
  disabled: boolean;
  onCommand: (command: Command) => void;
  onAbility: () => void;
  onAdjust: () => void;
  onFinish: () => void;
}) {
  const now = useDisplayTime();
  const stats = statistics(game, now);
  const clock = clockOwner(game);
  const ability = game.queue[0];
  const ownerId = ability?.playerId ?? game.players[game.active].id;
  const player = game.players.find((p) => p.id === ownerId) ?? game.players[0];
  const shared = game.phase === 'shared' && !ability;
  const roundShared = intervalsAt(game, now)
    .filter((i) => i.category === 'shared' && i.round === game.round)
    .reduce((sum, i) => sum + i.end - i.start, 0);
  const remaining = shared ? roundShared : stats.players[player.id].remaining;
  const phaseName = { turns: 'Ходы и раскрытие', combat: 'Сражение', shared: 'Общая подготовка' }[
    game.phase
  ];
  const blocked = disabled || game.paused;
  let clockLabel = 'СЕЙЧАС ХОДИТ';

  if (shared) {
    clockLabel = 'ВРЕМЯ ПОДГОТОВКИ';
  }

  if (ability) {
    clockLabel = 'ЛИЧНОЕ ДЕЙСТВИЕ';
  }

  if (game.paused) {
    clockLabel = 'ПАРТИЯ НА ПАУЗЕ';
  }

  return (
    <Stack as="section" className={styles.live}>
      <div className={styles.phaseBar}>
        <span>
          РАУНД <b>{game.round.toString().padStart(2, '0')}</b>
        </span>
        <strong>{phaseName}</strong>
        <span>{formatTime(stats.total)}</span>
      </div>
      <div className={`${styles.clockPanel} ${game.paused ? styles.paused : ''}`}>
        <span className={styles.clockLabel}>{clockLabel}</span>
        <h2>{shared ? 'Готовимся к раунду' : player.name}</h2>
        <div
          className={`${styles.bigTime} ${remaining < 0 ? styles.overtime : ''}`}
          role="timer"
          aria-label={shared ? 'Общий секундомер' : `Время ${player.name}`}
        >
          {formatTime(remaining)}
        </div>
        <div className={styles.clockCaption}>
          {shared
            ? 'Личное время не расходуется'
            : `${player.heroName}${remaining < 0 ? ' · Перерасход' : ''}`}
        </div>
        <div className={styles.clockOrnament} aria-hidden="true">
          ◇
        </div>
      </div>
      <div
        data-players={game.players.length}
        className={`${styles.playersGrid} ${game.players.length > 4 ? styles.manyPlayers : ''}`}
      >
        {game.players.map((p, i) => (
          <div
            key={p.id}
            data-seat={i + 1}
            data-active={clock.owner === p.id}
            className={`${styles.playerTile} ${clock.owner === p.id ? styles.activePlayer : ''}`}
            style={{ borderTopColor: p.color }}
          >
            <div>
              <strong>{p.name}</strong>
              {game.first === i && (
                <span role="img" title="Первый игрок" aria-label="Первый игрок">
                  <SandwormIcon />
                </span>
              )}
            </div>
            <b className={stats.players[p.id].remaining < 0 ? styles.negative : ''}>
              {formatTime(stats.players[p.id].remaining)}
            </b>
            <small>
              {game.phase === 'turns' && game.revealed.includes(p.id)
                ? 'Раскрытие завершено'
                : p.heroName}
            </small>
          </div>
        ))}
      </div>
      {ability && (
        <div className={styles.abilityCard}>
          <span className={styles.eyebrow}>{player.heroName}</span>
          <h3>{ability.title}</h3>
          <p>{ability.text}</p>
          <a href={ability.source} target="_blank" rel="noreferrer">
            Источник правила ↗
          </a>
        </div>
      )}
      {game.phase === 'combat' && !ability && (
        <p className={styles.phaseHint}>
          Пасы подряд:{' '}
          <strong>
            {game.passes} / {game.players.length}
          </strong>
          . Любое боевое действие начинает счёт заново.
        </p>
      )}
      {shared && (
        <div className={styles.sharedHint}>
          <p>
            Разрешите конфликт, получите награды, добавьте пряность, верните компоненты и возьмите
            карты.
          </p>
          {game.players.some((p) => p.heroId === 'chani') && (
            <p>Чани: учтите потери войск при разрешении конфликта и награды жетона тактики.</p>
          )}
          {game.players.some((p) => p.heroId === 'esmar') && (
            <p>Проверьте накопление пряности на ситче Туэка.</p>
          )}
          {game.players.some((p) => p.heroId === 'piter') && (
            <p>Питер: в начале нового раунда возьмите одну личную интригу.</p>
          )}
        </div>
      )}
      <div className={styles.mainActions}>
        {game.paused ? (
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => onCommand({ type: 'resume' })}
          >
            ▶ Продолжить
          </Button>
        ) : (
          <>
            {ability ? (
              <>
                <Button
                  variant="primary"
                  disabled={blocked}
                  onClick={() => onCommand({ type: 'ability-done' })}
                >
                  Готово →
                </Button>
                {ability.optional && (
                  <Button disabled={blocked} onClick={() => onCommand({ type: 'ability-done' })}>
                    Не применяется
                  </Button>
                )}
              </>
            ) : (
              <>
                {game.phase === 'turns' && (
                  <>
                    <Button
                      variant="primary"
                      disabled={blocked}
                      onClick={() => onCommand({ type: 'next' })}
                    >
                      Следующий ход →
                    </Button>
                    <Button disabled={blocked} onClick={() => onCommand({ type: 'reveal' })}>
                      Завершить раскрытие
                    </Button>
                  </>
                )}
                {game.phase === 'combat' && (
                  <>
                    <Button
                      variant="primary"
                      disabled={blocked}
                      onClick={() => onCommand({ type: 'pass' })}
                    >
                      Пас →
                    </Button>
                    <Button disabled={blocked} onClick={() => onCommand({ type: 'combat-action' })}>
                      Действие завершено →
                    </Button>
                  </>
                )}
                {shared && (
                  <Button
                    variant="primary"
                    disabled={blocked}
                    onClick={() => onCommand({ type: 'next-round' })}
                  >
                    Начать следующий раунд →
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className={styles.tools}>
        {!game.paused && (
          <Button disabled={disabled} onClick={() => onCommand({ type: 'pause' })}>
            Ⅱ Пауза
          </Button>
        )}
        <Button disabled={!game.undo || disabled} onClick={() => onCommand({ type: 'undo' })}>
          ↶ Отменить
        </Button>
        <Button disabled={blocked || Boolean(ability)} onClick={onAbility}>
          ◇ Способность
        </Button>
        {game.paused && (
          <Button disabled={disabled} onClick={onAdjust}>
            ± Время
          </Button>
        )}
      </div>
      {!ability && !shared && (
        <details className={styles.notes}>
          <summary>{player.heroName} · напоминание</summary>
          <p>{heroFor(player.heroId).tip}</p>
        </details>
      )}
      <div className={styles.gameFooter}>
        <span>
          <SandwormIcon /> {game.players[game.first].name} — первый игрок
        </span>
        <Button disabled={disabled} onClick={onFinish}>
          Завершить партию
        </Button>
      </div>
    </Stack>
  );
}
