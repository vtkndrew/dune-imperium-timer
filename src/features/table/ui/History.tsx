import {
  EXPANSIONS,
  applicableMetrics,
  formatTime,
  isManual,
  recordDuration,
  recordTime,
  statistics,
  type ArchiveEntry,
  type ArchivedGame,
  type ResultDraft,
} from '@/entities/game';

import records from './Records.module.css';
import styles from './Table.module.css';

const date = (value: number) =>
  new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

const duration = (game: ArchivedGame) => {
  const value = recordDuration(game);

  return value === null ? 'Длительность не указана' : formatTime(value);
};

export function resultText(game: ArchivedGame) {
  return game.winnerIds
    ? game.players
        .filter((p) => game.winnerIds?.includes(p.id))
        .map((p) => p.name)
        .join(', ')
    : 'Результат не указан';
}

export function History({
  entries,
  drafts,
  onSelect,
  onDraft,
  onImport,
  onManual,
}: {
  entries: ArchiveEntry[];
  drafts: ResultDraft[];
  onSelect: (id: string) => void;
  onDraft: (id: string) => void;
  onImport: () => void;
  onManual: () => void;
}) {
  return (
    <section>
      <div className={styles.archiveHeading}>
        <div>
          <span className={styles.eyebrow}>ПОСЛЕ ПОСЛЕДНЕЙ ИНТРИГИ</span>
          <h2>История партий</h2>
        </div>
      </div>
      <div className="actions">
        <button onClick={onManual}>＋ Добавить партию вручную</button>
        <button onClick={onImport}>↓ Импорт JSON</button>
      </div>
      {drafts.length > 0 && (
        <>
          <h3>Черновики · {drafts.length}</h3>
          <div className={styles.historyList}>
            {drafts.map((draft) => (
              <button
                className={styles.historyCard}
                key={draft.id}
                onClick={() => onDraft(draft.id)}
              >
                <span>
                  {date(draft.game.startedAt)} · {draft.editingId ? 'Правки' : 'Итоги'}
                </span>
                <strong>{draft.game.players.map((p) => p.name).join(' · ')}</strong>
                <small>Продолжить заполнение →</small>
              </button>
            ))}
          </div>
        </>
      )}
      {!entries.length && (
        <div className={styles.empty}>
          <h3>У каждой партии своя история</h3>
          <p>Завершите итоги, добавьте игру вручную или перенесите из JSON.</p>
        </div>
      )}
      <div className={styles.historyList}>
        {[...entries]
          .sort((a, b) => b.game.startedAt - a.game.startedAt)
          .map(({ game, importedAt }) => (
            <button key={game.id} className={styles.historyCard} onClick={() => onSelect(game.id)}>
              <span>
                {date(game.startedAt)}
                {importedAt !== null && <small> · Импорт</small>}
                {isManual(game) && <small> · Вручную</small>}
              </span>
              <strong>{game.players.map((p) => p.name).join(' · ')}</strong>
              <div>
                <span>
                  {game.players.length} игрока · {game.round} раундов
                </span>
                <b>{duration(game)}</b>
              </div>
              <small>
                {game.winnerIds ? '♛ ' : ''}
                {resultText(game)}
                {!game.resultsConfirmed ? ' · Неполные итоги' : ''}
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
  onDelete,
}: {
  game: ArchivedGame;
  imported: boolean;
  onBack: () => void;
  onExport: () => void;
  onResult: () => void;
  onDelete: () => void;
}) {
  const stats = isManual(game) ? null : statistics(game);

  return (
    <section>
      <button className={styles.back} onClick={onBack}>
        ← Все партии
      </button>
      <span className={styles.eyebrow}>
        {date(game.startedAt)}
        {imported ? ' · ИМПОРТ' : ''}
        {isManual(game) ? ' · ВРУЧНУЮ' : ''}
      </span>
      <h2 className={styles.detailTitle}>Партия завершена.</h2>
      <p>
        {game.expansions === undefined
          ? 'Наборы не указаны'
          : [
              'База',
              ...EXPANSIONS.filter((e) => game.expansions?.includes(e.id)).map((e) => e.name),
            ].join(' · ')}{' '}
        · {game.round} раундов
      </p>
      <div className={styles.summaryGrid}>
        <div>
          <small>Длительность</small>
          <strong>{duration(game)}</strong>
        </div>
        {stats && (
          <>
            <div>
              <small>Общая подготовка</small>
              <strong>{formatTime(stats.shared)}</strong>
            </div>
            <div>
              <small>Паузы</small>
              <strong>{formatTime(stats.pause)}</strong>
            </div>
          </>
        )}
      </div>
      <div className={styles.resultCard}>
        <div>
          <small>РЕЗУЛЬТАТ</small>
          <strong>{resultText(game)}</strong>
        </div>
        <button onClick={onResult}>Изменить итоги</button>
      </div>
      <p className={records.hint}>{ratingCaption(game)}</p>
      <div className={styles.historyList}>
        {[...game.players]
          .sort((a, b) => (game.rankings?.[a.id] ?? 100) - (game.rankings?.[b.id] ?? 100))
          .map((p) => {
            const time = recordTime(game, p.id);
            const values = game.finals?.[p.id];
            const measured = stats?.players[p.id];
            const summary =
              isManual(game) && game.timing.kind === 'summary' ? game.timing.players[p.id] : null;

            return (
              <article key={p.id} className={styles.statCard} style={{ borderLeftColor: p.color }}>
                <header>
                  <div>
                    <strong>
                      {game.rankings?.[p.id] ? `${game.rankings[p.id]}. ` : ''}
                      {p.name}
                      {game.winnerIds?.includes(p.id) ? ' ♛' : ''}
                    </strong>
                    <small>{p.heroName}</small>
                  </div>
                  <b>{time === null ? 'Без таймера' : formatTime(time)}</b>
                </header>
                <dl>
                  {(['turns', 'combat', 'hero'] as const).map((key, i) => {
                    const value = measured?.[key] ?? summary?.[key];

                    return value === undefined ? null : (
                      <div key={key}>
                        <dt>{['Ходы и раскрытие', 'Сражения', 'Действия героя'][i]}</dt>
                        <dd>{formatTime(value)}</dd>
                      </div>
                    );
                  })}
                  {measured && (
                    <>
                      <div>
                        <dt>Начальный запас</dt>
                        <dd>{formatTime(p.initialMs)}</dd>
                      </div>
                      <div>
                        <dt>Поправка запаса</dt>
                        <dd>{formatTime(measured.adjustment)}</dd>
                      </div>
                      <div>
                        <dt>Осталось</dt>
                        <dd>{formatTime(measured.remaining)}</dd>
                      </div>
                    </>
                  )}
                  {applicableMetrics(game).map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{metricText(values?.[field.key])}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
      </div>
      <div className="actions">
        <button className="primary" onClick={onExport}>
          ↑ Экспорт JSON
        </button>
        <button onClick={onDelete}>Удалить партию</button>
      </div>
    </section>
  );
}

function metricText(value: number | boolean | undefined) {
  if (value === undefined) {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Да' : 'Нет';
  }

  return value;
}

function ratingCaption(game: ArchivedGame) {
  if (!game.resultsConfirmed) {
    return 'Итоги неполные. Дополните показатели и подтвердите места, чтобы учитывать партию в Elo.';
  }

  return game.rated === false ? 'Не учитывается в рейтинге.' : 'Учитывается в общем Elo.';
}
