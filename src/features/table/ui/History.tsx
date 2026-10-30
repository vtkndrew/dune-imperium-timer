import { formatTime, statistics, type ArchiveEntry, type Game } from '@/entities/game';

import styles from './Table.module.css';

const date = (value: number) =>
  new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

export function resultText(game: Game) {
  return game.winnerIds
    ? game.players
        .filter((p) => game.winnerIds?.includes(p.id))
        .map((p) => p.name)
        .join(', ')
    : 'Результат не указан';
}

export function History({
  entries,
  onSelect,
  onImport,
}: {
  entries: ArchiveEntry[];
  onSelect: (id: string) => void;
  onImport: () => void;
}) {
  return (
    <section>
      <div className={styles.archiveHeading}>
        <div>
          <span className={styles.eyebrow}>ПОСЛЕ ПОСЛЕДНЕЙ ИНТРИГИ</span>
          <h2>История партий</h2>
        </div>
        <button onClick={onImport}>↓ Импорт JSON</button>
      </div>
      {!entries.length && (
        <div className={styles.empty}>
          <span aria-hidden="true">⌛</span>
          <h3>У каждой партии своя история</h3>
          <p>
            Завершённые игры появятся здесь.
            <br />
            Или перенесите партию из JSON-файла.
          </p>
        </div>
      )}
      <div className={styles.historyList}>
        {[...entries]
          .sort((a, b) => b.game.startedAt - a.game.startedAt)
          .map(({ game, importedAt }) => (
            <button key={game.id} className={styles.historyCard} onClick={() => onSelect(game.id)}>
              <span>
                {date(game.startedAt)}
                {importedAt && <small> · Импорт</small>}
              </span>
              <strong>{game.players.map((p) => p.name).join(' · ')}</strong>
              <div>
                <span>
                  {game.players.length} игрока · {game.round} раундов
                </span>
                <b>{formatTime(statistics(game).total)}</b>
              </div>
              <small>
                {game.winnerIds ? '♛ ' : ''}
                {resultText(game)}
              </small>
            </button>
          ))}
      </div>
      <p className={styles.footnote}>
        История хранится на этом устройстве. Экспортируйте важные партии.
      </p>
    </section>
  );
}

export function GameDetails({
  game,
  imported,
  onBack,
  onExport,
  onResult,
}: {
  game: Game;
  imported: boolean;
  onBack: () => void;
  onExport: () => void;
  onResult: () => void;
}) {
  const stats = statistics(game);

  return (
    <section>
      <button className={styles.back} onClick={onBack}>
        ← Все партии
      </button>
      <span className={styles.eyebrow}>
        {date(game.startedAt)}
        {imported ? ' · ИМПОРТ' : ''}
      </span>
      <h2 className={styles.detailTitle}>Партия завершена.</h2>
      <div className={styles.summaryGrid}>
        <div>
          <small>Длительность</small>
          <strong>{formatTime(stats.total)}</strong>
        </div>
        <div>
          <small>Раундов</small>
          <strong>{game.round}</strong>
        </div>
        <div>
          <small>Общее время</small>
          <strong>{formatTime(stats.shared)}</strong>
        </div>
        <div>
          <small>Паузы</small>
          <strong>{formatTime(stats.pause)}</strong>
        </div>
      </div>
      <div className={styles.resultCard}>
        <div>
          <small>{game.winnerIds ? 'ПОБЕДИТЕЛЬ' : 'РЕЗУЛЬТАТ'}</small>
          <strong>{resultText(game)}</strong>
        </div>
        <button onClick={onResult}>Изменить</button>
      </div>
      <h3>Время каждого игрока</h3>
      <div className={styles.historyList}>
        {game.players.map((p) => {
          const stat = stats.players[p.id];

          return (
            <article key={p.id} className={styles.statCard} style={{ borderLeftColor: p.color }}>
              <header>
                <div>
                  <strong>
                    {p.name}
                    {game.winnerIds?.includes(p.id) ? ' ♛' : ''}
                  </strong>
                  <small>{p.heroName}</small>
                </div>
                <b>{formatTime(stat.total)}</b>
              </header>
              <dl>
                <div>
                  <dt>Ходы и раскрытие</dt>
                  <dd>{formatTime(stat.turns)}</dd>
                </div>
                <div>
                  <dt>Сражения</dt>
                  <dd>{formatTime(stat.combat)}</dd>
                </div>
                <div>
                  <dt>Действия героя</dt>
                  <dd>{formatTime(stat.hero)}</dd>
                </div>
                <div>
                  <dt>Начальный запас</dt>
                  <dd>{formatTime(p.initialMs)}</dd>
                </div>
                {stat.adjustment !== 0 && (
                  <div>
                    <dt>Поправка запаса</dt>
                    <dd>{formatTime(stat.adjustment)}</dd>
                  </div>
                )}
                <div>
                  <dt>Осталось</dt>
                  <dd className={stat.remaining < 0 ? styles.negative : ''}>
                    {formatTime(stat.remaining)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
      <button className={`primary ${styles.start}`} onClick={onExport}>
        ↑ Экспорт JSON
      </button>
      <p className={styles.footnote}>Один файл — одна партия. Состав, герои, время и результат.</p>
    </section>
  );
}
