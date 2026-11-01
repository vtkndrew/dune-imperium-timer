import { useCallback, useMemo, useState } from 'react';

import {
  HEROES,
  METRICS,
  eloHistory,
  formatTime,
  playerSummary,
  type AppData,
} from '@/entities/game';
import { Stack, Button, Field, Input, Select, Dialog } from '@/shared/ui';

import styles from './Records.module.css';

function averageText(metric: { value: number | null; count: number }, time = false) {
  if (metric.value === null) {
    return '—';
  }

  return time
    ? formatTime(metric.value)
    : metric.value.toLocaleString('ru', { maximumFractionDigits: 1 });
}

export function PlayerStatistics({
  data,
  onSelectGame,
  onRename,
}: {
  data: AppData;
  onSelectGame: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [count, setCount] = useState('');
  const [expansion, setExpansion] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const elo = useMemo(() => eloHistory(data.archive, data.profiles), [data.archive, data.profiles]);
  const entries = useMemo(
    () =>
      data.archive.filter(({ game }) => {
        if (from && game.startedAt < new Date(`${from}T00:00:00`).getTime()) {
          return false;
        }

        if (to && game.startedAt >= new Date(`${to}T00:00:00`).getTime() + 86400000) {
          return false;
        }

        if (count && game.players.length !== Number(count)) {
          return false;
        }

        if (expansion === 'base') {
          return game.expansions?.length === 0;
        }

        if (expansion === 'unknown') {
          return game.expansions === undefined;
        }

        return !expansion || game.expansions?.some((id) => id === expansion);
      }),
    [data.archive, from, to, count, expansion],
  );
  const profile = data.profiles.find((p) => p.id === selected);
  const stats = profile ? playerSummary(entries, profile.id) : null;

  const close = useCallback(() => {
    if (!busy) {
      setRenaming(false);
    }
  }, [busy]);

  const rename = async () => {
    if (!profile) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await onRename(profile.id, name);
      setRenaming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось переименовать.');
    } finally {
      setBusy(false);
    }
  };

  const rating = profile ? (elo.ratings[profile.id] ?? 1000) : 1000;
  const history = profile ? (elo.history[profile.id] ?? []) : [];
  const points = [1000, ...history.map((p) => p.rating)];
  const min = Math.floor(Math.min(...points) / 10) * 10 - 10;
  const max = Math.ceil(Math.max(...points) / 10) * 10 + 10;
  const line = points
    .map(
      (value, i) =>
        `${45 + (i * 520) / Math.max(1, points.length - 1)},${140 - ((value - min) / (max - min)) * 110}`,
    )
    .join(' ');

  return (
    <Stack as="section">
      {profile && <Button onClick={() => setSelected(null)}>← Все игроки</Button>}
      <span className={styles.eyebrow}>КАЖДАЯ ПАРТИЯ ОСТАВЛЯЕТ СЛЕД</span>
      <h2>{profile?.name ?? 'Статистика игроков'}</h2>
      {profile && (
        <Button
          onClick={(e) => {
            e.currentTarget.focus();
            setName(profile.name);
            setError('');
            setRenaming(true);
          }}
        >
          Изменить имя
        </Button>
      )}
      <div className={styles.filters}>
        <Field>
          С даты
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field>
          По дату
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field>
          Число игроков
          <Select
            aria-label="Число игроков"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          >
            <option value="">Любое</option>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <Field>
          Наборы
          <Select
            aria-label="Наборы"
            value={expansion}
            onChange={(e) => setExpansion(e.target.value)}
          >
            <option value="">Все</option>
            <option value="base">Только база</option>
            <option value="ix">С Иксом</option>
            <option value="immortality">С Бессмертием</option>
            <option value="bloodlines">С Кровными узами</option>
            <option value="unknown">Не указаны</option>
          </Select>
        </Field>
      </div>
      <p className={styles.hint}>
        Elo — общий, за всю историю. Фильтры меняют остальные показатели. Игры без измерений не
        уменьшают среднее время.
      </p>
      {!profile ? (
        <div className={styles.list}>
          {[...data.profiles]
            .sort(
              (a, b) =>
                (elo.ratings[b.id] ?? 1000) - (elo.ratings[a.id] ?? 1000) ||
                a.name.localeCompare(b.name, 'ru'),
            )
            .map((p) => {
              const summary = playerSummary(entries, p.id);

              return (
                <Button className={styles.summary} key={p.id} onClick={() => setSelected(p.id)}>
                  <header>
                    <strong>{p.name}</strong>
                    <b className={styles.rating}>{Math.round(elo.ratings[p.id] ?? 1000)} Elo</b>
                  </header>
                  <SummaryNumbers stats={summary} />
                </Button>
              );
            })}
          {!data.profiles.length && (
            <p>Выберите игроков и сыграйте первую партию или добавьте её вручную.</p>
          )}
        </div>
      ) : (
        stats && (
          <>
            <div className={styles.summary}>
              <header>
                <strong>По выбранным условиям</strong>
                <b className={styles.rating}>{Math.round(rating)} Elo</b>
              </header>
              <SummaryNumbers stats={stats} />
            </div>
            <h3>История рейтинга</h3>
            {history.length ? (
              <>
                <svg
                  viewBox="0 0 600 175"
                  role="img"
                  aria-label={`График Elo: от 1000 до ${Math.round(rating)}, ${history.length} партий`}
                  className={styles.chart}
                >
                  <text x="8" y="35" fontSize="12" fill="currentColor">
                    {max}
                  </text>
                  <text x="8" y="145" fontSize="12" fill="currentColor">
                    {min}
                  </text>
                  <path d="M45 145H570" fill="none" stroke="#dcd0bb" />
                  <polyline points={line} fill="none" stroke="#995534" strokeWidth="3" />
                  <text x="45" y="165" fontSize="11" fill="currentColor">
                    Начало
                  </text>
                  <text x="510" y="165" fontSize="11" fill="currentColor">
                    Сейчас
                  </text>
                </svg>
                <details>
                  <summary>Изменения по партиям</summary>
                  {history.map((point) => (
                    <Button
                      key={point.gameId}
                      className={styles.historyItem}
                      onClick={() => onSelectGame(point.gameId)}
                    >
                      {new Date(point.at).toLocaleDateString('ru')} · {Math.round(point.rating)} Elo{' '}
                      <small>
                        {point.delta >= 0 ? '+' : ''}
                        {point.delta.toFixed(1)}
                      </small>
                    </Button>
                  ))}
                </details>
              </>
            ) : (
              <p>Пока нет партий с подтверждёнными ПО и местами для Elo.</p>
            )}
            <h3>Герои</h3>
            <div className={styles.list}>
              {HEROES.map((hero) => {
                const summary = playerSummary(entries, profile.id, hero.id);

                return summary.games ? (
                  <article key={hero.id} className={styles.summary}>
                    <strong>{hero.name}</strong>
                    <SummaryNumbers stats={summary} />
                  </article>
                ) : null;
              })}
            </div>
            <h3>Средние конечные показатели</h3>
            <dl className={styles.metrics}>
              {METRICS.map((field) => {
                const metric = stats.metrics[field.key];

                return (
                  <div key={field.key}>
                    <dt>
                      {field.label}
                      {field.boolean ? ' · доля партий' : ''}
                    </dt>
                    <dd>
                      {field.boolean && metric.value !== null
                        ? `${Math.round(metric.value * 100)}%`
                        : averageText(metric)}
                      <small>По {metric.count} партиям</small>
                    </dd>
                  </div>
                );
              })}
            </dl>
            <h3>Партии по фильтрам</h3>
            <div className={styles.list}>
              {[...stats.records]
                .sort((a, b) => b.game.startedAt - a.game.startedAt)
                .map(({ game, player }) => (
                  <Button
                    className={styles.historyItem}
                    key={game.id}
                    onClick={() => onSelectGame(game.id)}
                  >
                    {new Date(game.startedAt).toLocaleDateString('ru')} · {player.heroName}
                    <small>
                      {game.rankings?.[player.id]
                        ? `Место ${game.rankings[player.id]}`
                        : 'Место не указано'}
                      {game.winnerIds?.includes(player.id) ? ' · Победа' : ''}
                      {game.rated === false ? ' · Без рейтинга' : ''}
                    </small>
                  </Button>
                ))}
            </div>
          </>
        )
      )}
      {renaming && profile && (
        <Dialog
          title="Имя игрока"
          onClose={close}
          actions={
            <Button variant="primary" disabled={busy} onClick={() => void rename()}>
              Сохранить имя
            </Button>
          }
        >
          <p>Имя изменится во всей текущей истории. Прежнее имя освободится.</p>
          <Field>
            Новое имя
            <Input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {error && <p role="alert">{error}</p>}
        </Dialog>
      )}
    </Stack>
  );
}

function SummaryNumbers({ stats }: { stats: ReturnType<typeof playerSummary> }) {
  return (
    <div className={styles.numbers}>
      <div>
        <small>Партий</small>
        <b>{stats.games}</b>
      </div>
      <div>
        <small>Побед</small>
        <b>{stats.wins}</b>
      </div>
      <div>
        <small>Доля побед</small>
        <b>{stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`}</b>
        <span>Из {stats.knownResults} результатов</span>
      </div>
      <div>
        <small>Средние ПО</small>
        <b>{averageText(stats.points)}</b>
        <span>По {stats.points.count} партиям</span>
      </div>
      <div>
        <small>Личное время</small>
        <b>{averageText(stats.time, true)}</b>
        <span>По {stats.time.count} партиям</span>
      </div>
    </div>
  );
}
