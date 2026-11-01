import { useCallback, useState } from 'react';

import {
  COLORS,
  HEROES,
  applicableMetrics,
  compareFinish,
  changeFinalValue,
  recordTime,
  formatTime,
  heroFor,
  isManual,
  makePlayer,
  resultProblems,
  suggestedRanks,
  type ArchivedGame,
  type Expansion,
  type MetricKey,
  type Player,
  type Profile,
  type ResultDraft,
} from '@/entities/game';
import { TrophyIcon, Stack, Button, Field, Input, Select, Checkbox } from '@/shared/ui';

import { ExpansionPicker, ProfilePicker } from './Choices';
import styles from './Records.module.css';

const localDate = (at: number) =>
  new Date(at - new Date(at).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function ResultEditor({
  draft,
  profiles,
  onChange,
  onSave,
  onBack,
  onDiscard,
  disabled,
}: {
  draft: ResultDraft;
  profiles: Profile[];
  onChange: (draft: ResultDraft) => void;
  onSave: () => void;
  onBack: () => void;
  onDiscard: () => void;
  disabled: boolean;
}) {
  const [choose, setChoose] = useState<number | null>(null);
  const game = draft.game;
  const manual = isManual(game);
  const proposal = suggestedRanks(game);
  const effectiveRanks = { ...proposal.ranks, ...game.rankings };
  const problems = resultProblems({ ...game, rankings: effectiveRanks });
  const patch = useCallback(
    (next: ArchivedGame) => onChange({ ...draft, game: next }),
    [draft, onChange],
  );
  const patchPlayer = useCallback(
    (index: number, value: Partial<Player>) =>
      patch({
        ...game,
        players: game.players.map((p, i) => (i === index ? { ...p, ...value } : p)),
      }),
    [game, patch],
  );
  const closeChoose = useCallback(() => setChoose(null), []);

  const chooseProfile = useCallback(
    (profile: { id?: string; name: string }) => {
      if (choose !== null) {
        patchPlayer(choose, { profileId: profile.id, name: profile.name });
      }
    },
    [choose, patchPlayer],
  );

  const changeExpansions = useCallback(
    (expansions: Expansion[]) => {
      const keys = applicableMetrics({ expansions }).map((f) => f.key);
      const finals = Object.fromEntries(
        Object.entries(game.finals ?? {}).map(([id, values]) => [
          id,
          Object.fromEntries(
            Object.entries(values).filter(([key]) => keys.includes(key as MetricKey)),
          ),
        ]),
      );

      patch({ ...game, expansions, finals });
    },
    [game, patch],
  );

  const changeMetric = (playerId: string, key: MetricKey, value: number | boolean | undefined) => {
    patch(changeFinalValue(game, playerId, key, value));
  };

  const changeCount = (count: number) => {
    if (!isManual(game)) {
      return;
    }

    const players = game.players.slice(0, count);

    while (players.length < count) {
      players.push(makePlayer(players.length));
    }

    const ids = new Set(players.map((p) => p.id));

    patch({
      ...game,
      players: players.map((p, i) =>
        COLORS.slice(0, count > 4 ? 6 : 4).includes(p.color) ? p : { ...p, color: COLORS[i] },
      ),
      finals: Object.fromEntries(Object.entries(game.finals ?? {}).filter(([id]) => ids.has(id))),
      rankings: {},
      sharedPlacesConfirmed: false,
      timing: {
        ...game.timing,
        players: Object.fromEntries(
          Object.entries(game.timing.players).filter(([id]) => ids.has(id)),
        ),
      },
    });
  };

  const changeTime = (
    playerId: string,
    key: 'total' | 'turns' | 'combat' | 'hero',
    raw: string,
  ) => {
    if (!isManual(game)) {
      return;
    }

    const value = raw === '' ? undefined : Math.round(Number(raw) * 60000);

    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 31536000000)) {
      return;
    }

    const time = { ...(game.timing.players[playerId] ?? { total: null }) };

    if (key === 'total') {
      time.total = value ?? null;
    } else if (value === undefined) {
      delete time[key];
    } else {
      time[key] = value;
    }

    patch({
      ...game,
      timing: { ...game.timing, players: { ...game.timing.players, [playerId]: time } },
    });
  };

  return (
    <Stack as="section" className={styles.editor}>
      <Button onClick={onBack}>← История</Button>
      <span className={styles.eyebrow}>
        {draft.editingId ? 'ПРАВКИ СОХРАНЯЮТСЯ В ЧЕРНОВИК' : 'ЧЕРНОВИК ИТОГОВ'}
      </span>
      <h2>{manual ? 'Добавить партию' : 'Часы остановлены.'}</h2>
      <p className={styles.hint}>
        Укажите ПО после эффектов конца игры и подтвердите места. Остальная статистика
        необязательна. Можно вернуться позже или начать новую партию.{' '}
        {draft.editingId && 'Прежние результаты действуют до подтверждения правок.'}
      </p>
      <Stack as="fieldset" disabled={disabled} className={styles.bodyFieldset}>
        {manual && (
          <div className={styles.fieldGrid}>
            <Field>
              Дата и время партии
              <Input
                type="datetime-local"
                value={localDate(game.startedAt)}
                onChange={(e) => {
                  const at = new Date(e.target.value).getTime();

                  if (Number.isFinite(at)) {
                    patch({ ...game, startedAt: at, endedAt: at + (game.timing.duration ?? 0) });
                  }
                }}
              />
            </Field>
            <Field>
              Раундов
              <Input
                type="number"
                min={1}
                max={10000}
                value={game.round}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  if (Number.isInteger(value) && value >= 1 && value <= 10000) {
                    patch({ ...game, round: value });
                  }
                }}
              />
            </Field>
            <Field>
              Участников
              <Select
                value={game.players.length}
                onChange={(e) => changeCount(Number(e.target.value))}
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </Field>
            <Field>
              Длительность партии, мин (если известна)
              <Input
                type="number"
                min={0}
                step="any"
                value={game.timing.duration === null ? '' : game.timing.duration / 60000}
                onChange={(e) => {
                  const duration =
                    e.target.value === '' ? null : Math.round(Number(e.target.value) * 60000);

                  if (
                    duration === null ||
                    (Number.isSafeInteger(duration) && duration >= 0 && duration <= 31536000000)
                  ) {
                    patch({
                      ...game,
                      endedAt: game.startedAt + (duration ?? 0),
                      timing: { ...game.timing, duration },
                    });
                  }
                }}
              />
            </Field>
            <Field inline className={styles.check}>
              <Checkbox
                checked={game.timing.kind === 'none'}
                onChange={(e) =>
                  patch({
                    ...game,
                    timing: {
                      ...game.timing,
                      kind: e.target.checked ? 'none' : 'summary',
                      players: {},
                    },
                  })
                }
              />
              Без таймера
            </Field>
          </div>
        )}
        <details>
          <summary>Настройки партии — дополнения</summary>
          <ExpansionPicker value={game.expansions ?? []} onChange={changeExpansions} />
        </details>
        <div className={styles.resultPlayers}>
          {game.players.map((player, index) => (
            <Stack
              as="article"
              key={player.id}
              data-player-id={player.id}
              aria-label={`Итоги: ${player.name}`}
              className={styles.playerEditor}
            >
              <h3>{player.name}</h3>
              <p className={styles.hint}>{player.heroName}</p>
              {!manual && (
                <p className={styles.hint}>
                  Измеренное личное время: {formatTime(recordTime(game, player.id) ?? 0)}
                </p>
              )}
              <Field>
                Победные очки
                <Input
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  required
                  inputMode="numeric"
                  value={String(game.finals?.[player.id]?.points ?? '')}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value = Number(raw);

                    if (
                      raw === '' ||
                      (Number.isSafeInteger(value) && value >= 0 && value <= 1000000)
                    ) {
                      changeMetric(player.id, 'points', raw === '' ? undefined : value);
                    }
                  }}
                />
              </Field>
              <details>
                <summary>Изменить участника и героя</summary>
                <Stack>
                  <Button
                    onClick={(e) => {
                      e.currentTarget.focus();
                      setChoose(index);
                    }}
                  >
                    Выбрать профиль: {player.name}
                  </Button>
                  <Field>
                    Герой
                    <Select
                      aria-label={`Герой ${player.name}`}
                      value={player.heroId}
                      onChange={(e) => {
                        const hero = heroFor(e.target.value);

                        patchPlayer(index, { heroId: hero.id, heroName: hero.name });
                      }}
                    >
                      {HEROES.map((hero) => (
                        <option key={hero.id} value={hero.id}>
                          {hero.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </Stack>
              </details>
              <details>
                <summary>Дополнительная статистика</summary>
                <p className={styles.hint}>
                  Заполняйте только известные значения. Пустое поле не означает ноль или «Нет».
                </p>
                <div className={styles.fieldGrid}>
                  {applicableMetrics(game)
                    .filter((field) => field.key !== 'points')
                    .map((field) => (
                      <Field key={field.key}>
                        {field.label}
                        {field.boolean ? (
                          <Select
                            aria-label={field.label}
                            value={
                              game.finals?.[player.id]?.[field.key] === undefined
                                ? ''
                                : String(game.finals?.[player.id]?.[field.key])
                            }
                            onChange={(e) =>
                              changeMetric(
                                player.id,
                                field.key,
                                e.target.value === '' ? undefined : e.target.value === 'true',
                              )
                            }
                          >
                            <option value="">Не указано</option>
                            <option value="true">Да</option>
                            <option value="false">Нет</option>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={field.max ?? 1000000}
                            step={1}
                            value={String(game.finals?.[player.id]?.[field.key] ?? '')}
                            onChange={(e) => {
                              const value = Number(e.target.value);

                              if (e.target.value === '') {
                                changeMetric(player.id, field.key, undefined);
                              } else if (
                                Number.isInteger(value) &&
                                value >= 0 &&
                                value <= (field.max ?? 1000000)
                              ) {
                                changeMetric(player.id, field.key, value);
                              }
                            }}
                          />
                        )}
                      </Field>
                    ))}
                </div>
              </details>
              {isManual(game) && game.timing.kind === 'summary' && (
                <Stack as="fieldset">
                  <legend>Личное время</legend>
                  <Field>
                    Общий расход, мин
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={
                        game.timing.players[player.id]?.total == null
                          ? ''
                          : Number(game.timing.players[player.id].total) / 60000
                      }
                      onChange={(e) => changeTime(player.id, 'total', e.target.value)}
                    />
                  </Field>
                  <details>
                    <summary>Разбивка времени — необязательно</summary>
                    <p>
                      Если заполняете, укажите все три категории. Их сумма должна совпадать с общим
                      расходом.
                    </p>
                    <Stack>
                      {(['turns', 'combat', 'hero'] as const).map((key, i) => (
                        <Field key={key}>
                          {['Ходы и раскрытие, мин', 'Сражения, мин', 'Действия героя, мин'][i]}
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            value={
                              game.timing.players[player.id]?.[key] === undefined
                                ? ''
                                : Number(game.timing.players[player.id][key]) / 60000
                            }
                            onChange={(e) => changeTime(player.id, key, e.target.value)}
                          />
                        </Field>
                      ))}
                    </Stack>
                  </details>
                </Stack>
              )}
            </Stack>
          ))}
        </div>
        <Stack className={styles.review}>
          <h3>Итоговые места</h3>
          <p>
            Места предложены по убыванию ПО. При равных очках укажите фактический порядок.
            Дополнительная статистика не влияет на места.
          </p>
          {!proposal.ready && <p>Введите ПО всех игроков, чтобы определить места.</p>}
          {proposal.ready &&
            proposal.sorted.map((p, i) => {
              const group = proposal.unresolved.find((g) => g.includes(p.id));
              const first = group
                ? proposal.sorted.findIndex((candidate) => group.includes(candidate.id)) + 1
                : 0;

              return (
                <div className={styles.rankRow} key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {i > 0
                        ? compareFinish(game, proposal.sorted[i - 1].id, p.id).reason
                        : 'Начало итогового порядка'}
                    </small>
                  </div>
                  {group ? (
                    <Field>
                      Место
                      <Select
                        aria-label={`Место: ${p.name}`}
                        value={game.rankings?.[p.id] ?? ''}
                        onChange={(e) => {
                          const rankings = { ...game.rankings };

                          if (e.target.value) {
                            rankings[p.id] = Number(e.target.value);
                          } else {
                            delete rankings[p.id];
                          }

                          patch({ ...game, rankings, sharedPlacesConfirmed: false });
                        }}
                      >
                        <option value="">Уточните</option>
                        {Array.from({ length: group.length }, (_, offset) => first + offset).map(
                          (rank) => (
                            <option key={rank}>{rank}</option>
                          ),
                        )}
                      </Select>
                    </Field>
                  ) : (
                    <b>
                      {effectiveRanks[p.id] === 1 && <TrophyIcon />} {effectiveRanks[p.id]}
                    </b>
                  )}
                </div>
              );
            })}
          {proposal.unresolved.length > 0 && (
            <>
              <p>Совместное место допустимо только после явного подтверждения ниже.</p>
              <Field inline className={styles.check}>
                <Checkbox
                  checked={game.sharedPlacesConfirmed ?? false}
                  onChange={(e) => patch({ ...game, sharedPlacesConfirmed: e.target.checked })}
                />
                Подтверждаю совместное место, если оно указано
              </Field>
            </>
          )}
          <Field inline className={styles.check}>
            <Checkbox
              checked={game.rated === false}
              onChange={(e) => patch({ ...game, rated: !e.target.checked })}
            />
            Не учитывать в рейтинге
          </Field>
          {problems.length > 0 && (
            <div role="status" className={styles.validation}>
              <strong>Осталось заполнить или исправить: {problems.length}</strong>
              <ul>
                {problems.slice(0, 8).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="primary" disabled={disabled || problems.length > 0} onClick={onSave}>
            Подтвердить итоги и сохранить
          </Button>
        </Stack>
      </Stack>
      <Button className={styles.discard} onClick={onDiscard} disabled={disabled}>
        Удалить черновик
      </Button>
      {choose !== null && (
        <ProfilePicker
          profiles={profiles}
          excluded={game.players.filter((_, i) => i !== choose).map((p) => p.profileId ?? '')}
          onChoose={chooseProfile}
          onClose={closeChoose}
        />
      )}
    </Stack>
  );
}
